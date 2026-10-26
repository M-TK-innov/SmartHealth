/**
 * Bloc operatoire : programmation des salles et checklist de securite.
 *
 * TROIS INVARIANTS :
 *
 *   1. ON N'INCISE PAS SANS TIME OUT. La checklist de securite de l'OMS
 *      existe parce qu'on a opere des gens du mauvais cote, et parfois la
 *      mauvaise personne. Ici le temps « avant incision » n'est pas un
 *      pense-bete a cocher apres coup : tant qu'il n'est pas complet,
 *      l'incision est REFUSEE.
 *
 *   2. UN GESTE LATERALISE DECLARE SON COTE. Pas de valeur par defaut, pas
 *      de « non precise » toléré. Un defaut silencieux sur une latéralité
 *      est exactement le mecanisme de l'erreur de cote.
 *
 *   3. UNE SALLE NE PORTE QU'UNE INTERVENTION A LA FOIS. Meme forme que
 *      l'invariant du lit, et pour la meme raison : la collision se
 *      cherche dans les interventions programmees, pas dans un etat de
 *      salle qu'un incident peut laisser en arriere.
 *
 * Module PUR : ni base ni horloge implicite.
 */

import { minutesEntre, versIso } from '../temps.ts';

export type EtatIntervention =
  | 'programmee'
  | 'patient-au-bloc'
  | 'en-cours'
  | 'terminee'
  | 'annulee'
  | 'deprogrammee';

/** Cote opere. « sans-objet » est un choix explicite, pas une absence. */
export type Lateralite = 'droite' | 'gauche' | 'bilateral' | 'sans-objet';

export interface Salle {
  id: string;
  code: string;
  nom: string;
}

export interface Intervention {
  id: string;
  patientId: string;
  sejourId: string | null;
  salleId: string;
  /** Libelle du geste. */
  geste: string;
  /**
   * Le geste porte-t-il sur un organe pair ou un membre ? C'est une
   * propriete du GESTE, pas une case que l'operateur remplit au moment de
   * programmer : la poser ici force a repondre avant le bloc.
   */
  lateralise: boolean;
  lateralite: Lateralite;
  debutPrevu: string;
  finPrevue: string;
  etat: EtatIntervention;
  operateurId: string | null;
  /**
   * Horodatages REELS, distincts du creneau prevu. Les confondre revient a
   * mesurer l'occupation du bloc sur le programme, c'est-a-dire a ne rien
   * mesurer : le programme ne glisse jamais, la realite si.
   */
  entreeLe: string | null;
  inciseLe: string | null;
  termineLe: string | null;
}

export type MotifRefusBloc =
  | 'SALLE_OCCUPEE'
  | 'CRENEAU_INVALIDE'
  | 'LATERALITE_REQUISE'
  | 'LATERALITE_INCOHERENTE'
  | 'CHECKLIST_INCOMPLETE'
  | 'ETAT_INCOMPATIBLE'
  | 'OPERATEUR_REQUIS';

export interface RefusBloc {
  ok: false;
  motif: MotifRefusBloc;
  message: string;
  remede: string;
}

export type DecisionBloc<T> = { ok: true; resultat: T } | RefusBloc;

function refuse(motif: MotifRefusBloc, message: string, remede: string): RefusBloc {
  return { ok: false, motif, message, remede };
}

/** Les etats pour lesquels la salle est reellement prise. */
const OCCUPANTS: EtatIntervention[] = ['programmee', 'patient-au-bloc', 'en-cours'];

// ------------------------------------------------------------ programmation

export interface DemandeProgrammation {
  intervention: Omit<Intervention, 'id' | 'etat' | 'entreeLe' | 'inciseLe' | 'termineLe'>;
  /** Interventions deja connues pour cette salle. */
  interventionsSalle: Intervention[];
}

/**
 * Programme une intervention dans une salle.
 *
 * La collision est cherchee dans les INTERVENTIONS, et non dans un etat de
 * salle : une salle marquee libre apres une panne de courant serait
 * doublement reservee sans que rien ne s'y oppose.
 */
export function programmer(d: DemandeProgrammation): DecisionBloc<Intervention> {
  const i = d.intervention;

  const debut = new Date(versIso(i.debutPrevu) ?? '').getTime();
  const fin = new Date(versIso(i.finPrevue) ?? '').getTime();
  if (!Number.isFinite(debut) || !Number.isFinite(fin) || fin <= debut) {
    return refuse(
      'CRENEAU_INVALIDE',
      'La fin prevue doit etre posterieure au debut.',
      'Corriger le creneau, en tenant compte de la duree reelle du geste.',
    );
  }

  const lat = verifierLateralite(i.lateralise, i.lateralite);
  if (lat) return lat;

  const collision = d.interventionsSalle.find(
    (autre) => OCCUPANTS.includes(autre.etat) && autre.salleId === i.salleId && chevauche(i, autre),
  );
  if (collision) {
    return refuse(
      'SALLE_OCCUPEE',
      `La salle est deja prise de ${heure(collision.debutPrevu)} a ${heure(collision.finPrevue)} par « ${collision.geste} ».`,
      'Choisir une autre salle, ou un creneau libre, ou deprogrammer l intervention en place.',
    );
  }

  return {
    ok: true,
    resultat: { ...i, id: '', etat: 'programmee', entreeLe: null, inciseLe: null, termineLe: null },
  };
}

/**
 * Deux creneaux se chevauchent-ils ?
 *
 * Bornes ouvertes : une intervention qui finit a 10 h 00 et une qui
 * commence a 10 h 00 ne se chevauchent pas. Les declarer en conflit
 * rendrait impossible toute programmation a la suite, et le bloc
 * programmerait a cote du logiciel.
 */
function chevauche(a: { debutPrevu: string; finPrevue: string }, b: Intervention): boolean {
  return a.debutPrevu < b.finPrevue && b.debutPrevu < a.finPrevue;
}

const heure = (iso: string) => iso.slice(11, 16);

function verifierLateralite(lateralise: boolean, lateralite: Lateralite): RefusBloc | null {
  if (!lateralise) {
    return lateralite === 'sans-objet'
      ? null
      : refuse(
          'LATERALITE_INCOHERENTE',
          `Ce geste n est pas lateralise, mais un cote « ${lateralite} » est declare.`,
          'Retirer le cote, ou corriger la nature du geste.',
        );
  }
  if (lateralite === 'sans-objet') {
    return refuse(
      'LATERALITE_REQUISE',
      'Ce geste porte sur un organe pair ou un membre : le cote doit etre declare.',
      'Indiquer droite, gauche ou bilateral, d apres le dossier et le marquage du patient.',
    );
  }
  return null;
}

// ------------------------------------------------------------- checklist

/**
 * Checklist de securite, en trois temps.
 *
 * Les trois temps de l'OMS, et l'ordre compte : chacun se fait a un moment
 * ou l'erreur qu'il attrape est encore rattrapable.
 */
export type TempsChecklist = 'avant-induction' | 'avant-incision' | 'avant-sortie';

export interface PointChecklist {
  cle: string;
  libelle: string;
  temps: TempsChecklist;
}

/**
 * Les points verifies. Volontairement COURTE : une checklist de trente
 * lignes se coche en bloc sans etre lue, et ne verifie plus rien.
 */
export const POINTS: PointChecklist[] = [
  { cle: 'identite', libelle: 'Identite du patient confirmee par le patient lui-meme', temps: 'avant-induction' },
  { cle: 'consentement', libelle: 'Consentement recueilli', temps: 'avant-induction' },
  { cle: 'site-marque', libelle: 'Site operatoire marque, ou geste non lateralise', temps: 'avant-induction' },
  { cle: 'allergies', libelle: 'Allergies connues verifiees', temps: 'avant-induction' },
  { cle: 'materiel', libelle: 'Materiel d anesthesie verifie', temps: 'avant-induction' },

  // Le « time out » : toute l'equipe s'arrete et confirme a voix haute.
  { cle: 'equipe-presentee', libelle: 'Chaque membre de l equipe s est nomme', temps: 'avant-incision' },
  { cle: 'patient-geste-site', libelle: 'Patient, geste et site confirmes a voix haute par toute l equipe', temps: 'avant-incision' },
  { cle: 'antibioprophylaxie', libelle: 'Antibioprophylaxie faite, ou non indiquee', temps: 'avant-incision' },
  { cle: 'imagerie-affichee', libelle: 'Imagerie necessaire affichee, ou non requise', temps: 'avant-incision' },

  { cle: 'comptage', libelle: 'Compresses et instruments comptes et complets', temps: 'avant-sortie' },
  { cle: 'etiquetage', libelle: 'Prelevements etiquetes au nom du patient', temps: 'avant-sortie' },
  { cle: 'suites', libelle: 'Consignes de surveillance transmises', temps: 'avant-sortie' },
];

export interface Checklist {
  interventionId: string;
  /** Cles des points coches. */
  coches: string[];
}

export function pointsDuTemps(temps: TempsChecklist): PointChecklist[] {
  return POINTS.filter((p) => p.temps === temps);
}

/** Points d'un temps qui restent a cocher. */
export function manquants(checklist: Checklist, temps: TempsChecklist): PointChecklist[] {
  const faits = new Set(checklist.coches);
  return pointsDuTemps(temps).filter((p) => !faits.has(p.cle));
}

export function tempsComplet(checklist: Checklist, temps: TempsChecklist): boolean {
  return manquants(checklist, temps).length === 0;
}

// ------------------------------------------------------------- transitions

/** Le patient entre au bloc : le temps « avant induction » doit etre fait. */
export function entrerAuBloc(
  intervention: Intervention,
  checklist: Checklist,
  quand: string,
): DecisionBloc<Intervention> {
  if (intervention.etat !== 'programmee') {
    return refuse(
      'ETAT_INCOMPATIBLE',
      `Cette intervention est « ${intervention.etat} » : le patient ne peut pas y entrer.`,
      'Verifier le programme du jour.',
    );
  }
  const reste = manquants(checklist, 'avant-induction');
  if (reste.length > 0) {
    return refuseChecklist('avant-induction', reste);
  }
  return { ok: true, resultat: { ...intervention, etat: 'patient-au-bloc', entreeLe: quand } };
}

/**
 * L'incision.
 *
 * C'est le point de non-retour du dossier : apres, l'erreur de cote a eu
 * lieu. Le temps « avant incision » est donc une condition, pas un rappel.
 */
export function inciser(
  intervention: Intervention,
  checklist: Checklist,
  quand: string,
): DecisionBloc<Intervention> {
  if (intervention.etat !== 'patient-au-bloc') {
    return refuse(
      'ETAT_INCOMPATIBLE',
      intervention.etat === 'en-cours'
        ? 'L intervention a deja commence.'
        : 'Le patient n est pas encore au bloc.',
      'Enregistrer son entree au bloc, apres le temps « avant induction ».',
    );
  }
  if (!intervention.operateurId) {
    return refuse(
      'OPERATEUR_REQUIS',
      'Aucun operateur n est enregistre pour cette intervention.',
      'Renseigner l operateur avant l incision.',
    );
  }
  const lat = verifierLateralite(intervention.lateralise, intervention.lateralite);
  if (lat) return lat;

  const reste = manquants(checklist, 'avant-incision');
  if (reste.length > 0) {
    return refuseChecklist('avant-incision', reste);
  }
  return { ok: true, resultat: { ...intervention, etat: 'en-cours', inciseLe: quand } };
}

/** Sortie de salle : le comptage et l'etiquetage doivent etre faits. */
export function sortirDeSalle(
  intervention: Intervention,
  checklist: Checklist,
  quand: string,
): DecisionBloc<Intervention> {
  if (intervention.etat !== 'en-cours') {
    return refuse(
      'ETAT_INCOMPATIBLE',
      'Cette intervention n est pas en cours.',
      'Verifier l etat de l intervention.',
    );
  }
  const reste = manquants(checklist, 'avant-sortie');
  if (reste.length > 0) {
    return refuseChecklist('avant-sortie', reste);
  }
  return { ok: true, resultat: { ...intervention, etat: 'terminee', termineLe: quand } };
}

function refuseChecklist(temps: TempsChecklist, reste: PointChecklist[]): RefusBloc {
  const libelle = {
    'avant-induction': 'avant induction',
    'avant-incision': 'avant incision',
    'avant-sortie': 'avant sortie de salle',
  }[temps];
  return refuse(
    'CHECKLIST_INCOMPLETE',
    `Checklist « ${libelle} » incomplete : ${reste.length} point${reste.length > 1 ? 's' : ''} non verifie${reste.length > 1 ? 's' : ''}.`,
    // Le remede NOMME ce qui manque. « Checklist incomplete » tout court
    // fait rouvrir un ecran et relire douze lignes, un jour ou l'equipe
    // est pressee — c'est ainsi qu'on finit par tout cocher d'un bloc.
    `Verifier et cocher : ${reste.map((p) => p.libelle).join(' ; ')}.`,
  );
}

// ------------------------------------------------------------------ vue

export interface ProgrammeSalle {
  salleId: string;
  interventions: Intervention[];
  /** Minutes de salle reellement programmees sur la journee. */
  minutesProgrammees: number;
}

/** Le programme d'une salle, dans l'ordre du passage. */
export function programmeDeLaSalle(salleId: string, interventions: Intervention[]): ProgrammeSalle {
  const retenues = interventions
    .filter((i) => i.salleId === salleId && OCCUPANTS.includes(i.etat))
    .sort((a, b) => (a.debutPrevu < b.debutPrevu ? -1 : a.debutPrevu > b.debutPrevu ? 1 : 0));

  return {
    salleId,
    interventions: retenues,
    minutesProgrammees: retenues.reduce(
      (n, i) =>
        n + minutesEntre(i.debutPrevu, i.finPrevue),
      0,
    ),
  };
}
