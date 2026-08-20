/**
 * Export vers DHIS2 — systeme national d'information sanitaire utilise par la
 * majorite des ministeres de la sante africains (et l'OMS) pour la surveillance
 * epidemiologique et le rapportage de routine.
 *
 * Deux formats :
 *   - un evenement Tracker (une consultation = un event, anonymisable),
 *   - un jeu de valeurs agregees (dataValueSets) pour le rapport mensuel.
 */

import type { Consultation, Diagnosis, Observation, Patient } from '@/lib/types';
import { computeAge } from '@/lib/ai/prompts';

/** Correspondance CIM-10 -> element de donnee du programme national de surveillance. */
const SURVEILLANCE_MAP: Record<string, { dataElement: string; label: string; programme: string }> = {
  B54: { dataElement: 'PD_MAL_CONF', label: 'Cas de paludisme', programme: 'Programme National de Lutte contre le Paludisme' },
  'B50.9': { dataElement: 'PD_MAL_FALCI', label: 'Paludisme a P. falciparum', programme: 'Programme National de Lutte contre le Paludisme' },
  'A15.3': { dataElement: 'PD_TB_PULM', label: 'Tuberculose pulmonaire', programme: 'Programme National de Lutte contre la Tuberculose' },
  B24: { dataElement: 'PD_HIV', label: 'Infection a VIH', programme: 'Programme National de Lutte contre le Sida' },
  'A01.0': { dataElement: 'PD_TYPHOID', label: 'Fievre typhoide', programme: 'Surveillance integree des maladies' },
  A00: { dataElement: 'PD_CHOLERA', label: 'Cholera', programme: 'Surveillance integree des maladies' },
  A09: { dataElement: 'PD_DIARRHEA', label: 'Diarrhee aigue', programme: 'Surveillance integree des maladies' },
  E44: { dataElement: 'PD_MALNUT', label: 'Malnutrition aigue moderee', programme: 'Programme National de Nutrition' },
  I10: { dataElement: 'PD_HTA', label: 'Hypertension arterielle', programme: 'Programme Maladies Non Transmissibles' },
  E11: { dataElement: 'PD_DIAB2', label: 'Diabete de type 2', programme: 'Programme Maladies Non Transmissibles' },
  'J18.9': { dataElement: 'PD_PNEUMO', label: 'Pneumopathie', programme: 'Surveillance integree des maladies' },
};

export function surveillanceFor(icd10?: string | null) {
  if (!icd10) return undefined;
  return SURVEILLANCE_MAP[icd10] ?? SURVEILLANCE_MAP[icd10.split('.')[0]];
}

export interface Dhis2Event {
  program: string;
  orgUnit: string;
  eventDate: string;
  status: 'COMPLETED' | 'ACTIVE';
  dataValues: { dataElement: string; value: string }[];
  notes?: { value: string }[];
}

/**
 * Construit l'evenement DHIS2 d'une consultation.
 * `anonymise` retire nom, telephone et identifiants : c'est le mode par defaut
 * pour la surveillance epidemiologique, qui ne necessite pas d'identifier la personne.
 */
export function buildDhis2Event(opts: {
  patient: Patient;
  consultation: Consultation;
  diagnoses: Diagnosis[];
  observations: Observation[];
  orgUnit?: string;
  program?: string;
  anonymise?: boolean;
}): Dhis2Event {
  const { patient, consultation, diagnoses, observations } = opts;
  const anonymise = opts.anonymise !== false;
  const age = patient.birth_date ? computeAge(patient.birth_date) : null;

  const dataValues: { dataElement: string; value: string }[] = [
    { dataElement: 'PD_ENCOUNTER_DATE', value: consultation.started_at.slice(0, 10) },
    { dataElement: 'PD_SEX', value: patient.gender },
    { dataElement: 'PD_AGE_YEARS', value: age !== null ? String(age) : '' },
    { dataElement: 'PD_AGE_GROUP', value: ageGroup(age) },
    { dataElement: 'PD_DISTRICT', value: patient.district ?? '' },
    { dataElement: 'PD_PREGNANT', value: patient.is_pregnant ? 'true' : 'false' },
  ];

  for (const d of diagnoses) {
    const s = surveillanceFor(d.icd10_code);
    if (s) dataValues.push({ dataElement: s.dataElement, value: d.certainty === 'confirmed' ? 'CONFIRMED' : 'SUSPECTED' });
    dataValues.push({ dataElement: 'PD_ICD10', value: d.icd10_code ?? d.label });
  }

  for (const o of observations) {
    if (!o.code_loinc || o.value_num === null) continue;
    dataValues.push({ dataElement: `LOINC_${o.code_loinc.replace('-', '_')}`, value: String(o.value_num) });
  }

  if (!anonymise) {
    dataValues.push({ dataElement: 'PD_PATIENT_ID', value: patient.mrn ?? patient.id });
    dataValues.push({ dataElement: 'PD_PATIENT_NAME', value: `${patient.given_name} ${patient.family_name}` });
  }

  return {
    program: opts.program || 'PARLEDOCTEUR_OPD',
    orgUnit: opts.orgUnit || process.env.FACILITY_ID || 'UNKNOWN_ORGUNIT',
    eventDate: consultation.started_at.slice(0, 10),
    status: consultation.status === 'signed' ? 'COMPLETED' : 'ACTIVE',
    dataValues: dataValues.filter((v) => v.value !== ''),
    notes: anonymise ? [{ value: 'Donnees pseudonymisees pour la surveillance epidemiologique.' }] : undefined,
  };
}

/** Rapport agrege mensuel (dataValueSets DHIS2) a partir d'une liste de diagnostics. */
export function buildDhis2AggregateReport(opts: {
  period: string; // AAAAMM
  orgUnit?: string;
  diagnoses: Diagnosis[];
}): Record<string, unknown> {
  const counts = new Map<string, { label: string; n: number }>();
  for (const d of opts.diagnoses) {
    const s = surveillanceFor(d.icd10_code);
    if (!s) continue;
    const prev = counts.get(s.dataElement);
    counts.set(s.dataElement, { label: s.label, n: (prev?.n ?? 0) + 1 });
  }
  return {
    dataSet: 'PARLEDOCTEUR_MONTHLY',
    period: opts.period,
    orgUnit: opts.orgUnit || process.env.FACILITY_ID || 'UNKNOWN_ORGUNIT',
    completeDate: new Date().toISOString().slice(0, 10),
    dataValues: [...counts.entries()].map(([dataElement, v]) => ({
      dataElement,
      value: String(v.n),
      comment: v.label,
    })),
  };
}

function ageGroup(age: number | null): string {
  if (age === null) return 'INCONNU';
  if (age < 1) return '<1an';
  if (age < 5) return '1-4ans';
  if (age < 15) return '5-14ans';
  if (age < 25) return '15-24ans';
  if (age < 50) return '25-49ans';
  if (age < 65) return '50-64ans';
  return '65ans+';
}
