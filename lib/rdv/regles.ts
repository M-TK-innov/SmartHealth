/**
 * Regles des rendez-vous et de la teleconsultation.
 *
 * MODULE PUR : ni base, ni horloge, ni hasard. L'appelant fournit l'instant et
 * l'etat du planning ; ce fichier ne fait que trancher. C'est ce qui permet de
 * tester un chevauchement sans monter une base, et de tester « hier » sans
 * attendre demain.
 *
 * CE QUE CES REGLES PROTEGENT
 *
 * Un planning qui accepte deux patients sur le meme creneau ne se voit pas a
 * l'ecriture : il se voit le matin, quand deux personnes attendent la meme
 * porte. Un refus a la prise du rendez-vous coute une minute ; le meme defaut
 * decouvert en salle d'attente coute la confiance.
 *
 * Et pour la teleconsultation : l'accord du patient se recueille AVANT que la
 * video ne s'ouvre. Apres, il n'a plus de valeur — on ne demande pas a
 * quelqu'un s'il accepte d'etre filme une fois la camera allumee.
 */

export type ModeRendezVous = 'presentiel' | 'distance';

export type EtatRendezVous =
  | 'propose'
  | 'confirme'
  | 'en-salle'
  | 'en-cours'
  | 'honore'
  | 'annule'
  | 'absent';

/** Issue d'une decision : accordee avec son resultat, ou refusee avec son motif. */
export type Decision<T> = { ok: true; resultat: T } | { ok: false; motif: string };

const refus = (motif: string): Decision<never> => ({ ok: false, motif });

/** Un creneau deja pris, tel que le planning le connait. */
export interface CreneauPris {
  id: string;
  debut: string;
  dureeMin: number;
  etat: EtatRendezVous;
}

export interface DemandeRendezVous {
  debut: string;
  dureeMin: number;
  mode: ModeRendezVous;
  motif: string | null;
}

/** Duree minimale et maximale d'un rendez-vous, en minutes. */
export const DUREE_MIN = 5;
export const DUREE_MAX = 240;

/**
 * Un rendez-vous annule ou non honore ne bloque plus le creneau.
 *
 * Sans cette distinction, annuler ne libererait rien et le planning se
 * remplirait de trous impossibles a reutiliser — ce qui pousse a creer des
 * rendez-vous « hors creneau » et vide le planning de son sens.
 */
export function occupeLeCreneau(etat: EtatRendezVous): boolean {
  return etat !== 'annule' && etat !== 'absent';
}

/** Fin d'un creneau, en minutes depuis l'epoque, a partir de son debut. */
function minutes(iso: string): number {
  return Math.floor(Date.parse(iso.replace(' ', 'T')) / 60_000);
}

/**
 * Deux creneaux se chevauchent-ils ?
 *
 * Bornes ouvertes a droite : un rendez-vous de 09:00 a 09:20 et un autre a
 * 09:20 ne se chevauchent pas. Les traiter comme un conflit interdirait les
 * plannings serres, qui sont la norme en consultation.
 */
export function seChevauchent(
  aDebut: string,
  aDuree: number,
  bDebut: string,
  bDuree: number,
): boolean {
  const a0 = minutes(aDebut);
  const b0 = minutes(bDebut);
  return a0 < b0 + bDuree && b0 < a0 + aDuree;
}

/**
 * Peut-on poser ce rendez-vous ?
 *
 * `maintenant` et le planning du praticien viennent de l'appelant : cette
 * fonction ne lit ni l'horloge ni la base.
 */
export function peutPoser(
  demande: DemandeRendezVous,
  planning: CreneauPris[],
  maintenant: string,
): Decision<DemandeRendezVous> {
  if (!demande.debut || Number.isNaN(Date.parse(demande.debut.replace(' ', 'T')))) {
    return refus('Date de rendez-vous illisible.');
  }
  if (!Number.isInteger(demande.dureeMin) || demande.dureeMin < DUREE_MIN) {
    return refus(`Duree trop courte : ${DUREE_MIN} minutes au minimum.`);
  }
  if (demande.dureeMin > DUREE_MAX) {
    return refus(`Duree trop longue : ${DUREE_MAX} minutes au maximum.`);
  }
  if (minutes(demande.debut) < minutes(maintenant)) {
    // On refuse le passe plutot que de l'accepter en silence : un rendez-vous
    // pose hier n'est pas un rendez-vous, c'est une erreur de saisie, et il
    // n'apparaitrait jamais dans « a venir » chez le patient.
    return refus('Ce creneau est deja passe.');
  }

  const conflit = planning
    .filter((c) => occupeLeCreneau(c.etat))
    .find((c) => seChevauchent(demande.debut, demande.dureeMin, c.debut, c.dureeMin));
  if (conflit) {
    return refus(
      `Ce praticien a deja un rendez-vous a ${conflit.debut.slice(11, 16)}. Choisissez un autre creneau.`,
    );
  }

  return { ok: true, resultat: demande };
}

/**
 * Peut-on annuler ce rendez-vous ?
 *
 * Le motif est EXIGE. Une annulation sans motif ne se distingue pas d'une
 * erreur de manipulation, et c'est le patient qui appelle pour comprendre.
 */
export function peutAnnuler(etat: EtatRendezVous, motif: string | null): Decision<string> {
  if (etat === 'annule') return refus('Ce rendez-vous est deja annule.');
  if (etat === 'honore') return refus('Ce rendez-vous a eu lieu : il ne s annule plus.');
  if (etat === 'en-cours') {
    return refus('La consultation est en cours. Terminez-la plutot que de l annuler.');
  }
  const propre = (motif ?? '').trim();
  if (propre.length < 3) return refus('Indiquez le motif de l annulation.');
  return { ok: true, resultat: propre };
}

/**
 * Le patient peut-il donner son accord pour la consultation a distance ?
 *
 * Donner son accord sur un rendez-vous en presentiel n'a pas de sens, et
 * l'accepter laisserait croire qu'un consentement a l'enregistrement a ete
 * recueilli alors qu'il n'a jamais ete demande.
 */
export function peutConsentir(
  mode: ModeRendezVous,
  etat: EtatRendezVous,
  dejaConsenti: boolean,
): Decision<true> {
  if (mode !== 'distance') return refus('Ce rendez-vous a lieu sur place.');
  if (etat === 'annule') return refus('Ce rendez-vous est annule.');
  if (etat === 'honore') return refus('Ce rendez-vous a deja eu lieu.');
  if (dejaConsenti) return refus('Votre accord a deja ete enregistre.');
  return { ok: true, resultat: true };
}

/** Combien de minutes avant l'heure la salle s'ouvre. */
export const OUVERTURE_SALLE_MIN = 15;

/**
 * La salle est-elle ouverte ?
 *
 * Elle ouvre un quart d'heure avant et reste ouverte jusqu'a la fin du
 * creneau, plus une marge : une consultation qui deborde ne doit pas se
 * couper au milieu d'une phrase.
 */
export function salleOuverte(
  debut: string,
  dureeMin: number,
  maintenant: string,
  margeMin = 30,
): boolean {
  const m = minutes(maintenant);
  const d = minutes(debut);
  return m >= d - OUVERTURE_SALLE_MIN && m <= d + dureeMin + margeMin;
}

/**
 * Le praticien peut-il demarrer la consultation a distance ?
 *
 * TROIS CONDITIONS, ET AUCUNE N'EST NEGOCIABLE : le patient a donne son
 * accord, le rendez-vous est bien a distance, et l'heure est venue. Demarrer
 * sans accord reviendrait a ouvrir la camera chez quelqu'un qui n'a rien
 * accepte.
 */
export function peutDemarrer(
  mode: ModeRendezVous,
  etat: EtatRendezVous,
  consenti: boolean,
  debut: string,
  dureeMin: number,
  maintenant: string,
): Decision<true> {
  if (mode !== 'distance') return refus('Ce rendez-vous a lieu sur place.');
  if (etat === 'annule') return refus('Ce rendez-vous est annule.');
  if (etat === 'honore') return refus('Ce rendez-vous a deja eu lieu.');
  if (!consenti) {
    return refus('Le patient n a pas encore donne son accord pour la consultation a distance.');
  }
  if (!salleOuverte(debut, dureeMin, maintenant)) {
    return refus(
      `La salle ouvre ${OUVERTURE_SALLE_MIN} minutes avant l heure du rendez-vous.`,
    );
  }
  return { ok: true, resultat: true };
}
