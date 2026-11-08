import { randomBytes } from 'node:crypto';
import { all, audit, get, insert, nowIso, run, uid } from '../db.ts';
import { createConsultation } from '../repo.ts';
import {
  peutAnnuler,
  peutConsentir,
  peutDemarrer,
  peutPoser,
  salleOuverte,
  type CreneauPris,
  type Decision,
  type EtatRendezVous,
  type ModeRendezVous,
} from './regles.ts';

/**
 * Rendez-vous et teleconsultation : acces a la base.
 *
 * LA DECISION VIT DANS `regles.ts`, QUI EST PUR ET TESTE. Ici on se contente
 * de lire l'etat, de le soumettre aux regles, et d'ecrire ce qu'elles ont
 * accorde. Un refus n'ecrit jamais rien — c'est ce qui permet de faire
 * confiance au planning plutot qu'a la memoire de celui qui l'a rempli.
 */

export interface RendezVous {
  id: string;
  patient_id: string;
  practitioner_id: string | null;
  organization_id: string | null;
  mode: ModeRendezVous;
  motif: string | null;
  debut: string;
  duree_min: number;
  etat: EtatRendezVous;
  consultation_id: string | null;
  salle: string | null;
  consentement_le: string | null;
  annule_motif: string | null;
}

export interface Acteur {
  id: string;
  label?: string | null;
  organizationId?: string | null;
}

const refus = (motif: string): Decision<never> => ({ ok: false, motif });

export function rendezVousParId(id: string): RendezVous | undefined {
  return get<RendezVous>('SELECT * FROM rendez_vous WHERE id = ?', [id]);
}

/**
 * Le rendez-vous d'une salle.
 *
 * La recherche part du JETON, jamais de l'identifiant du rendez-vous : c'est
 * ce qui fait que connaitre un rendez-vous ne donne pas l'entree d'une salle.
 */
export function rendezVousParSalle(salle: string): RendezVous | undefined {
  if (!salle) return undefined;
  return get<RendezVous>('SELECT * FROM rendez_vous WHERE salle = ?', [salle]);
}

/** Le planning d'un praticien, pour verifier les chevauchements. */
export function planningDe(practitionerId: string, autourDe: string): CreneauPris[] {
  // Une fenetre d'un jour de part et d'autre suffit : un rendez-vous ne dure
  // jamais assez pour chevaucher un creneau situe deux jours plus loin, et
  // charger tout le planning d'un praticien pour poser un rendez-vous serait
  // payer l'historique a chaque prise.
  const jour = autourDe.slice(0, 10);
  return all<CreneauPris>(
    `SELECT id, debut, duree_min AS dureeMin, etat
       FROM rendez_vous
      WHERE practitioner_id = ?
        AND debut >= date(?, '-1 day')
        AND debut <= date(?, '+2 days')`,
    [practitionerId, jour, jour],
  );
}

/** Les rendez-vous d'un praticien pour un jour donne, a l'heure croissante. */
export function journeeDe(practitionerId: string, jour: string): RendezVous[] {
  return all<RendezVous>(
    `SELECT * FROM rendez_vous
      WHERE practitioner_id = ? AND substr(debut, 1, 10) = ?
      ORDER BY debut`,
    [practitionerId, jour],
  );
}

export interface EntreeRendezVous {
  patientId: string;
  practitionerId: string;
  organizationId: string | null;
  mode: ModeRendezVous;
  motif: string | null;
  debut: string;
  dureeMin: number;
}

/**
 * Pose un rendez-vous.
 *
 * LE JETON DE SALLE EST TIRE AU HASARD, et seulement pour une consultation a
 * distance. Le deduire de l'identifiant du rendez-vous — ce qui serait plus
 * simple — ferait de chaque identifiant connu l'entree d'une salle.
 */
export function poserRendezVous(e: EntreeRendezVous, acteur: Acteur): Decision<RendezVous> {
  const decision = peutPoser(
    { debut: e.debut, dureeMin: e.dureeMin, mode: e.mode, motif: e.motif },
    planningDe(e.practitionerId, e.debut),
    nowIso(),
  );
  if (!decision.ok) return decision;

  const id = uid();
  insert('rendez_vous', {
    id,
    patient_id: e.patientId,
    practitioner_id: e.practitionerId,
    organization_id: e.organizationId,
    mode: e.mode,
    motif: e.motif,
    debut: e.debut,
    duree_min: e.dureeMin,
    etat: 'confirme',
    consultation_id: null,
    salle: e.mode === 'distance' ? randomBytes(16).toString('hex') : null,
    consentement_le: null,
    annule_par: null,
    annule_motif: null,
    cree_par: acteur.id,
    cree_le: nowIso(),
  });

  audit({
    action: 'create',
    entity: 'rendez_vous',
    entityId: id,
    patientId: e.patientId,
    actorId: acteur.id,
    actorLabel: acteur.label ?? undefined,
    detail: { debut: e.debut, mode: e.mode, dureeMin: e.dureeMin },
  });

  return { ok: true, resultat: rendezVousParId(id)! };
}

/** Annule un rendez-vous. Le motif est exige par les regles. */
export function annulerRendezVous(
  id: string,
  motif: string | null,
  acteur: Acteur,
): Decision<RendezVous> {
  const r = rendezVousParId(id);
  if (!r) return refus('Rendez-vous introuvable.');

  const decision = peutAnnuler(r.etat, motif);
  if (!decision.ok) return decision;

  run(
    `UPDATE rendez_vous
        SET etat = 'annule', annule_par = ?, annule_motif = ?,
            -- Le jeton est EFFACE, pas seulement masque : une salle dont le
            -- rendez-vous est annule ne doit plus exister, meme pour qui
            -- aurait note le lien.
            salle = NULL
      WHERE id = ?`,
    [acteur.id, decision.resultat, id],
  );

  audit({
    action: 'update',
    entity: 'rendez_vous',
    entityId: id,
    patientId: r.patient_id,
    actorId: acteur.id,
    actorLabel: acteur.label ?? undefined,
    detail: { etat: 'annule', motif: decision.resultat },
  });

  return { ok: true, resultat: rendezVousParId(id)! };
}

/**
 * Enregistre l'accord du patient pour la consultation a distance.
 *
 * L'appelant a deja verifie que ce rendez-vous appartient a la session du
 * patient : cette fonction ne recoit jamais d'identifiant venu de l'adresse
 * sans ce controle.
 */
export function consentirADistance(id: string): Decision<RendezVous> {
  const r = rendezVousParId(id);
  if (!r) return refus('Rendez-vous introuvable.');

  const decision = peutConsentir(r.mode, r.etat, r.consentement_le !== null);
  if (!decision.ok) return decision;

  const quand = nowIso();
  run('UPDATE rendez_vous SET consentement_le = ? WHERE id = ?', [quand, id]);

  // Journalise au nom du PATIENT : c'est lui qui a consenti, et un
  // consentement attribue a un soignant ne vaudrait rien.
  audit({
    action: 'update',
    entity: 'rendez_vous',
    entityId: id,
    patientId: r.patient_id,
    actorLabel: 'patient',
    detail: { consentement_le: quand },
  });

  return { ok: true, resultat: rendezVousParId(id)! };
}

export interface SalleOuverte {
  salle: string;
  consultationId: string;
}

/**
 * Ouvre la salle et attache une consultation au rendez-vous.
 *
 * LA CONSULTATION EST LA MEME QU'AU CABINET. Une teleconsultation n'a pas son
 * propre dossier : elle produit un compte rendu, des diagnostics et des
 * ordonnances qui rejoignent le dossier du patient comme n'importe quelle
 * autre. Scinder selon le canal n'aurait aucun sens clinique — le patient,
 * lui, n'a qu'une histoire.
 */
export function demarrerTeleconsultation(id: string, acteur: Acteur): Decision<SalleOuverte> {
  const r = rendezVousParId(id);
  if (!r) return refus('Rendez-vous introuvable.');

  const decision = peutDemarrer(
    r.mode,
    r.etat,
    r.consentement_le !== null,
    r.debut,
    r.duree_min,
    nowIso(),
  );
  if (!decision.ok) return decision;
  if (!r.salle) return refus('Ce rendez-vous n a pas de salle.');

  // Rejouer le demarrage ne doit pas creer une seconde consultation : deux
  // comptes rendus pour une seule rencontre, c'est un dossier faux.
  const consultationId =
    r.consultation_id ??
    createConsultation(r.patient_id, r.practitioner_id, r.motif ?? 'Consultation a distance', r.organization_id);

  run("UPDATE rendez_vous SET etat = 'en-cours', consultation_id = ? WHERE id = ?", [
    consultationId,
    id,
  ]);

  audit({
    action: 'update',
    entity: 'rendez_vous',
    entityId: id,
    patientId: r.patient_id,
    actorId: acteur.id,
    actorLabel: acteur.label ?? undefined,
    detail: { etat: 'en-cours', consultationId },
  });

  return { ok: true, resultat: { salle: r.salle, consultationId } };
}

/**
 * Clot la consultation a distance.
 *
 * Le jeton de salle est efface : la porte se referme derriere la consultation
 * terminee. Garder le jeton « au cas ou » laisserait un lien valable
 * indefiniment, et c'est exactement ce qu'on ne veut pas d'une salle ou deux
 * personnes ont parle de sante.
 */
export function cloreTeleconsultation(id: string, acteur: Acteur): Decision<RendezVous> {
  const r = rendezVousParId(id);
  if (!r) return refus('Rendez-vous introuvable.');
  if (r.etat === 'honore') return refus('Ce rendez-vous est deja clos.');

  run("UPDATE rendez_vous SET etat = 'honore', salle = NULL WHERE id = ?", [id]);

  audit({
    action: 'update',
    entity: 'rendez_vous',
    entityId: id,
    patientId: r.patient_id,
    actorId: acteur.id,
    actorLabel: acteur.label ?? undefined,
    detail: { etat: 'honore' },
  });

  return { ok: true, resultat: rendezVousParId(id)! };
}

/** La salle de ce jeton est-elle utilisable maintenant ? */
export function salleUtilisable(r: RendezVous): boolean {
  if (r.mode !== 'distance' || !r.salle) return false;
  if (r.etat === 'annule' || r.etat === 'honore' || r.etat === 'absent') return false;
  if (!r.consentement_le) return false;
  return salleOuverte(r.debut, r.duree_min, nowIso());
}
