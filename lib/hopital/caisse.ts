/**
 * Caisse : tarification, encaissement, tiers payant.
 *
 * LA REGLE QUI PASSE AVANT TOUTES LES AUTRES : l'argent ne barre pas la route
 * d'un soin urgent. Un module de caisse qui peut bloquer une prise en charge
 * finit par le faire, un soir de garde, pour une somme derisoire. Ici, le
 * controle de paiement rend un AVIS consultatif sur les actes urgents, et un
 * blocage uniquement sur ce qui peut attendre.
 *
 * C'est l'exception assumee a la ligne de conduite du projet — ailleurs on
 * refuse plutot qu'on avertit. Ici l'inverse, parce que le risque n'est pas
 * du meme ordre : une facture impayee se recouvre, une prise en charge
 * retardee ne se rattrape pas.
 *
 * Montants en UNITES ENTIERES de la monnaie (franc CFA), jamais en flottant :
 * 0,1 + 0,2 ne fait pas 0,3 en binaire, et une caisse qui derive d'un centime
 * par ligne finit par ne plus tomber juste.
 */

export type Urgence = 'vitale' | 'urgente' | 'programmable';

/**
 * Un montant, tel qu'il doit s'ecrire partout.
 *
 * Les messages de refus et les tableaux affichent les memes sommes ; s'ils
 * les ecrivent differemment — « 50000 F » ici, « 50 000 F » la — l'agent
 * doit comparer deux graphies au lieu de lire un chiffre, et c'est ainsi
 * qu'on rend 5 000 F au lieu de 50 000.
 *
 * Groupement fait a la main plutot que par toLocaleString : le resultat ne
 * doit pas dependre de la version d'ICU embarquee, sous peine de messages
 * differents entre le serveur et le poste.
 */
export function francs(n: number): string {
  // Espace INSECABLE, ecrite en echappement plutot qu'en caractere
  // litteral : un U+00A0 dans le source est invisible a la relecture et se
  // fait manger par un reformatage sans que personne ne le voie.
  return `${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')} F`;
}

export interface LigneFacture {
  id: string;
  libelle: string;
  /** Montant unitaire, en francs CFA entiers. */
  montant: number;
  quantite: number;
  /** Gravite de l'acte, qui decide si un impaye peut le bloquer. */
  urgence: Urgence;
}

export interface Paiement {
  id: string;
  /** En francs CFA entiers. Toujours positif. */
  montant: number;
  moyen: 'especes' | 'mobile' | 'carte' | 'tiers-payant';
  recuLe: string;
}

export interface Facture {
  id: string;
  sejourId: string;
  lignes: LigneFacture[];
  paiements: Paiement[];
  /**
   * Part prise en charge par un tiers (mutuelle, assurance, programme),
   * en francs CFA entiers. Elle vient en deduction du reste a charge.
   */
  partTiers: number;
  close: boolean;
}

export interface Solde {
  /** Somme des lignes. */
  total: number;
  partTiers: number;
  /** Ce que le patient doit, tiers payant deduit. */
  duPatient: number;
  regle: number;
  /** Ce qu'il reste a payer. Jamais negatif. */
  resteACharge: number;
  /** Trop-percu, s'il y en a : a rembourser, pas a garder en silence. */
  tropPercu: number;
  soldee: boolean;
}

export function solde(f: Facture): Solde {
  const total = f.lignes.reduce((n, l) => n + l.montant * l.quantite, 0);
  const partTiers = Math.min(f.partTiers, total);
  const duPatient = total - partTiers;
  const regle = f.paiements.reduce((n, p) => n + p.montant, 0);

  return {
    total,
    partTiers,
    duPatient,
    regle,
    resteACharge: Math.max(0, duPatient - regle),
    // Un trop-percu est NOMME, pas absorbe. Une caisse qui l'avale
    // silencieusement transforme une erreur de rendu en recette.
    tropPercu: Math.max(0, regle - duPatient),
    soldee: regle >= duPatient,
  };
}

export type MotifRefusCaisse =
  | 'FACTURE_CLOSE'
  | 'MONTANT_INVALIDE'
  | 'DEPASSE_RESTE_A_CHARGE'
  | 'DEJA_SOLDEE'
  | 'LIGNE_INVALIDE';

export interface RefusCaisse {
  ok: false;
  motif: MotifRefusCaisse;
  message: string;
  remede: string;
}

export type DecisionCaisse<T> = { ok: true; resultat: T } | RefusCaisse;

function refuse(motif: MotifRefusCaisse, message: string, remede: string): RefusCaisse {
  return { ok: false, motif, message, remede };
}

/** Ajoute un acte a la facture. */
export function facturer(f: Facture, ligne: Omit<LigneFacture, 'id'>): DecisionCaisse<LigneFacture> {
  if (f.close) {
    return refuse(
      'FACTURE_CLOSE',
      'Cette facture est close : aucun acte ne peut plus y etre ajoute.',
      'Ouvrir une facture complementaire sur le meme sejour.',
    );
  }
  if (!Number.isInteger(ligne.montant) || ligne.montant < 0) {
    return refuse(
      'LIGNE_INVALIDE',
      'Le montant doit etre un nombre entier de francs, positif ou nul.',
      'Corriger le tarif de l acte.',
    );
  }
  if (!Number.isInteger(ligne.quantite) || ligne.quantite < 1) {
    return refuse('LIGNE_INVALIDE', 'La quantite doit valoir au moins 1.', 'Corriger la quantite.');
  }
  return { ok: true, resultat: { ...ligne, id: '' } };
}

/**
 * Encaisse un paiement.
 *
 * Un versement superieur au reste a charge est REFUSE plutot qu'absorbe : la
 * caisse n'a pas a decider seule qu'un patient vient de faire un don.
 */
export function encaisser(f: Facture, montant: number, moyen: Paiement['moyen']): DecisionCaisse<Paiement> {
  if (!Number.isInteger(montant) || montant <= 0) {
    return refuse(
      'MONTANT_INVALIDE',
      'Le montant encaisse doit etre un nombre entier de francs, strictement positif.',
      'Saisir le montant reellement recu.',
    );
  }

  const s = solde(f);
  if (s.soldee) {
    return refuse(
      'DEJA_SOLDEE',
      'Cette facture est deja soldee.',
      'Verifier le sejour : le paiement concerne peut-etre une autre facture.',
    );
  }
  if (montant > s.resteACharge) {
    return refuse(
      'DEPASSE_RESTE_A_CHARGE',
      `Le montant depasse le reste a charge (${francs(s.resteACharge)}).`,
      `Encaisser ${francs(s.resteACharge)}, et rendre la difference au patient.`,
    );
  }

  return { ok: true, resultat: { id: '', montant, moyen, recuLe: '' } };
}

// ------------------------------------------------- l'argent et le soin

export type NiveauAvis = 'bloquant' | 'avis' | 'aucun';

export interface AvisPaiement {
  niveau: NiveauAvis;
  message: string;
  resteACharge: number;
}

/**
 * Le patient peut-il recevoir cet acte au vu de sa situation de caisse ?
 *
 * La reponse n'est JAMAIS bloquante pour un acte vital ou urgent. Elle ne
 * l'est que pour ce qui peut attendre sans dommage — et meme alors, elle
 * nomme le montant, pour qu'un responsable puisse trancher.
 */
export function avisAvantActe(f: Facture, urgence: Urgence): AvisPaiement {
  const s = solde(f);

  if (s.resteACharge === 0) {
    return { niveau: 'aucun', message: 'Rien a regler.', resteACharge: 0 };
  }

  if (urgence === 'vitale' || urgence === 'urgente') {
    return {
      niveau: 'avis',
      message:
        `Reste a charge de ${francs(s.resteACharge)}. ` +
        "Acte urgent : il est realise, et la regularisation se fait apres. L'impaye ne retarde pas la prise en charge.",
      resteACharge: s.resteACharge,
    };
  }

  return {
    niveau: 'bloquant',
    message: `Reste a charge de ${francs(s.resteACharge)} sur un acte programmable.`,
    resteACharge: s.resteACharge,
  };
}
