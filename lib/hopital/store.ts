/**
 * Persistance du sejour hospitalier.
 *
 * Les REGLES vivent dans sejour.ts, qui est pur. Ce module fait trois choses
 * et rien d'autre : lire l'etat, soumettre la demande aux regles, et ecrire ce
 * qu'elles ont accorde. Le code qui decide n'a pas besoin d'une base pour etre
 * teste, et celui qui ecrit n'a pas besoin de re-juger.
 *
 * TOUT PASSE PAR UNE TRANSACTION. Un mouvement touche le sejour, le lit quitte,
 * le lit pris et le journal des mouvements : interrompu au milieu, il
 * laisserait un patient sans lit ou un lit sans patient. La base porte par
 * ailleurs un index unique sur le lit d'un sejour en cours, pour que
 * l'invariant tienne meme si deux ecritures arrivent en meme temps.
 */

import { randomUUID } from 'node:crypto';
import { all, audit, get, insert, run, tx, update } from '../db.ts';
import {
  admettre,
  fairesortir,
  occupation,
  transferer,
  type Decision,
  type EtatLit,
  type Lit,
  type OccupationUnite,
  type Sejour,
  type TypeSejour,
} from './sejour.ts';

interface LigneLit {
  id: string;
  unite_id: string;
  chambre: string | null;
  code: string;
  etat: EtatLit;
  isolement: number;
}

interface LigneSejour {
  id: string;
  patient_id: string;
  organization_id: string | null;
  type: TypeSejour;
  statut: Sejour['statut'];
  lit_id: string | null;
  motif: string | null;
  mode_entree: string | null;
  mode_sortie: string | null;
  admis_le: string | null;
  sorti_le: string | null;
}

const versLit = (l: LigneLit): Lit => ({
  id: l.id,
  code: l.code,
  uniteId: l.unite_id,
  chambreId: l.chambre,
  etat: l.etat,
  isolement: l.isolement === 1,
});

const versSejour = (s: LigneSejour): Sejour => ({
  id: s.id,
  patientId: s.patient_id,
  type: s.type,
  statut: s.statut,
  litId: s.lit_id,
  admisLe: s.admis_le,
  sortiLe: s.sorti_le,
});

// ------------------------------------------------------------------ lecture

export function litParId(id: string): Lit | null {
  const l = get<LigneLit>('SELECT * FROM lit WHERE id = ?', [id]);
  return l ? versLit(l) : null;
}

export function sejourParId(id: string): Sejour | null {
  const s = get<LigneSejour>('SELECT * FROM sejour WHERE id = ?', [id]);
  return s ? versSejour(s) : null;
}

/**
 * Les sejours qui occupent actuellement un lit.
 *
 * C'est l'etat de reference pour la detection de collision : les regles le
 * recoivent, et non l'etat des lits.
 */
export function sejoursEnCours(organizationId: string | null): Sejour[] {
  return all<LigneSejour>(
    `SELECT * FROM sejour
      WHERE statut = 'en-cours' AND (? IS NULL OR organization_id = ? OR organization_id IS NULL)`,
    [organizationId, organizationId],
  ).map(versSejour);
}

export function litsDUnite(uniteId: string): Lit[] {
  return all<LigneLit>('SELECT * FROM lit WHERE unite_id = ? ORDER BY code', [uniteId]).map(versLit);
}

export interface UniteAvecOccupation extends OccupationUnite {
  code: string;
  nom: string;
  categorie: string;
}

/** Tableau d'occupation, unite par unite — la vue de la direction. */
export function tableauOccupation(organizationId: string | null): UniteAvecOccupation[] {
  const unites = all<{ id: string; code: string; nom: string; categorie: string }>(
    `SELECT id, code, nom, categorie FROM unite_soins
      WHERE actif = 1 AND (? IS NULL OR organization_id = ? OR organization_id IS NULL)
      ORDER BY nom`,
    [organizationId, organizationId],
  );
  const enCours = sejoursEnCours(organizationId);

  return unites.map((u) => ({
    ...occupation(u.id, litsDUnite(u.id), enCours),
    code: u.code,
    nom: u.nom,
    categorie: u.categorie,
  }));
}

export interface SejourPresent {
  id: string;
  patientNom: string;
  type: string;
  litCode: string | null;
  uniteNom: string | null;
  admisLe: string | null;
}

/** Les patients actuellement presents, pour le tableau de bord. */
export function sejoursPresents(organizationId: string | null): SejourPresent[] {
  return all<{
    id: string;
    given_name: string;
    family_name: string;
    type: string;
    lit_code: string | null;
    unite_nom: string | null;
    admis_le: string | null;
  }>(
    `SELECT s.id, p.given_name, p.family_name, s.type, s.admis_le,
            l.code AS lit_code, u.nom AS unite_nom
       FROM sejour s
       JOIN patient p ON p.id = s.patient_id
       LEFT JOIN lit l ON l.id = s.lit_id
       LEFT JOIN unite_soins u ON u.id = l.unite_id
      WHERE s.statut = 'en-cours'
        AND (? IS NULL OR s.organization_id = ? OR s.organization_id IS NULL)
      ORDER BY s.admis_le DESC`,
    [organizationId, organizationId],
  ).map((r) => ({
    id: r.id,
    patientNom: `${r.given_name} ${r.family_name}`,
    type: r.type,
    litCode: r.lit_code,
    uniteNom: r.unite_nom,
    admisLe: r.admis_le,
  }));
}

export interface ConsultationDuSejour {
  id: string;
  status: string;
  reason_text: string | null;
  started_at: string;
  signed_at: string | null;
}

/**
 * Les consultations rattachees a un sejour.
 *
 * Par le LIEN et non par les dates. Recoller un dossier d'hospitalisation
 * en prenant les consultations du meme patient entre l'admission et la
 * sortie y fait entrer la consultation externe qu'il a eue le meme jour
 * dans un autre service — et la fait disparaitre de son propre dossier.
 */
export function consultationsDuSejour(sejourId: string): ConsultationDuSejour[] {
  return all<ConsultationDuSejour>(
    `SELECT id, status, reason_text, started_at, signed_at
       FROM consultation WHERE sejour_id = ? ORDER BY started_at DESC`,
    [sejourId],
  );
}

export interface MouvementDuSejour {
  id: string;
  type: string;
  motif: string | null;
  survenu_le: string;
  lit_code: string | null;
  unite_nom: string | null;
}

/** Le parcours du patient dans l'etablissement, mouvement par mouvement. */
export function mouvementsDuSejour(sejourId: string): MouvementDuSejour[] {
  return all<MouvementDuSejour>(
    `SELECT m.id, m.type, m.motif, m.survenu_le,
            l.code AS lit_code, u.nom AS unite_nom
       FROM mouvement m
       LEFT JOIN lit l ON l.id = m.lit_id
       LEFT JOIN unite_soins u ON u.id = COALESCE(m.unite_id, l.unite_id)
      WHERE m.sejour_id = ?
      ORDER BY m.survenu_le`,
    [sejourId],
  );
}

// ------------------------------------------------------------------ ecriture

function journaliser(params: {
  sejourId: string;
  litId: string | null;
  uniteId: string | null;
  type: 'admission' | 'transfert' | 'sortie';
  motif?: string | null;
  acteurId?: string | null;
  quand: string;
}) {
  insert('mouvement', {
    id: randomUUID(),
    sejour_id: params.sejourId,
    lit_id: params.litId,
    unite_id: params.uniteId,
    type: params.type,
    motif: params.motif ?? null,
    acteur_id: params.acteurId ?? null,
    survenu_le: params.quand,
  });
}

/**
 * Un lit quitte repasse « a preparer », jamais « libre ».
 *
 * Un lit qui vient d'etre occupe n'est pas pret. Le rendre libre inviterait a
 * y installer le patient suivant avant le nettoyage — et c'est le genre de
 * raccourci qu'un service sous tension prend sans y penser.
 */
function libererLit(litId: string | null) {
  if (litId) run("UPDATE lit SET etat = 'a-preparer' WHERE id = ?", [litId]);
}

export interface Contexte {
  acteurId: string | null;
  organizationId: string | null;
}

/** Admet un patient : statut, lit, mouvement et journal, en une transaction. */
export function admettrePatient(
  sejourId: string,
  litId: string | null,
  ctx: Contexte,
  quand = new Date().toISOString(),
): Decision<Sejour> {
  const s = sejourParId(sejourId);
  if (!s) return { ok: false, motif: 'SEJOUR_CLOS', message: 'Sejour introuvable.', remede: 'Verifier la reference.' };
  const lit = litId ? litParId(litId) : undefined;

  const d = admettre({ sejour: s, lit: lit ?? undefined, sejoursEnCours: sejoursEnCours(ctx.organizationId), quand });
  if (!d.ok) return d;

  return tx(() => {
    update('sejour', s.id, {
      statut: 'en-cours',
      lit_id: d.resultat.sejour.litId,
      admis_le: quand,
      updated_at: quand,
    });
    if (d.resultat.lit) run("UPDATE lit SET etat = 'occupe' WHERE id = ?", [d.resultat.lit.id]);
    journaliser({
      sejourId: s.id,
      litId: d.resultat.sejour.litId,
      uniteId: d.resultat.lit?.uniteId ?? null,
      type: 'admission',
      acteurId: ctx.acteurId,
      quand,
    });
    audit({
      action: 'create',
      entity: 'sejour',
      entityId: s.id,
      patientId: s.patientId,
      actorId: ctx.acteurId ?? undefined,
      detail: { mouvement: 'admission', lit: d.resultat.lit?.code ?? null },
    });
    return { ok: true as const, resultat: d.resultat.sejour };
  });
}

/** Transfere un patient vers un autre lit. */
export function transfererPatient(
  sejourId: string,
  litCibleId: string,
  ctx: Contexte,
  motif: string | null = null,
  quand = new Date().toISOString(),
): Decision<Sejour> {
  const s = sejourParId(sejourId);
  if (!s) return { ok: false, motif: 'SEJOUR_CLOS', message: 'Sejour introuvable.', remede: 'Verifier la reference.' };
  const cible = litParId(litCibleId);
  if (!cible) {
    return { ok: false, motif: 'LIT_HORS_SERVICE', message: 'Lit introuvable.', remede: 'Choisir un lit existant.' };
  }

  const d = transferer({ sejour: s, litCible: cible, sejoursEnCours: sejoursEnCours(ctx.organizationId), quand });
  if (!d.ok) return d;

  return tx(() => {
    libererLit(d.resultat.litQuitte);
    update('sejour', s.id, { lit_id: d.resultat.litPris.id, updated_at: quand });
    run("UPDATE lit SET etat = 'occupe' WHERE id = ?", [d.resultat.litPris.id]);
    journaliser({
      sejourId: s.id,
      litId: d.resultat.litPris.id,
      uniteId: d.resultat.litPris.uniteId,
      type: 'transfert',
      motif,
      acteurId: ctx.acteurId,
      quand,
    });
    audit({
      action: 'update',
      entity: 'sejour',
      entityId: s.id,
      patientId: s.patientId,
      actorId: ctx.acteurId ?? undefined,
      detail: { mouvement: 'transfert', vers: d.resultat.litPris.code, motif },
    });
    return { ok: true as const, resultat: d.resultat.sejour };
  });
}

/** Fait sortir un patient et libere son lit. */
export function sortirPatient(
  sejourId: string,
  ctx: Contexte,
  modeSortie: string | null = null,
  quand = new Date().toISOString(),
): Decision<Sejour> {
  const s = sejourParId(sejourId);
  if (!s) return { ok: false, motif: 'SEJOUR_CLOS', message: 'Sejour introuvable.', remede: 'Verifier la reference.' };

  const d = fairesortir({ sejour: s, quand });
  if (!d.ok) return d;

  return tx(() => {
    libererLit(d.resultat.litLibere);
    update('sejour', s.id, {
      statut: 'sorti',
      lit_id: null,
      sorti_le: quand,
      mode_sortie: modeSortie,
      updated_at: quand,
    });
    journaliser({
      sejourId: s.id,
      litId: d.resultat.litLibere,
      uniteId: null,
      type: 'sortie',
      motif: modeSortie,
      acteurId: ctx.acteurId,
      quand,
    });
    audit({
      action: 'update',
      entity: 'sejour',
      entityId: s.id,
      patientId: s.patientId,
      actorId: ctx.acteurId ?? undefined,
      detail: { mouvement: 'sortie', mode: modeSortie },
    });
    return { ok: true as const, resultat: d.resultat.sejour };
  });
}

/** Marque un lit prepare, apres nettoyage. */
export function preparerLit(litId: string, ctx: Contexte): boolean {
  const l = litParId(litId);
  if (!l || l.etat !== 'a-preparer') return false;
  run("UPDATE lit SET etat = 'libre' WHERE id = ?", [litId]);
  audit({ action: 'update', entity: 'lit', entityId: litId, actorId: ctx.acteurId ?? undefined, detail: { etat: 'libre' } });
  return true;
}
