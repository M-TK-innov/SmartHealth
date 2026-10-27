/**
 * Flux des patients et files d'attente.
 *
 * Un patient entre, passe par des postes — accueil, triage, consultation,
 * caisse, pharmacie, laboratoire — et ressort. Ce module decide QUI PASSE
 * ENSUITE a chaque poste.
 *
 * L'INVARIANT : une urgence vitale ne passe jamais derriere un cas moins
 * grave. Ce n'est pas une preference d'ordonnancement, c'est la raison d'etre
 * du triage. Une file strictement chronologique tue ; une file qui oublie les
 * anciens aussi, mais plus lentement — d'ou la regle d'anciennete ci-dessous,
 * qui n'inverse jamais deux niveaux de gravite.
 *
 * Module PUR : ni base ni horloge implicite. L'instant est toujours passe en
 * parametre, pour que l'attente se teste sans attendre.
 */

import { minutesEntre } from '../temps.ts';

/**
 * Niveaux de triage, du plus grave au moins grave.
 *
 * Quatre niveaux et non cinq : un poste d'accueil sous tension ne distingue
 * pas fiablement davantage, et une echelle trop fine se remplit au milieu.
 */
export type Gravite = 'vitale' | 'urgente' | 'standard' | 'differable';

const RANG: Record<Gravite, number> = { vitale: 0, urgente: 1, standard: 2, differable: 3 };

export type EtatPassage = 'en-attente' | 'en-cours' | 'termine' | 'parti';

export interface Passage {
  id: string;
  sejourId: string;
  posteId: string;
  gravite: Gravite;
  etat: EtatPassage;
  /** Horodatage d'arrivee dans la file. */
  arriveLe: string;
  prisEnChargeLe: string | null;
  termineLe: string | null;
}

/**
 * Au-dela de cette attente, un cas est remonte d'un cran dans l'ordre de
 * passage — sans jamais depasser un niveau plus grave que le sien.
 *
 * Sans cette regle, un cas « differable » un jour de forte affluence n'est
 * jamais appele : il reste derriere chaque nouvel arrivant plus grave, et
 * repart le soir sans avoir ete vu.
 */
export const ANCIENNETE_MINUTES = 90;

export interface PassageClasse extends Passage {
  /** Minutes ecoulees depuis l'arrivee. */
  attenteMinutes: number;
  /** true si l'anciennete l'a fait remonter. */
  remonte: boolean;
}

/**
 * Rang effectif dans la file, anciennete comprise.
 *
 * LE PLANCHER EST A 1, ET C'EST TOUTE LA REGLE. Une attente, si longue
 * soit-elle, ne fait jamais atteindre le rang 0 : ce rang est reserve aux
 * urgences vitales, et rien ne passe devant elles.
 *
 * Sans ce plancher, une urgence arrivee quatre-vingt-dix minutes plus tot
 * remonterait au rang vital et passerait devant un arret cardiaque qui vient
 * d'entrer — en respectant pourtant « l'esprit » des deux regles prises
 * separement. C'est le genre de composition qu'aucune relecture ne rattrape
 * et qu'un test nomme.
 */
function rangEffectif(gravite: Gravite, attenteMinutes: number): number {
  if (gravite === 'vitale') return RANG.vitale;
  const brut = RANG[gravite];
  return attenteMinutes >= ANCIENNETE_MINUTES ? Math.max(1, brut - 1) : brut;
}

/**
 * Ordonne la file d'un poste : qui passe ensuite, et pourquoi.
 *
 * Tri par gravite effective, puis par anciennete d'arrivee. L'anciennete ne
 * fait gagner qu'UN cran : un cas differable qui attend depuis trois heures
 * passe devant les autres differables et devant les standards arrives apres
 * lui, jamais devant une urgence vitale.
 */
export function ordonner(file: Passage[], maintenant: string): PassageClasse[] {
  const attente = file
    .filter((p) => p.etat === 'en-attente')
    .map((p) => {
      const attenteMinutes = minutesEntre(p.arriveLe, maintenant);
      const rang = rangEffectif(p.gravite, attenteMinutes);
      return { ...p, attenteMinutes, rang, remonte: rang < RANG[p.gravite] };
    });

  return attente
    .sort((a, b) => {
      if (a.rang !== b.rang) return a.rang - b.rang;
      // A gravite egale, le premier arrive passe le premier.
      return a.arriveLe < b.arriveLe ? -1 : a.arriveLe > b.arriveLe ? 1 : 0;
    })
    .map(({ rang: _rang, ...p }) => p);
}

/** Le prochain patient a appeler, ou null si la file est vide. */
export function prochain(file: Passage[], maintenant: string): PassageClasse | null {
  return ordonner(file, maintenant)[0] ?? null;
}

export type MotifRefusFlux =
  | 'SEJOUR_NON_PRESENT'
  | 'DEJA_EN_ATTENTE'
  | 'DEJA_EN_COURS'
  | 'PASSAGE_CLOS'
  | 'PAS_EN_ATTENTE'
  | 'PAS_EN_COURS';

export interface RefusFlux {
  ok: false;
  motif: MotifRefusFlux;
  message: string;
  remede: string;
}

export type DecisionFlux<T> = { ok: true; resultat: T } | RefusFlux;

function refuse(motif: MotifRefusFlux, message: string, remede: string): RefusFlux {
  return { ok: false, motif, message, remede };
}

export interface DemandePlacement {
  sejourId: string;
  posteId: string;
  gravite: Gravite;
  /** Statut du sejour : seul un patient present entre dans une file. */
  sejourPresent: boolean;
  /** Passages deja ouverts pour ce sejour, tous postes confondus. */
  passagesOuverts: Passage[];
  quand: string;
}

/**
 * Place un patient dans la file d'un poste.
 *
 * Un sejour ne peut pas attendre a deux endroits en meme temps : la file
 * afficherait un patient que le poste ne verra pas venir, et l'attente
 * mesuree serait fausse aux deux endroits.
 */
export function placer(d: DemandePlacement): DecisionFlux<Passage> {
  if (!d.sejourPresent) {
    return refuse(
      'SEJOUR_NON_PRESENT',
      'Ce patient n est pas present dans l etablissement.',
      'L admettre d abord, puis le placer dans la file.',
    );
  }

  const ouvert = d.passagesOuverts.find((p) => p.etat === 'en-attente' || p.etat === 'en-cours');
  if (ouvert) {
    return ouvert.etat === 'en-cours'
      ? refuse(
          'DEJA_EN_COURS',
          'Ce patient est deja pris en charge a un autre poste.',
          'Terminer ce passage avant de le placer ailleurs.',
        )
      : refuse(
          'DEJA_EN_ATTENTE',
          'Ce patient attend deja a un autre poste.',
          'Le retirer de cette file, ou terminer son passage, avant de le placer ici.',
        );
  }

  return {
    ok: true,
    resultat: {
      id: '',
      sejourId: d.sejourId,
      posteId: d.posteId,
      gravite: d.gravite,
      etat: 'en-attente',
      arriveLe: d.quand,
      prisEnChargeLe: null,
      termineLe: null,
    },
  };
}

/** Appelle un patient : il quitte la file et passe en prise en charge. */
export function appeler(passage: Passage, quand: string): DecisionFlux<Passage> {
  if (passage.etat === 'en-cours') {
    return refuse('DEJA_EN_COURS', 'Ce patient est deja pris en charge.', 'Aucune action necessaire.');
  }
  if (passage.etat !== 'en-attente') {
    return refuse('PAS_EN_ATTENTE', 'Ce passage est clos.', 'Replacer le patient dans la file si besoin.');
  }
  return { ok: true, resultat: { ...passage, etat: 'en-cours', prisEnChargeLe: quand } };
}

/** Termine un passage : le patient peut etre oriente ailleurs. */
export function terminer(passage: Passage, quand: string): DecisionFlux<Passage> {
  if (passage.etat === 'termine' || passage.etat === 'parti') {
    return refuse('PASSAGE_CLOS', 'Ce passage est deja clos.', 'Aucune action necessaire.');
  }
  if (passage.etat !== 'en-cours') {
    return refuse(
      'PAS_EN_COURS',
      'Ce patient n a pas ete appele : son passage ne peut pas etre termine.',
      'L appeler d abord, ou le marquer parti s il a quitte la file.',
    );
  }
  return { ok: true, resultat: { ...passage, etat: 'termine', termineLe: quand } };
}

/**
 * Marque un patient parti sans avoir ete vu.
 *
 * Ce n'est pas un detail administratif : la part de patients qui repartent
 * avant d'etre appeles est l'indicateur le plus direct d'un poste sature.
 * L'enregistrer comme « termine » le ferait disparaitre de cette mesure.
 */
export function marquerParti(passage: Passage, quand: string): DecisionFlux<Passage> {
  if (passage.etat === 'termine' || passage.etat === 'parti') {
    return refuse('PASSAGE_CLOS', 'Ce passage est deja clos.', 'Aucune action necessaire.');
  }
  return { ok: true, resultat: { ...passage, etat: 'parti', termineLe: quand } };
}

// ------------------------------------------------------------------ mesures

export interface TensionPoste {
  posteId: string;
  enAttente: number;
  enCours: number;
  /** Attente du patient qui patiente depuis le plus longtemps, en minutes. */
  attenteMaxMinutes: number;
  attenteMedianeMinutes: number;
  /** Cas remontes par anciennete : un poste qui en accumule est sature. */
  remontes: number;
  /** Partis sans avoir ete vus, sur la periode fournie. */
  partis: number;
}

export function tension(posteId: string, passages: Passage[], maintenant: string): TensionPoste {
  const duPoste = passages.filter((p) => p.posteId === posteId);
  const classes = ordonner(duPoste, maintenant);
  const attentes = classes.map((p) => p.attenteMinutes).sort((a, b) => a - b);

  return {
    posteId,
    enAttente: classes.length,
    enCours: duPoste.filter((p) => p.etat === 'en-cours').length,
    attenteMaxMinutes: attentes.length === 0 ? 0 : attentes[attentes.length - 1],
    attenteMedianeMinutes: attentes.length === 0 ? 0 : attentes[Math.floor(attentes.length / 2)],
    remontes: classes.filter((p) => p.remonte).length,
    partis: duPoste.filter((p) => p.etat === 'parti').length,
  };
}
