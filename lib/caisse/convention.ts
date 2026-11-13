/**
 * Ce que l'assurance prend en charge, et ce qui reste au patient.
 *
 * MODULE PUR : ni base, ni horloge.
 *
 * LA REGLE QUI TIENT TOUT : SANS CONVENTION CONNUE, RIEN N'EST PRIS EN
 * CHARGE. Pas « a moitie », pas « au taux habituel ». Un patient couvert dont
 * la convention n'est pas enregistree paie tout, l'ecran le dit, et quelqu'un
 * va la saisir. Appliquer un taux approche produirait l'inverse exact de ce
 * que l'assurance pour tous cherche a obtenir : un reste a charge qu'aucune
 * des deux parties ne reconnait, decouvert a la caisse.
 *
 * DEUX FORMES DE PRISE EN CHARGE, PARCE QUE LES DEUX EXISTENT :
 *
 *   - un TAUX, en pourcentage de l'acte. C'est la forme des regimes
 *     nationaux ;
 *   - un PLAFOND en francs, au-dela duquel le patient paie. C'est la forme
 *     des mutuelles locales, et c'est elle que porte deja la colonne
 *     `part_tiers` des factures.
 *
 * Les deux se combinent : on applique le taux, puis on borne au plafond. Un
 * regime qui couvre 80 % dans la limite de 20 000 francs se dit ainsi, et
 * c'est la forme la plus courante des conventions reelles.
 */

/** Une regle de prise en charge, telle qu'un etablissement l'a enregistree. */
export interface Convention {
  /** Le regime : « ARCH », « mutuelle-oueme »... */
  regime: string;
  /** Le code au bareme couvert, ou `*` pour tout acte. */
  code: string;
  /** Part couverte, en pourcentage entier de 0 a 100. */
  taux: number;
  /**
   * Plafond en francs SUR LA FACTURE, ou null.
   *
   * SUR LA FACTURE, ET NON SUR L'ACTE. Un plafond applique acte par acte se
   * multiplie par le nombre de lignes et ne plafonne plus rien : une
   * mutuelle qui couvre 20 000 francs en a verse 30 000 des la cinquieme
   * ligne. C'est le defaut qu'on ne voit pas en testant sur un acte seul.
   *
   * Un plafond a zero n'est pas « pas de plafond » : c'est « rien n'est
   * couvert ». Les deux se confondraient si on acceptait zero comme absence.
   */
  plafond: number | null;
}

export interface PriseEnCharge {
  /** Ce que l'assurance paie, en francs entiers. */
  partTiers: number;
  /** Ce qui reste au patient. */
  resteACharge: number;
  /** Le regime applique, ou null si rien ne s'applique. */
  regime: string | null;
  /**
   * Pourquoi rien n'a ete applique. Vide quand une convention a joue.
   *
   * Ce motif s'affiche a la caisse et sur le telephone du patient : « vous
   * n'etes couvert pour rien » et « nous ne savons pas ce que couvre votre
   * regime » ne demandent pas le meme geste.
   */
  motif: string;
}

/**
 * La convention qui s'applique a un acte.
 *
 * Une regle sur le code exact l'emporte sur une regle generale `*` : un
 * regime qui couvre tout a 50 % mais les urgences a 100 % se dit ainsi, et
 * l'ordre de recherche doit respecter cette intention.
 */
export function conventionPour(
  conventions: Convention[],
  regime: string | null,
  code: string,
): Convention | null {
  if (!regime) return null;
  const duRegime = conventions.filter((c) => c.regime === regime);
  return duRegime.find((c) => c.code === code) ?? duRegime.find((c) => c.code === '*') ?? null;
}

/**
 * Ce que l'assurance prend sur un montant.
 *
 * `montant` est le total de la ligne, quantite comprise. Les francs CFA ne se
 * divisent pas : on arrondit la part du tiers A L'INFERIEUR, pour que
 * l'arrondi profite a celui qui paie de sa poche plutot qu'a l'assureur.
 */
export function appliquer(
  montant: number,
  conventions: Convention[],
  regime: string | null,
  code: string,
): PriseEnCharge {
  const rien = (motif: string): PriseEnCharge => ({
    partTiers: 0,
    resteACharge: montant,
    regime: null,
    motif,
  });

  if (!Number.isInteger(montant) || montant < 0) {
    return rien('Montant invalide : aucune prise en charge calculee.');
  }
  if (!regime) return rien('Patient sans regime d assurance enregistre.');

  const c = conventionPour(conventions, regime, code);
  if (!c) {
    return rien(
      `Aucune convention enregistree pour « ${regime} » sur « ${code} » : la totalite reste au patient.`,
    );
  }
  if (!Number.isInteger(c.taux) || c.taux < 0 || c.taux > 100) {
    return rien(`Le taux de la convention « ${regime} » n est pas un pourcentage valide.`);
  }

  if (c.plafond !== null && (!Number.isInteger(c.plafond) || c.plafond < 0)) {
    return rien(`Le plafond de la convention « ${regime} » n est pas un montant valide.`);
  }

  // Arrondi A L'INFERIEUR : un franc indivisible va au patient, pas a
  // l'assureur. Sur un acte, c'est negligeable ; sur un exercice, c'est une
  // direction qu'il vaut mieux choisir que subir.
  //
  // LE PLAFOND N'EST PAS APPLIQUE ICI : il porte sur la facture, et une
  // fonction qui ne voit qu'un acte ne peut pas le faire respecter.
  // `appliquerAFacture` s'en charge, une fois le total connu.
  let part = Math.floor((montant * c.taux) / 100);
  part = Math.min(part, montant);

  return {
    partTiers: part,
    resteACharge: montant - part,
    regime: c.regime,
    motif: part === 0 ? `La convention « ${regime} » ne couvre pas cet acte.` : '',
  };
}

/**
 * La prise en charge d'une facture entiere.
 *
 * Calculee LIGNE PAR LIGNE, et non sur le total : un regime couvre des actes,
 * pas des factures. Appliquer un taux unique au total ferait couvrir a 80 %
 * un acte exclu, du simple fait qu'il voisine un acte couvert.
 */
export function appliquerAFacture(
  lignes: { code: string; montant: number }[],
  conventions: Convention[],
  regime: string | null,
): PriseEnCharge {
  if (lignes.length === 0) {
    return { partTiers: 0, resteACharge: 0, regime: null, motif: 'Facture sans ligne.' };
  }

  let partTiers = 0;
  let total = 0;
  const motifs = new Set<string>();
  let regimeApplique: string | null = null;
  const plafonds: number[] = [];

  for (const l of lignes) {
    const p = appliquer(l.montant, conventions, regime, l.code);
    partTiers += p.partTiers;
    total += l.montant;
    if (p.regime) regimeApplique = p.regime;
    if (p.motif) motifs.add(p.motif);
    const c = conventionPour(conventions, regime, l.code);
    if (c?.plafond !== null && c?.plafond !== undefined) plafonds.push(c.plafond);
  }

  // LE PLAFOND BORNE LA FACTURE, UNE SEULE FOIS. Quand plusieurs regles
  // s'appliquent avec des plafonds differents, c'est le PLUS BAS qui tient :
  // un plafond est un engagement maximal, et retenir le plus haut ferait
  // payer a l'assureur ce qu'il n'a pas promis.
  if (plafonds.length > 0) {
    const plafond = Math.min(...plafonds);
    if (partTiers > plafond) {
      partTiers = plafond;
      motifs.add(`Plafond de ${plafond} francs atteint : le reste est a la charge du patient.`);
    }
  }

  return {
    partTiers,
    resteACharge: total - partTiers,
    regime: regimeApplique,
    // On ne garde que le premier motif : la caisse a besoin d'une phrase, pas
    // d'un rapport. Le detail reste visible ligne par ligne.
    // Le plafond atteint est un motif utile MEME quand la part n'est pas
    // nulle : c'est ce qui explique au patient pourquoi il paie encore.
    motif: [...motifs].find((m) => m.startsWith('Plafond')) ?? (partTiers === 0 ? [...motifs][0] ?? '' : ''),
  };
}
