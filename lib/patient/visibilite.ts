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
 *   - le compte rendu, la transcription et l'analyse produite par le modele.
 *     Un compte rendu est ecrit POUR UN CONFRERE : il porte des hypotheses et
 *     un vocabulaire qui alarment sans eclairer celui qui n'a pas la formation
 *     pour les lire ;
 *   - tout identifiant interne de soignant.
 *
 * LES ANALYSES ONT ETE OUVERTES AU PATIENT, ET POURQUOI C'EST ECRIT ICI
 *
 * Les resultats d'examen ne partaient autrefois pas du tout : une valeur anormale
 * lue un samedi soir, sans personne a qui la demander, faisait plus de mal que
 * d'attendre lundi. Ce choix a ete renverse volontairement. Deux garde-fous
 * l'accompagnent, qui ne sont pas des adoucissements mais des exigences de
 * justesse :
 *
 *   - un resultat REMPLACE par une correction ne sort jamais. Montrer une
 *     valeur que le laboratoire a corrigee depuis serait pire que de ne rien
 *     montrer : le patient agirait sur un chiffre que son dossier ne porte
 *     plus ;
 *   - une valeur CRITIQUE sort accompagnee. Tant que l'acquittement nominatif
 *     n'a pas eu lieu, la projection le dit, pour que le patient sache que
 *     personne n'a encore ete joint et qu'il doit appeler. La valeur n'est pas
 *     retenue — on ne cache pas a quelqu'un ce qui le concerne — mais elle
 *     n'arrive jamais nue.
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

export interface AnalyseSource {
  id: string;
  examen: string;
  /** laboratoire | imagerie */
  domaine: string;
  demandeeLe: string;
  etat: string;
  /** routine | urgente | vitale */
  priorite: string;
  valeurNum: number | null;
  valeurTexte: string | null;
  unite: string | null;
  /** normal | anormal | critique | non-interprete */
  interpretation: string | null;
  rendueLe: string | null;
  /** Non nul quand une correction a remplace ce resultat. */
  remplacePar: string | null;
  /** Vrai tant qu une valeur critique n a pas ete acquittee nommement. */
  aTransmettre: boolean;
}

export interface RendezVousSource {
  id: string;
  mode: string;
  motif: string | null;
  debut: string;
  dureeMin: number;
  etat: string;
  /** Nom affichable du praticien, jamais son identifiant. */
  praticien: string | null;
  lieu: string | null;
  salle: string | null;
  consentementLe: string | null;
  annuleMotif: string | null;
}

export interface AllergieVue {
  substance: string;
  reaction: string | null;
  criticite: string | null;
}

export interface ProblemeVue {
  libelle: string;
  depuis: string | null;
  actif: boolean;
}

export interface TraitementVue {
  medicament: string;
  dose: string | null;
  depuis: string | null;
}

export interface DossierMedicalSource {
  nom: string;
  neLe: string | null;
  naissanceEstimee: boolean;
  sexe: string | null;
  groupeSanguin: string | null;
  numeroDossier: string | null;
  npi: string | null;
  allergies: AllergieVue[];
  problemes: ProblemeVue[];
  traitements: TraitementVue[];
}

export interface AnalyseVue {
  id: string;
  examen: string;
  domaine: string;
  demandeeLe: string;
  etat: string;
  urgente: boolean;
  valeur: string | null;
  unite: string | null;
  interpretation: string | null;
  rendueLe: string | null;
  critique: boolean;
  /** Vrai quand la valeur est critique ET que personne n a encore ete joint. */
  centreNonJoint: boolean;
}

export interface RendezVousVue {
  id: string;
  mode: string;
  motif: string | null;
  debut: string;
  dureeMin: number;
  etat: string;
  praticien: string | null;
  lieu: string | null;
  aDistance: boolean;
  salle: string | null;
  consentementDonne: boolean;
  annuleMotif: string | null;
  passe: boolean;
}

export interface DossierMedicalVue {
  nom: string;
  neLe: string | null;
  naissanceEstimee: boolean;
  sexe: string | null;
  groupeSanguin: string | null;
  numeroDossier: string | null;
  npi: string | null;
  allergies: AllergieVue[];
  problemes: ProblemeVue[];
  traitements: TraitementVue[];
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

// --------------------------------------------------------------- analyses

/**
 * Un resultat remplace par une correction ne sort jamais.
 *
 * C'est la seule retenue sur les analyses, et elle n'a rien d'une prudence :
 * montrer une valeur que le laboratoire a corrigee depuis ferait agir le
 * patient sur un chiffre que son dossier ne porte plus.
 */
export function analyseMontrable(a: Pick<AnalyseSource, 'remplacePar'>): boolean {
  return a.remplacePar === null;
}

/**
 * Projette une analyse.
 *
 * La valeur numerique et la valeur texte sont fondues en une seule chaine : un
 * ecran de telephone n'a pas la place de deux colonnes dont une est toujours
 * vide, et le patient ne distingue pas les deux cas.
 *
 * `centreNonJoint` EST LE CHAMP QUI COMPTE. Une valeur critique dont
 * l'acquittement nominatif n'a pas encore eu lieu signifie que personne n'a
 * ete joint : le patient est alors le PREMIER au courant, et il doit le savoir
 * pour appeler lui-meme. Taire cette information rendrait l'ouverture des
 * analyses dangereuse. La valeur, elle, n'est pas retenue.
 */
export function projeterAnalyse(a: AnalyseSource): AnalyseVue | null {
  if (!analyseMontrable(a)) return null;
  const critique = a.interpretation === 'critique';
  const valeur = a.valeurTexte ?? (a.valeurNum === null ? null : String(a.valeurNum));
  return {
    id: a.id,
    examen: a.examen,
    domaine: a.domaine,
    demandeeLe: a.demandeeLe,
    etat: a.etat,
    urgente: a.priorite === 'urgente' || a.priorite === 'vitale',
    valeur,
    unite: a.unite,
    interpretation: a.interpretation,
    rendueLe: a.rendueLe,
    critique,
    centreNonJoint: critique && a.aTransmettre,
  };
}

// ------------------------------------------------------------- rendez-vous

/**
 * Projette un rendez-vous.
 *
 * `salle` ne sort QUE pour une teleconsultation a venir, non annulee et
 * consentie. Le jeton de salle est une entree : le laisser filer sur un
 * rendez-vous passe ou annule laisserait une porte ouverte sur une
 * consultation terminee.
 *
 * `passe` est fourni par l'appelant, qui tient l'horloge. Ce module reste pur :
 * un module qui lit l'heure ne se teste pas deux fois pareil.
 */
export function projeterRendezVous(r: RendezVousSource, passe: boolean): RendezVousVue {
  const aDistance = r.mode === 'distance';
  const ouvrable = aDistance && !passe && r.etat !== 'annule' && r.etat !== 'absent';
  return {
    id: r.id,
    mode: r.mode,
    motif: r.motif,
    debut: r.debut,
    dureeMin: r.dureeMin,
    etat: r.etat,
    praticien: r.praticien,
    lieu: r.lieu,
    aDistance,
    salle: ouvrable && r.consentementLe ? r.salle : null,
    consentementDonne: r.consentementLe !== null,
    annuleMotif: r.annuleMotif,
    passe,
  };
}

// --------------------------------------------------------- dossier medical

/**
 * Projette le dossier medical.
 *
 * CE QU'IL PORTE : allergies, maladies au long cours, traitements en cours,
 * groupe sanguin. C'est exactement ce qu'un carnet de sante servait a
 * transporter, et ce qu'on demande a quelqu'un arrivant aux urgences sans
 * personne pour repondre a sa place.
 *
 * CE QU'IL NE PORTE PAS : les diagnostics d'une consultation donnee, le compte
 * rendu, les notes. Un probleme au long cours a ete inscrit comme tel par un
 * praticien ; un diagnostic d'un jour est une hypothese de ce jour-la, et la
 * liste des hypotheses qu'on a eues sur soi ne s'emporte pas dans la poche.
 */
export function projeterDossierMedical(d: DossierMedicalSource): DossierMedicalVue {
  return {
    nom: d.nom,
    neLe: d.neLe,
    naissanceEstimee: d.naissanceEstimee,
    sexe: d.sexe,
    groupeSanguin: d.groupeSanguin,
    numeroDossier: d.numeroDossier,
    npi: d.npi,
    allergies: d.allergies.map((a) => ({
      substance: a.substance,
      reaction: a.reaction,
      criticite: a.criticite,
    })),
    problemes: d.problemes.map((p) => ({
      libelle: p.libelle,
      depuis: p.depuis,
      actif: p.actif,
    })),
    traitements: d.traitements.map((m) => ({
      medicament: m.medicament,
      dose: m.dose,
      depuis: m.depuis,
    })),
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
  analyse: [
    'id',
    'examen',
    'domaine',
    'demandeeLe',
    'etat',
    'urgente',
    'valeur',
    'unite',
    'interpretation',
    'rendueLe',
    'critique',
    'centreNonJoint',
  ],
  rendezVous: [
    'id',
    'mode',
    'motif',
    'debut',
    'dureeMin',
    'etat',
    'praticien',
    'lieu',
    'aDistance',
    'salle',
    'consentementDonne',
    'annuleMotif',
    'passe',
  ],
  dossierMedical: [
    'nom',
    'neLe',
    'naissanceEstimee',
    'sexe',
    'groupeSanguin',
    'numeroDossier',
    'npi',
    'allergies',
    'problemes',
    'traitements',
  ],
  allergie: ['substance', 'reaction', 'criticite'],
  probleme: ['libelle', 'depuis', 'actif'],
  traitement: ['medicament', 'dose', 'depuis'],
} as const;
