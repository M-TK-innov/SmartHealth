/**
 * Ce que le praticien a corrige, deduit d'un avant et d'un apres.
 *
 * Quand un medecin reprend une transcription, il produit sans le savoir un
 * exemple annote : « la machine a entendu ceci, il fallait cela ». C'est la
 * seule source d'apprentissage qu'un poste hors ligne possede, et elle est
 * gratuite — elle existe deja, elle n'etait simplement pas ramassee.
 *
 * CE QUE CE MODULE NE FAIT PAS : il n'apprend rien tout seul. Il propose des
 * couples. La decision de les appliquer est prise ailleurs, et seulement apres
 * confirmation par la repetition. Une correction apprise a tort abimerait en
 * silence toutes les transcriptions suivantes — c'est exactement le type
 * d'erreur que le reste de l'application s'emploie a rendre impossible.
 *
 * Module PUR : aucune base, aucun reseau. Il est teste tel qu'il tourne.
 */

export interface CoupleCorrige {
  /** Ce que la machine avait ecrit. */
  avant: string;
  /** Ce que le praticien a mis a la place. */
  apres: string;
  /** Quelques mots autour, pour qu'un relecteur puisse juger sans rouvrir le dossier. */
  contexte: string;
}

/**
 * Longueur maximale, en mots, d'un couple retenu.
 *
 * Au-dela, ce n'est plus une correction de terme mais une reecriture de phrase :
 * la generaliser reviendrait a apprendre une tournure propre a UNE consultation,
 * et a la replaquer sur les suivantes.
 */
const MOTS_MAX = 4;

/** En dessous, le couple est trop court pour etre distinctif (« a » -> « la »). */
const CARACTERES_MIN = 3;

/**
 * Ressemblance minimale entre le avant et l'apres.
 *
 * C'EST LE FILTRE QUI COMPTE, et la longueur ne le remplace pas.
 *
 * On ne veut apprendre qu'une chose : les mots que la machine a MAL ENTENDUS.
 * Une mauvaise audition laisse une trace — « arthemeter » et « artemether »
 * s'ecrivent presque pareil parce qu'ils se prononcent pareil. Une reformulation
 * n'en laisse aucune : « il faudrait revenir » et « revenez » veulent dire la
 * meme chose sans se ressembler du tout.
 *
 * Retenir les reformulations serait apprendre le style d'un praticien un jour
 * donne, puis le replaquer sur les consultations des autres.
 */
const RESSEMBLANCE_MIN = 0.45;

/** Distance d'edition, sur deux chaines deja normalisees. */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let precedente = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const courante = [i];
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      courante[j] = Math.min(courante[j - 1] + 1, precedente[j] + 1, precedente[j - 1] + cout);
    }
    precedente = courante;
  }
  return precedente[b.length];
}

/**
 * Le avant et l'apres se ressemblent-ils assez pour etre une mauvaise audition ?
 *
 * Le cas de l'abreviation est traite a part : « palu » et « paludisme » ne sont
 * pas proches au sens de la distance d'edition, mais l'un est le debut de
 * l'autre — et c'est une correction que l'on veut apprendre.
 */
export function seRessemblent(avant: string, apres: string): boolean {
  const a = normaliser(avant);
  const b = normaliser(apres);
  if (!a || !b) return false;

  const court = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (court.length >= CARACTERES_MIN && long.startsWith(court)) return true;

  return 1 - distance(a, b) / Math.max(a.length, b.length) >= RESSEMBLANCE_MIN;
}

/** Pour comparer sans se laisser arreter par la casse, les accents, la ponctuation. */
export function normaliser(mot: string): string {
  return mot
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function mots(texte: string): string[] {
  return texte.split(/\s+/).filter(Boolean);
}

/**
 * Plus longue sous-suite commune, sur les mots normalises.
 *
 * On travaille sur les mots et non les caracteres : une correction utile porte
 * sur un terme, pas sur une lettre, et le bruit d'un diff caractere par
 * caractere noierait le signal.
 */
function ancrages(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        normaliser(a[i]) === normaliser(b[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

/**
 * Couples corriges entre deux versions d'un meme texte.
 *
 * Les segments identiques servent d'ancrage ; ce qui differe entre deux
 * ancrages est un couple candidat.
 */
export function couplesCorriges(avant: string, apres: string): CoupleCorrige[] {
  const a = mots(avant ?? '');
  const b = mots(apres ?? '');
  if (a.length === 0 || b.length === 0) return [];

  const table = ancrages(a, b);
  const couples: CoupleCorrige[] = [];

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (normaliser(a[i]) === normaliser(b[j])) {
      i++;
      j++;
      continue;
    }

    // Debut d'une divergence : on avance des deux cotes jusqu'au prochain ancrage.
    const debutA = i;
    const debutB = j;
    while (i < a.length && j < b.length && normaliser(a[i]) !== normaliser(b[j])) {
      if (table[i + 1][j] >= table[i][j + 1]) i++;
      else j++;
    }

    // Plus aucun ancrage devant : tout ce qui reste des deux cotes appartient a
    // CETTE divergence. Sans cela, une correction en fin de texte serait coupee
    // en deux moities — un retrait sans remplacement, puis un ajout sans
    // origine — et aucune des deux ne serait retenue. Or la derniere phrase
    // d'une consultation porte la conduite a tenir : c'est souvent la que le
    // praticien corrige.
    if (i >= a.length || j >= b.length) {
      i = a.length;
      j = b.length;
    }

    const candidat = retenir(a.slice(debutA, i).join(' '), b.slice(debutB, j).join(' '), b, debutB, j);
    if (candidat) couples.push(candidat);
  }

  return couples;
}

/**
 * Un couple merite-t-il d'etre retenu ?
 *
 * Tout ce qui est ecarte ici l'est pour une raison : un couple trop long est
 * une reecriture, un couple vide est un ajout ou une suppression pure, et une
 * difference qui disparait a la normalisation n'est qu'une affaire de casse ou
 * d'accent — la corriger n'apprendrait rien et polluerait le lexique.
 */
function retenir(avant: string, apres: string, tousLesMots: string[], debut: number, fin: number): CoupleCorrige | null {
  if (mots(avant).length > MOTS_MAX || mots(apres).length > MOTS_MAX) return null;

  // Couvre deux cas d'un coup, et c'est voulu : un cote vide — le praticien a
  // ajoute ou supprime, il n'a rien corrige, il n'y a donc pas de couple — et
  // un mot trop court pour etre distinctif, « a » -> « la », dont
  // l'application partout ferait des degats sans rien apporter.
  if (avant.length < CARACTERES_MIN || apres.length < CARACTERES_MIN) return null;
  if (normaliser(avant) === normaliser(apres)) return null;

  // Le filtre central : on n apprend que ce que la machine a mal ENTENDU, pas
  // ce que le praticien a reformule.
  if (!seRessemblent(avant, apres)) return null;

  // Un chiffre qui change est une DONNEE, pas un terme : une posologie, une
  // temperature, un age. L'apprendre reviendrait a replaquer la valeur d'un
  // patient sur les suivants — l'erreur la plus grave que ce module puisse
  // commettre.
  if (/\d/.test(avant) || /\d/.test(apres)) return null;

  const gauche = tousLesMots.slice(Math.max(0, debut - 4), debut).join(' ');
  const droite = tousLesMots.slice(fin, fin + 4).join(' ');
  return {
    avant,
    apres,
    contexte: `${gauche} [${apres}] ${droite}`.trim(),
  };
}

/**
 * Regroupe les couples identiques d'un meme lot.
 *
 * Une meme faute corrigee trois fois dans une consultation reste UN
 * enseignement, pas trois : la compter trois fois la ferait franchir le seuil
 * de confirmation a elle seule, alors que rien ne dit qu'elle se reproduira
 * ailleurs.
 */
export function regrouper(couples: CoupleCorrige[]): CoupleCorrige[] {
  const vus = new Map<string, CoupleCorrige>();
  for (const c of couples) {
    const cle = `${normaliser(c.avant)}>${normaliser(c.apres)}`;
    if (!vus.has(cle)) vus.set(cle, c);
  }
  return [...vus.values()];
}
