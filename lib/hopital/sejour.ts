/**
 * Le sejour hospitalier : de l'entree du patient a sa sortie.
 *
 * C'est la colonne vertebrale de la plateforme. La gestion des lits, le flux
 * des patients, la caisse et la pharmacie s'accrochent tous au sejour : sans
 * lui, chacun de ces modules tiendrait un etat du monde qui lui serait propre,
 * et deux services finiraient par ne plus dire la meme chose du meme patient.
 *
 * MODULE PUR. Il recoit un etat et une demande, et rend soit le mouvement a
 * ecrire, soit un REFUS motive. Aucune base, aucun reseau : les regles se
 * testent telles qu'elles tournent, y compris les situations qu'on esperera
 * ne jamais voir.
 *
 * LE REFUS PLUTOT QUE L'AVERTISSEMENT. Comme ailleurs dans ce projet : un
 * bandeau rouge qu'on peut ignorer finit par etre ignore. Deux patients
 * affectes au meme lit n'est pas une incoherence de base de donnees, c'est un
 * brancard dans un couloir a trois heures du matin, ou pire, un acte pratique
 * sur la mauvaise personne. La regle refuse, et dit pourquoi.
 */

import { versIso } from '../temps.ts';

/** Ou en est le patient dans l'etablissement. */
export type StatutSejour =
  /** Attendu, pas encore arrive : hospitalisation programmee. */
  | 'prevu'
  /** Present dans l'etablissement. */
  | 'en-cours'
  /** Sorti. Le sejour est clos et ne recoit plus de mouvement. */
  | 'sorti'
  /** Annule avant toute arrivee. */
  | 'annule';

/** Ce qui amene le patient. Decide du circuit, donc du flux. */
export type TypeSejour = 'externe' | 'urgence' | 'hospitalisation';

/** Etat d'un lit. Un lit indisponible n'est pas un lit libre. */
export type EtatLit =
  | 'libre'
  | 'occupe'
  /** Libere mais pas encore nettoye : il ne se rattribue pas tout seul. */
  | 'a-preparer'
  /** Panne, travaux, isolement ferme : hors du parc utilisable. */
  | 'hors-service';

export interface Lit {
  id: string;
  /** Code lisible par un soignant : « MED-12-B ». */
  code: string;
  uniteId: string;
  chambreId: string | null;
  etat: EtatLit;
  /** Lit d'isolement : ne se partage pas, et conditionne certaines admissions. */
  isolement: boolean;
}

export interface Sejour {
  id: string;
  patientId: string;
  type: TypeSejour;
  statut: StatutSejour;
  /** Lit occupe en ce moment, null pour un sejour externe ou en attente. */
  litId: string | null;
  admisLe: string | null;
  sortiLe: string | null;
}

export type MotifRefus =
  | 'LIT_DEJA_OCCUPE'
  | 'LIT_HORS_SERVICE'
  | 'LIT_A_PREPARER'
  | 'SEJOUR_CLOS'
  | 'SEJOUR_ANNULE'
  | 'PATIENT_DEJA_PRESENT'
  | 'PAS_ENCORE_ADMIS'
  | 'LIT_INCHANGE'
  | 'EXTERNE_SANS_LIT'
  | 'DATE_INCOHERENTE';

export interface Refus {
  ok: false;
  motif: MotifRefus;
  /** Ce que cela empeche, en clair, pour l'agent qui est devant l'ecran. */
  message: string;
  /** Ce qu'il peut faire, applicable sur place. */
  remede: string;
}

export interface Accord<T> {
  ok: true;
  resultat: T;
}

export type Decision<T> = Accord<T> | Refus;

function refuse(motif: MotifRefus, message: string, remede: string): Refus {
  return { ok: false, motif, message, remede };
}

// --------------------------------------------------------------- admission

export interface DemandeAdmission {
  sejour: Sejour;
  /** Lit souhaite. Absent pour un sejour externe, qui n'en consomme pas. */
  lit?: Lit;
  /** Sejours DEJA en cours qui occupent un lit — pour detecter la collision. */
  sejoursEnCours: Sejour[];
  /** Horodatage de l'admission. */
  quand: string;
}

/**
 * Admettre un patient, et l'installer dans un lit s'il en faut un.
 *
 * Un sejour externe (consultation sans hospitalisation) est admis sans lit :
 * lui en reserver un immobiliserait une place pour quelqu'un qui repart dans
 * l'heure.
 */
export function admettre(d: DemandeAdmission): Decision<{ sejour: Sejour; lit: Lit | null }> {
  const { sejour, lit } = d;

  if (sejour.statut === 'sorti') {
    return refuse(
      'SEJOUR_CLOS',
      'Ce sejour est deja clos : le patient est sorti.',
      'Ouvrir un nouveau sejour pour cette nouvelle venue.',
    );
  }
  if (sejour.statut === 'annule') {
    return refuse('SEJOUR_ANNULE', 'Ce sejour a ete annule.', 'Ouvrir un nouveau sejour.');
  }
  if (sejour.statut === 'en-cours') {
    return refuse(
      'PATIENT_DEJA_PRESENT',
      'Ce patient est deja admis et present dans l etablissement.',
      'Utiliser un transfert pour le changer de lit, ou une sortie avant de le readmettre.',
    );
  }

  // Un sejour externe ne prend pas de lit : le lui attribuer immobiliserait
  // une place pour quelqu un qui repart dans l heure.
  if (sejour.type === 'externe') {
    if (lit) {
      return refuse(
        'EXTERNE_SANS_LIT',
        'Un sejour externe n occupe pas de lit.',
        'Admettre sans lit, ou requalifier le sejour en hospitalisation si le patient reste.',
      );
    }
    return { ok: true, resultat: { sejour: { ...sejour, statut: 'en-cours', admisLe: d.quand }, lit: null } };
  }

  if (!lit) {
    return refuse(
      'EXTERNE_SANS_LIT',
      'Une hospitalisation demande un lit.',
      'Choisir un lit libre dans une unite, ou admettre en sejour externe.',
    );
  }

  const verdictLit = litAttribuable(lit, d.sejoursEnCours);
  if (!verdictLit.ok) return verdictLit;

  return {
    ok: true,
    resultat: {
      sejour: { ...sejour, statut: 'en-cours', litId: lit.id, admisLe: d.quand },
      lit: { ...lit, etat: 'occupe' },
    },
  };
}

/**
 * Un lit peut-il recevoir quelqu'un ?
 *
 * La double occupation est verifiee sur les SEJOURS, pas seulement sur l'etat
 * du lit : l'etat est une donnee derivee, qui peut avoir ete laissee en
 * arriere par un incident. Ce qui fait foi, c'est qu'un sejour en cours
 * declare ce lit. Se fier au seul champ `etat` laisserait passer exactement la
 * collision qu'on veut empecher.
 */
export function litAttribuable(lit: Lit, sejoursEnCours: Sejour[]): Decision<Lit> {
  const occupant = sejoursEnCours.find((s) => s.litId === lit.id && s.statut === 'en-cours');
  if (occupant) {
    return refuse(
      'LIT_DEJA_OCCUPE',
      `Le lit ${lit.code} est occupe par un autre patient.`,
      'Choisir un lit libre, ou sortir ou transferer son occupant avant.',
    );
  }
  if (lit.etat === 'hors-service') {
    return refuse(
      'LIT_HORS_SERVICE',
      `Le lit ${lit.code} est hors service.`,
      'Choisir un autre lit, ou remettre celui-ci en service depuis la gestion des lits.',
    );
  }
  if (lit.etat === 'a-preparer') {
    return refuse(
      'LIT_A_PREPARER',
      `Le lit ${lit.code} a ete libere mais n est pas encore prepare.`,
      'Le marquer prepare une fois le nettoyage fait, puis recommencer.',
    );
  }
  return { ok: true, resultat: lit };
}

// ---------------------------------------------------------------- transfert

export interface DemandeTransfert {
  sejour: Sejour;
  litCible: Lit;
  sejoursEnCours: Sejour[];
  quand: string;
}

/**
 * Deplacer un patient d'un lit a un autre.
 *
 * Le lit quitte est rendu « a preparer » et non « libre » : un lit qui vient
 * d'etre occupe n'est pas pret. Le laisser libre inviterait a y installer le
 * patient suivant avant le nettoyage.
 */
export function transferer(d: DemandeTransfert): Decision<{ sejour: Sejour; litQuitte: string | null; litPris: Lit }> {
  const { sejour, litCible } = d;

  if (sejour.statut !== 'en-cours') {
    return refuse(
      'PAS_ENCORE_ADMIS',
      'Seul un patient present peut etre transfere.',
      sejour.statut === 'prevu' ? 'Admettre le patient d abord.' : 'Ce sejour est clos.',
    );
  }
  if (sejour.litId === litCible.id) {
    return refuse(
      'LIT_INCHANGE',
      `Le patient est deja dans le lit ${litCible.code}.`,
      'Choisir un lit different, ou annuler le transfert.',
    );
  }

  const verdict = litAttribuable(litCible, d.sejoursEnCours);
  if (!verdict.ok) return verdict;

  return {
    ok: true,
    resultat: {
      sejour: { ...sejour, litId: litCible.id },
      litQuitte: sejour.litId,
      litPris: { ...litCible, etat: 'occupe' },
    },
  };
}

// ------------------------------------------------------------------- sortie

export interface DemandeSortie {
  sejour: Sejour;
  quand: string;
}

/** Faire sortir un patient et liberer son lit. */
export function fairesortir(d: DemandeSortie): Decision<{ sejour: Sejour; litLibere: string | null }> {
  const { sejour } = d;

  if (sejour.statut === 'sorti') {
    return refuse('SEJOUR_CLOS', 'Ce patient est deja sorti.', 'Aucune action necessaire.');
  }
  if (sejour.statut !== 'en-cours') {
    return refuse(
      'PAS_ENCORE_ADMIS',
      'Ce patient n a pas ete admis : il ne peut pas sortir.',
      sejour.statut === 'prevu' ? 'Annuler le sejour prevu plutot que de le faire sortir.' : 'Ce sejour est annule.',
    );
  }
  if (sejour.admisLe && d.quand < sejour.admisLe) {
    return refuse(
      'DATE_INCOHERENTE',
      'La sortie serait anterieure a l admission.',
      'Corriger la date de sortie, ou celle de l admission si c est elle qui est fausse.',
    );
  }

  return {
    ok: true,
    resultat: {
      sejour: { ...sejour, statut: 'sorti', litId: null, sortiLe: d.quand },
      litLibere: sejour.litId,
    },
  };
}

// ------------------------------------------------------------------ mesures

export interface OccupationUnite {
  uniteId: string;
  /** Lits du parc, hors service compris. */
  total: number;
  /** Lits hors du parc utilisable. */
  horsService: number;
  occupes: number;
  aPreparer: number;
  libres: number;
  /**
   * Occupes / (total − hors service), en pourcentage.
   *
   * Les lits hors service sont retires du denominateur : les compter ferait
   * paraitre une unite saturee moins pleine qu'elle ne l'est, et c'est
   * precisement le chiffre sur lequel on decide d'ouvrir une place.
   */
  tauxOccupation: number;
}

export function occupation(uniteId: string, lits: Lit[], sejoursEnCours: Sejour[]): OccupationUnite {
  const duParc = lits.filter((l) => l.uniteId === uniteId);
  const horsService = duParc.filter((l) => l.etat === 'hors-service').length;
  const occupes = duParc.filter((l) =>
    sejoursEnCours.some((s) => s.litId === l.id && s.statut === 'en-cours'),
  ).length;
  const aPreparer = duParc.filter((l) => l.etat === 'a-preparer').length;
  const utilisables = duParc.length - horsService;

  return {
    uniteId,
    total: duParc.length,
    horsService,
    occupes,
    aPreparer,
    libres: Math.max(0, utilisables - occupes - aPreparer),
    tauxOccupation: utilisables === 0 ? 0 : Math.round((occupes / utilisables) * 100),
  };
}

/**
 * Duree de sejour, en jours entames.
 *
 * Un sejour d'une nuit compte pour un jour : c'est la convention des
 * statistiques hospitalieres, et celle que la facturation suit. Rendre 0 pour
 * une nuit passee dans l'etablissement serait faux des deux points de vue.
 */
export function dureeJours(admisLe: string, sortiLe: string): number {
  const debut = new Date(versIso(admisLe) ?? '').getTime();
  const fin = new Date(versIso(sortiLe) ?? '').getTime();
  if (!Number.isFinite(debut) || !Number.isFinite(fin) || fin < debut) return 0;
  return Math.max(1, Math.ceil((fin - debut) / 86_400_000));
}
