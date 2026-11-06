import { solde, type Facture, type Solde } from '../hopital/caisse.ts';

/**
 * Ce qu'un patient voit de son propre dossier.
 *
 * CE MODULE EST UNE FRONTIERE, PAS UN FILTRE D'AFFICHAGE
 *
 * Tout ce qui sort d'ici part vers un telephone, hors de l'etablissement, sans
 * soignant a cote pour expliquer. La regle est donc l'inverse de l'habituelle :
 * on ne retire pas ce qui est sensible, on ne LAISSE PASSER que ce qui a ete
 * nomme. Une colonne ajoutee plus tard a la base n'atteindra jamais le patient
 * par oubli — il faudra l'ecrire ici, donc y penser.
 *
 * Les projections ne recopient JAMAIS leur entree. Pas de diffusion d'objet,
 * pas de `...source` : chaque champ sortant est ecrit a la main. Un test
 * verifie la liste exacte des cles produites, et tombe des qu'elle change.
 *
 * CE QUI NE SORT PAS, ET POURQUOI
 *
 *   - les brouillons d'ordonnance. `origin` peut valoir « ai-proposed » : une
 *     proposition de modele de langage que le praticien n'a pas encore relue.
 *     Un patient qui la lirait tiendrait une suggestion de machine pour une
 *     prescription ;
 *   - les notes libres du praticien, qui contiennent des hypotheses, parfois
 *     des informations sur des tiers ;
 *   - les resultats d'examen, le compte rendu, la transcription, l'analyse.
 *     Ce choix a ete pris en connaissance de cause : une valeur anormale lue
 *     un samedi soir, sans personne a qui la demander, fait plus de mal que
 *     d'attendre lundi ;
 *   - tout identifiant interne de soignant.
 *
 * Module PUR : ni base, ni horloge. Ce qui est teste est ce qui s'execute.
 */

export type StatutOrdonnance = 'draft' | 'validated' | 'dispensed' | 'cancelled';

// --------------------------------------------------------------- entrees

export interface LigneOrdonnanceSource {
  medicament: string;
  dosage: string | null;
  posologie: string | null;
  dureeJours: number | null;
  quantite: string | null;
}

export interface OrdonnanceSource {
  id: string;
  statut: StatutOrdonnance;
  /** Horodatage de la validation par un praticien, ou null. */
  valideeLe: string | null;
  prescriteLe: string;
  /** Nom affichable du prescripteur, jamais son identifiant. */
  prescripteur: string | null;
  /** Jeton presente a la pharmacie. Il est FAIT pour le patient. */
  qr: string | null;
  lignes: LigneOrdonnanceSource[];
}

export interface SejourSource {
  id: string;
  entreeLe: string;
  sortieLe: string | null;
  service: string | null;
  motif: string | null;
}

// --------------------------------------------------------------- sorties

export interface OrdonnanceVue {
  id: string;
  statut: StatutOrdonnance;
  prescriteLe: string;
  valideeLe: string | null;
  prescripteur: string | null;
  qr: string | null;
  /** Vrai si elle a ete annulee apres avoir ete valide : a ne PAS utiliser. */
  annulee: boolean;
  lignes: LigneOrdonnanceSource[];
}

export interface FactureVue {
  id: string;
  sejourId: string;
  lignes: { libelle: string; montant: number; quantite: number }[];
  total: number;
  partTiers: number;
  resteACharge: number;
  soldee: boolean;
  reglements: { montant: number; moyen: string; recuLe: string }[];
}

export interface SejourVue {
  id: string;
  entreeLe: string;
  sortieLe: string | null;
  service: string | null;
  motif: string | null;
  enCours: boolean;
}

// ------------------------------------------------------------ ordonnances

/**
 * Une ordonnance atteint le patient quand un praticien l'a validee.
 *
 * Le cas annule merite son detour. On pourrait la faire disparaitre — c'est
 * le reflexe. Mais un patient qui a DEJA vu son ordonnance et ne la retrouve
 * plus ira chercher ses medicaments avec la photo qu'il en a prise. Mieux
 * vaut la montrer barree, et qu'il sache qu'elle ne vaut plus.
 *
 * Une annulation survenue avant toute validation, elle, n'a jamais ete vue :
 * rien a retirer, rien a montrer.
 */
export function ordonnanceMontrable(o: Pick<OrdonnanceSource, 'statut' | 'valideeLe'>): boolean {
  if (!o.valideeLe) return false;
  return o.statut === 'validated' || o.statut === 'dispensed' || o.statut === 'cancelled';
}

/** Projette une ordonnance, ou `null` si elle ne doit pas sortir. */
export function projeterOrdonnance(o: OrdonnanceSource): OrdonnanceVue | null {
  if (!ordonnanceMontrable(o)) return null;
  return {
    id: o.id,
    statut: o.statut,
    prescriteLe: o.prescriteLe,
    valideeLe: o.valideeLe,
    prescripteur: o.prescripteur,
    // Une ordonnance annulee ne doit pas pouvoir etre presentee en pharmacie.
    qr: o.statut === 'cancelled' ? null : o.qr,
    annulee: o.statut === 'cancelled',
    lignes: o.lignes.map((l) => ({
      medicament: l.medicament,
      dosage: l.dosage,
      posologie: l.posologie,
      dureeJours: l.dureeJours,
      quantite: l.quantite,
    })),
  };
}

// --------------------------------------------------------------- factures

/**
 * Projette une facture.
 *
 * Le calcul n'est pas refait ici : `solde` de la caisse fait foi. Deux
 * calculs du meme montant finissent toujours par diverger, et c'est le
 * patient qui verrait un chiffre que la caisse ne reconnait pas.
 *
 * `urgence` ne sort pas : savoir qu'un acte etait « vital » ou
 * « programmable » releve du dossier, pas de la facture du patient.
 */
export function projeterFacture(f: Facture): FactureVue {
  const s: Solde = solde(f);
  return {
    id: f.id,
    sejourId: f.sejourId,
    lignes: f.lignes.map((l) => ({
      libelle: l.libelle,
      montant: l.montant,
      quantite: l.quantite,
    })),
    total: s.total,
    partTiers: s.partTiers,
    resteACharge: s.resteACharge,
    soldee: s.soldee,
    reglements: f.paiements.map((p) => ({
      montant: p.montant,
      moyen: p.moyen,
      recuLe: p.recuLe,
    })),
  };
}

// ---------------------------------------------------------------- sejours

export function projeterSejour(s: SejourSource): SejourVue {
  return {
    id: s.id,
    entreeLe: s.entreeLe,
    sortieLe: s.sortieLe,
    service: s.service,
    motif: s.motif,
    enCours: s.sortieLe === null,
  };
}

/**
 * Les cles que chaque projection a le droit de produire.
 *
 * Elles ne servent pas au code : elles servent au TEST, qui compare la sortie
 * reelle a cette liste. Ajouter un champ oblige donc a l'ecrire ici, c'est a
 * dire a decider qu'un patient peut le lire.
 */
export const CLES_AUTORISEES = {
  ordonnance: [
    'id',
    'statut',
    'prescriteLe',
    'valideeLe',
    'prescripteur',
    'qr',
    'annulee',
    'lignes',
  ],
  ligneOrdonnance: ['medicament', 'dosage', 'posologie', 'dureeJours', 'quantite'],
  facture: [
    'id',
    'sejourId',
    'lignes',
    'total',
    'partTiers',
    'resteACharge',
    'soldee',
    'reglements',
  ],
  ligneFacture: ['libelle', 'montant', 'quantite'],
  reglement: ['montant', 'moyen', 'recuLe'],
  sejour: ['id', 'entreeLe', 'sortieLe', 'service', 'motif', 'enCours'],
} as const;
