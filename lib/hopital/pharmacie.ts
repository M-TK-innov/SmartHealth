/**
 * Pharmacie : stock par lot, peremption, dispensation.
 *
 * TROIS INVARIANTS, dans cet ordre de gravite :
 *
 *   1. UN LOT PERIME NE SORT PAS. Jamais, pas meme avec une derogation, pas
 *      meme s'il ne reste que lui. Un antibiotique perime n'est pas un
 *      antibiotique moins efficace : c'est un traitement qui echoue pendant
 *      qu'on croit traiter.
 *
 *   2. LE STOCK NE DEVIENT PAS NEGATIF. Un stock negatif est toujours le
 *      signe qu'on a servi ce qu'on n'avait pas ; l'accepter « pour
 *      regulariser plus tard » rend tout l'inventaire inexploitable.
 *
 *   3. UNE DISPENSATION PARTIELLE SE DIT. Servir trois comprimes sur vingt
 *      sans le nommer, c'est renvoyer un patient avec un traitement
 *      incomplet qu'il croit complet — et personne ne le saura avant la
 *      consultation suivante, s'il revient.
 *
 * FEFO et non FIFO : on sort d'abord ce qui PERIME le plus tot, pas ce qui
 * est arrive le plus tot. Un lot recu recemment mais proche de sa date doit
 * partir avant un lot ancien a longue peremption, sinon il se perime en
 * rayon pendant qu'on sert l'autre.
 *
 * Module PUR : ni base ni horloge implicite. La date du jour est toujours
 * passee en parametre, pour que la peremption se teste sans attendre.
 */

export interface Lot {
  id: string;
  articleId: string;
  /** Numero de lot du fabricant, celui qu'on lit sur la boite. */
  numero: string;
  /** Date de peremption, au format AAAA-MM-JJ. */
  perimeLe: string;
  /** Unites restantes. Jamais negatif. */
  quantite: number;
}

export interface Article {
  id: string;
  /** Denomination commune internationale. */
  dci: string;
  forme: string | null;
  dosage: string | null;
  /** Seuil en dessous duquel il faut recommander. */
  seuilAlerte: number;
}

export type MotifRefusPharmacie =
  | 'QUANTITE_INVALIDE'
  | 'ARTICLE_INCONNU'
  | 'STOCK_INSUFFISANT'
  | 'TOUT_PERIME'
  | 'ALLERGIE';

export interface RefusPharmacie {
  ok: false;
  motif: MotifRefusPharmacie;
  message: string;
  remede: string;
}

export type DecisionPharmacie<T> = { ok: true; resultat: T } | RefusPharmacie;

function refuse(motif: MotifRefusPharmacie, message: string, remede: string): RefusPharmacie {
  return { ok: false, motif, message, remede };
}

/**
 * Un lot est-il encore servable le jour dit ?
 *
 * La comparaison est faite sur les CHAINES AAAA-MM-JJ, qui s'ordonnent
 * lexicographiquement comme des dates. Passer par Date() ferait entrer le
 * fuseau du poste dans une decision de peremption : un lot servable a
 * Cotonou et refuse ailleurs, pour le meme jour.
 *
 * Le jour de peremption lui-meme est EXCLU. Une boite marquee « 03/2026 »
 * n'est pas garantie le 31 mars au soir ; la servir ce jour-la, c'est jouer
 * sur une bordure qui n'a aucune raison d'etre jouee.
 */
export function servable(lot: Lot, aujourdhui: string): boolean {
  return lot.quantite > 0 && lot.perimeLe > aujourdhui;
}

/** Lots servables, du plus proche de la peremption au plus lointain (FEFO). */
export function ordreDeSortie(lots: Lot[], aujourdhui: string): Lot[] {
  return lots
    .filter((l) => servable(l, aujourdhui))
    .sort((a, b) => (a.perimeLe < b.perimeLe ? -1 : a.perimeLe > b.perimeLe ? 1 : 0));
}

export function disponible(lots: Lot[], aujourdhui: string): number {
  return ordreDeSortie(lots, aujourdhui).reduce((n, l) => n + l.quantite, 0);
}

export interface PrelevementLot {
  lotId: string;
  numero: string;
  perimeLe: string;
  quantite: number;
}

export interface Dispensation {
  articleId: string;
  /** Ce qui sort, lot par lot. */
  prelevements: PrelevementLot[];
  /** Total reellement servi. */
  servi: number;
  /** Ce qui manque, quand la dispensation est partielle. */
  manquant: number;
  partielle: boolean;
}

export interface DemandeDispensation {
  articleId: string;
  /** Denomination, pour le controle d'allergie et les messages. */
  dci: string;
  quantite: number;
  lots: Lot[];
  /** Denominations auxquelles le patient est allergique. */
  allergies: string[];
  aujourdhui: string;
  /**
   * Autorise a servir moins que demande. Par defaut NON : une dispensation
   * partielle doit etre un choix explicite du pharmacien, pas le
   * comportement par defaut d'un ecran valide trop vite.
   */
  accepterPartiel?: boolean;
}

/**
 * Prepare une dispensation : ce qui sort, de quels lots, et ce qui manque.
 *
 * Ne modifie rien — elle decide. L'ecriture du stock revient a l'appelant,
 * qui l'applique dans une transaction.
 */
export function dispenser(d: DemandeDispensation): DecisionPharmacie<Dispensation> {
  if (!Number.isInteger(d.quantite) || d.quantite < 1) {
    return refuse(
      'QUANTITE_INVALIDE',
      'La quantite a dispenser doit etre un nombre entier d unites, au moins 1.',
      'Corriger la quantite.',
    );
  }

  const allergie = d.allergies.find((a) => memeSubstance(a, d.dci));
  if (allergie) {
    return refuse(
      'ALLERGIE',
      `Le dossier signale une allergie a ${allergie}.`,
      'Revenir vers le prescripteur pour une alternative. Ne pas servir sur avis telephonique seul.',
    );
  }

  const utilisables = ordreDeSortie(d.lots, d.aujourdhui);

  if (utilisables.length === 0) {
    // On distingue « aucun lot » de « tous les lots perimes » : le remede
    // n'est pas le meme, et le second demande en plus de retirer les boites
    // du rayon avant que quelqu'un ne les serve.
    const avaitDuStock = d.lots.some((l) => l.quantite > 0);
    return avaitDuStock
      ? refuse(
          'TOUT_PERIME',
          `Tous les lots de ${d.dci} en rayon sont perimes.`,
          'Les retirer du rayon et les mettre en destruction, puis commander en urgence.',
        )
      : refuse(
          'STOCK_INSUFFISANT',
          `${d.dci} est en rupture.`,
          'Commander, et prevenir le prescripteur pour qu il envisage une alternative.',
        );
  }

  const prelevements: PrelevementLot[] = [];
  let reste = d.quantite;
  for (const lot of utilisables) {
    if (reste === 0) break;
    const pris = Math.min(reste, lot.quantite);
    prelevements.push({ lotId: lot.id, numero: lot.numero, perimeLe: lot.perimeLe, quantite: pris });
    reste -= pris;
  }

  const servi = d.quantite - reste;

  if (reste > 0 && !d.accepterPartiel) {
    return refuse(
      'STOCK_INSUFFISANT',
      `Il manque ${reste} unite${reste > 1 ? 's' : ''} de ${d.dci} : ${servi} disponible${servi > 1 ? 's' : ''} sur ${d.quantite} demandee${d.quantite > 1 ? 's' : ''}.`,
      `Servir ${servi} en dispensation partielle et le noter sur l ordonnance, ou orienter vers une autre pharmacie.`,
    );
  }

  return {
    ok: true,
    resultat: {
      articleId: d.articleId,
      prelevements,
      servi,
      manquant: reste,
      partielle: reste > 0,
    },
  };
}

/**
 * Deux denominations designent-elles la meme substance ?
 *
 * Comparaison volontairement LARGE : « amoxicilline », « Amoxicilline 500 mg »
 * et « amoxicilline/acide clavulanique » doivent tous declencher sur une
 * allergie a l'amoxicilline. En controle d'allergie, un faux positif
 * renvoie vers le prescripteur ; un faux negatif envoie un choc
 * anaphylactique. Les deux erreurs ne se valent pas.
 *
 * La correspondance se fait N'IMPORTE OU dans le nom, et non sur une
 * frontiere de mot. Une regle de frontiere paraissait plus sure ; elle
 * creait en fait le defaut exact que la doctrine ci-dessus interdit, parce
 * que les denominations portent leur classe en SUFFIXE : un patient
 * allergique aux thiazides recevait de l'hydrochloro-thiazide sans le
 * moindre signalement, et il en allait de meme pour « -cilline ».
 *
 * Plancher a quatre caracteres : sans lui, une allergie saisie « a » ou
 * « RAS » — ce que produit une fiche remplie vite — bloquerait la moitie de
 * la pharmacie. Un pharmacien qui voit l'alerte partout apprend a passer
 * outre, et il passera alors outre le vrai cas.
 *
 * CE QUE CECI NE COUVRE PAS, et qui doit se savoir : les allergies CROISEES
 * entre substances aux noms differents. Une allergie a la penicilline ne
 * declenche pas sur l'amoxicilline, parce qu'aucune comparaison de chaines
 * ne peut l'inferer. Cela demande une table de classes therapeutiques ; le
 * controle a la prescription reste le filet principal.
 */
const LONGUEUR_MIN = 4;

function memeSubstance(a: string, b: string): boolean {
  const n = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9/ ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const ga = n(a);
  const gb = n(b);
  if (!ga || !gb) return false;

  // Chaque composant d'une association est compare separement.
  const composants = (s: string) => s.split('/').map((x) => x.trim()).filter(Boolean);
  for (const ca of composants(ga)) {
    for (const cb of composants(gb)) {
      const court = ca.length <= cb.length ? ca : cb;
      const long = ca.length <= cb.length ? cb : ca;
      if (court.length >= LONGUEUR_MIN && long.includes(court)) return true;
    }
  }
  return false;
}

// ------------------------------------------------------------------ alertes

export interface AlerteStock {
  articleId: string;
  dci: string;
  /** Unites servables aujourd'hui. */
  disponible: number;
  seuilAlerte: number;
  /** Unites deja perimees, encore en rayon : a retirer. */
  perimees: number;
  /** Unites qui perimeront dans les trente jours. */
  bientotPerimees: number;
  niveau: 'rupture' | 'bas' | 'perime' | 'ok';
}

export const HORIZON_PEREMPTION_JOURS = 30;

/**
 * L'etat d'un article en rayon.
 *
 * « bientot perime » est affiche a part parce que c'est le seul chiffre sur
 * lequel on peut encore agir : un lot deja perime est une perte, un lot qui
 * perime dans trois semaines peut encore etre servi en priorite ou transfere
 * vers un centre qui en consomme davantage.
 */
export function alerteStock(article: Article, lots: Lot[], aujourdhui: string): AlerteStock {
  const dispo = disponible(lots, aujourdhui);
  const perimees = lots.filter((l) => !servable(l, aujourdhui) && l.quantite > 0).reduce((n, l) => n + l.quantite, 0);
  const limite = dansNJours(aujourdhui, HORIZON_PEREMPTION_JOURS);
  const bientot = lots
    .filter((l) => servable(l, aujourdhui) && l.perimeLe <= limite)
    .reduce((n, l) => n + l.quantite, 0);

  return {
    articleId: article.id,
    dci: article.dci,
    disponible: dispo,
    seuilAlerte: article.seuilAlerte,
    perimees,
    bientotPerimees: bientot,
    niveau:
      dispo === 0 ? (perimees > 0 ? 'perime' : 'rupture') : dispo <= article.seuilAlerte ? 'bas' : 'ok',
  };
}

/** AAAA-MM-JJ, n jours plus tard. */
export function dansNJours(jour: string, n: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
