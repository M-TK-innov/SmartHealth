/**
 * Persistance du bloc operatoire.
 *
 * Les REGLES vivent dans bloc.ts, qui est pur. Ici on lit l'etat, on
 * soumet, et on ecrit ce qui a ete accorde.
 *
 * La checklist est stockee POINT PAR POINT, avec qui a coche et quand. Une
 * colonne « checklist faite » ne dit rien le jour ou il faut comprendre ce
 * qui a ete reellement verifie — et ce jour-la, c'est la seule question
 * qu'on pose.
 */

import { randomUUID } from 'node:crypto';
import { all, audit, get, insert, run, tx } from '../db.ts';
import { versIso, versIsoRequis } from '../temps.ts';
import {
  POINTS,
  entrerAuBloc,
  inciser,
  manquants,
  programmeDeLaSalle,
  programmer,
  sortirDeSalle,
  type Checklist,
  type DecisionBloc,
  type Intervention,
  type Lateralite,
  type Salle,
  type TempsChecklist,
} from './bloc.ts';

interface LigneIntervention {
  id: string;
  patient_id: string;
  sejour_id: string | null;
  salle_id: string;
  geste: string;
  lateralise: number;
  lateralite: Lateralite;
  debut_prevu: string;
  fin_prevue: string;
  etat: Intervention['etat'];
  operateur_id: string | null;
  entree_le: string | null;
  incise_le: string | null;
  termine_le: string | null;
}

const versIntervention = (i: LigneIntervention): Intervention => ({
  id: i.id,
  patientId: i.patient_id,
  sejourId: i.sejour_id,
  salleId: i.salle_id,
  geste: i.geste,
  lateralise: i.lateralise === 1,
  lateralite: i.lateralite,
  debutPrevu: versIsoRequis(i.debut_prevu),
  finPrevue: versIsoRequis(i.fin_prevue),
  etat: i.etat,
  operateurId: i.operateur_id,
  entreeLe: versIso(i.entree_le),
  inciseLe: versIso(i.incise_le),
  termineLe: versIso(i.termine_le),
});

// ------------------------------------------------------------------ lecture

export function salles(organizationId: string | null): Salle[] {
  return all<Salle>(
    `SELECT id, code, nom FROM salle_operatoire
      WHERE actif = 1 AND (? IS NULL OR organization_id = ? OR organization_id IS NULL)
      ORDER BY code`,
    [organizationId, organizationId],
  );
}

export function interventionParId(id: string): Intervention | null {
  const i = get<LigneIntervention>('SELECT * FROM intervention WHERE id = ?', [id]);
  return i ? versIntervention(i) : null;
}

export function interventionsDeLaSalle(salleId: string, jour: string): Intervention[] {
  return all<LigneIntervention>(
    'SELECT * FROM intervention WHERE salle_id = ? AND debut_prevu >= ? AND debut_prevu < ? ORDER BY debut_prevu',
    [salleId, `${jour}T00:00:00.000Z`, `${jour}T23:59:59.999Z`],
  ).map(versIntervention);
}

export function checklistDe(interventionId: string): Checklist {
  return {
    interventionId,
    coches: all<{ point: string }>('SELECT point FROM checklist_bloc WHERE intervention_id = ?', [
      interventionId,
    ]).map((r) => r.point),
  };
}

export interface LigneProgramme {
  salle: Salle;
  interventions: (Intervention & { patientNom: string })[];
  minutesProgrammees: number;
}

/** Le programme du jour, salle par salle. */
export function programmeDuJour(
  organizationId: string | null,
  jour = new Date().toISOString().slice(0, 10),
): LigneProgramme[] {
  return salles(organizationId).map((salle) => {
    const toutes = interventionsDeLaSalle(salle.id, jour);
    const p = programmeDeLaSalle(salle.id, toutes);
    const noms = nomsPatients(p.interventions.map((i) => i.patientId));
    return {
      salle,
      interventions: p.interventions.map((i) => ({
        ...i,
        patientNom: noms[i.patientId] ?? 'Patient',
      })),
      minutesProgrammees: p.minutesProgrammees,
    };
  });
}

function nomsPatients(ids: string[]): Record<string, string> {
  if (ids.length === 0) return {};
  const uniques = [...new Set(ids)];
  const marques = uniques.map(() => '?').join(', ');
  const out: Record<string, string> = {};
  for (const p of all<{ id: string; given_name: string; family_name: string }>(
    `SELECT id, given_name, family_name FROM patient WHERE id IN (${marques})`,
    uniques,
  )) {
    out[p.id] = `${p.given_name} ${p.family_name}`;
  }
  return out;
}

// ------------------------------------------------------------------ ecriture

export interface Contexte {
  acteurId: string | null;
  organizationId: string | null;
}

export function programmerIntervention(
  d: {
    patientId: string;
    sejourId?: string | null;
    salleId: string;
    geste: string;
    lateralise: boolean;
    lateralite: Lateralite;
    debutPrevu: string;
    finPrevue: string;
    operateurId?: string | null;
  },
  ctx: Contexte,
): DecisionBloc<Intervention> {
  const jour = d.debutPrevu.slice(0, 10);
  const decision = programmer({
    intervention: {
      patientId: d.patientId,
      sejourId: d.sejourId ?? null,
      salleId: d.salleId,
      geste: d.geste,
      lateralise: d.lateralise,
      lateralite: d.lateralite,
      debutPrevu: d.debutPrevu,
      finPrevue: d.finPrevue,
      operateurId: d.operateurId ?? null,
    },
    interventionsSalle: interventionsDeLaSalle(d.salleId, jour),
  });
  if (!decision.ok) return decision;

  const id = randomUUID();
  return tx(() => {
    insert('intervention', {
      id,
      patient_id: d.patientId,
      sejour_id: d.sejourId ?? null,
      salle_id: d.salleId,
      organization_id: ctx.organizationId,
      geste: d.geste,
      lateralise: d.lateralise ? 1 : 0,
      lateralite: d.lateralite,
      debut_prevu: d.debutPrevu,
      fin_prevue: d.finPrevue,
      etat: 'programmee',
      operateur_id: d.operateurId ?? null,
    });
    audit({
      action: 'create',
      entity: 'intervention',
      entityId: id,
      patientId: d.patientId,
      actorId: ctx.acteurId ?? undefined,
      detail: { geste: d.geste, lateralite: d.lateralite, salle: d.salleId },
    });
    return { ok: true as const, resultat: { ...decision.resultat, id } };
  });
}

/** Coche un point de checklist, en gardant qui l'a coche. */
export function cocher(
  interventionId: string,
  point: string,
  ctx: Contexte,
): DecisionBloc<Checklist> {
  const defini = POINTS.find((p) => p.cle === point);
  if (!defini) {
    return {
      ok: false,
      motif: 'CHECKLIST_INCOMPLETE',
      message: `Point de checklist inconnu : ${point}.`,
      remede: 'Utiliser un des points de la checklist de securite.',
    };
  }
  run(
    'INSERT OR IGNORE INTO checklist_bloc (id, intervention_id, temps, point, coche_par) VALUES (?, ?, ?, ?, ?)',
    [randomUUID(), interventionId, defini.temps, point, ctx.acteurId],
  );
  audit({
    action: 'update',
    entity: 'intervention',
    entityId: interventionId,
    actorId: ctx.acteurId ?? undefined,
    detail: { checklist: point, temps: defini.temps },
  });
  return { ok: true, resultat: checklistDe(interventionId) };
}

/**
 * Decoche un point.
 *
 * Possible, et trace : un point coche par erreur doit pouvoir etre repris.
 * Le refuser pousserait l'equipe a continuer sur une checklist fausse, ce
 * qui est pire qu'une checklist incomplete.
 */
export function decocher(interventionId: string, point: string, ctx: Contexte): Checklist {
  run('DELETE FROM checklist_bloc WHERE intervention_id = ? AND point = ?', [interventionId, point]);
  audit({
    action: 'update',
    entity: 'intervention',
    entityId: interventionId,
    actorId: ctx.acteurId ?? undefined,
    detail: { checklist: point, decoche: true },
  });
  return checklistDe(interventionId);
}

function transition(
  interventionId: string,
  regle: (i: Intervention, c: Checklist, quand: string) => DecisionBloc<Intervention>,
  colonnes: (i: Intervention) => Record<string, unknown>,
  mot: string,
  ctx: Contexte,
  quand: string,
): DecisionBloc<Intervention> {
  const i = interventionParId(interventionId);
  if (!i) {
    return {
      ok: false,
      motif: 'ETAT_INCOMPATIBLE',
      message: 'Intervention introuvable.',
      remede: 'Verifier le programme du jour.',
    };
  }

  const d = regle(i, checklistDe(interventionId), quand);
  if (!d.ok) return d;

  return tx(() => {
    const champs = { ...colonnes(d.resultat), updated_at: quand };
    const set = Object.keys(champs)
      .map((c) => `${c} = ?`)
      .join(', ');
    run(`UPDATE intervention SET ${set} WHERE id = ?`, [...Object.values(champs), interventionId]);
    audit({
      action: 'update',
      entity: 'intervention',
      entityId: interventionId,
      patientId: i.patientId,
      actorId: ctx.acteurId ?? undefined,
      detail: { transition: mot, geste: i.geste },
    });
    return d;
  });
}

export function entreeAuBloc(interventionId: string, ctx: Contexte, quand = new Date().toISOString()) {
  return transition(
    interventionId,
    entrerAuBloc,
    (i) => ({ etat: i.etat, entree_le: i.entreeLe }),
    'entree-au-bloc',
    ctx,
    quand,
  );
}

export function incision(interventionId: string, ctx: Contexte, quand = new Date().toISOString()) {
  return transition(
    interventionId,
    inciser,
    (i) => ({ etat: i.etat, incise_le: i.inciseLe }),
    'incision',
    ctx,
    quand,
  );
}

export function sortie(interventionId: string, ctx: Contexte, quand = new Date().toISOString()) {
  return transition(
    interventionId,
    sortirDeSalle,
    (i) => ({ etat: i.etat, termine_le: i.termineLe }),
    'sortie-de-salle',
    ctx,
    quand,
  );
}

/** Ce qui manque a un temps, pour l'afficher avant d'essayer. */
export function manquantsDe(interventionId: string, temps: TempsChecklist) {
  return manquants(checklistDe(interventionId), temps);
}
