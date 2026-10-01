import { all, get, insert, update, run, tx, uid, nowIso, audit } from './db';
import type {
  Allergy,
  Consultation,
  Diagnosis,
  MedicationStatement,
  Observation,
  Patient,
  Practitioner,
  Prescription,
  PrescriptionItem,
  Problem,
  SafetyAlert,
  ServiceRequest,
  TranscriptSegment,
} from './types';
import type { ClinicalExtraction, ProposedMedication } from './ai/schema';
import { vitalInterpretation } from './ai/enrich';
import { checkPrescription } from './safety';
import { normalizeText, VITALS } from './terminology';
import { findDrug } from './terminology/formulary';
import { attributeSpeakers, type Speaker } from './ai/speakers';

// ------------------------------------------------------------------ lecture

export const getPatient = (id: string) => get<Patient>('SELECT * FROM patient WHERE id = ?', [id]);

/**
 * Liste des patients.
 *
 * `organizationId` cloisonne le fichier : un etablissement ne voit que ses
 * dossiers. Les dossiers anterieurs a la mise en place du cloisonnement
 * (organization_id nul) restent visibles — sans quoi une mise a jour ferait
 * disparaitre l'existant du jour au lendemain.
 */
export const listPatients = (search = '', organizationId?: string | null) => {
  const scope = organizationId ? '(organization_id = ? OR organization_id IS NULL)' : '1 = 1';
  const scopeParams: unknown[] = organizationId ? [organizationId] : [];

  if (!search.trim()) {
    return all<Patient>(`SELECT * FROM patient WHERE ${scope} ORDER BY updated_at DESC LIMIT 200`, scopeParams);
  }
  const q = `%${search.trim().toLowerCase()}%`;
  return all<Patient>(
    `SELECT * FROM patient
     WHERE ${scope}
       AND (lower(given_name) LIKE ? OR lower(family_name) LIKE ? OR lower(mrn) LIKE ? OR phone LIKE ?)
     ORDER BY updated_at DESC LIMIT 200`,
    [...scopeParams, q, q, q, q],
  );
};

export const getConsultation = (id: string) => get<Consultation>('SELECT * FROM consultation WHERE id = ?', [id]);

export const listConsultations = (patientId?: string, organizationId?: string | null) => {
  const where: string[] = [];
  const params: unknown[] = [];
  if (patientId) {
    where.push('patient_id = ?');
    params.push(patientId);
  }
  if (organizationId) {
    where.push('(organization_id = ? OR organization_id IS NULL)');
    params.push(organizationId);
  }
  return all<Consultation>(
    `SELECT * FROM consultation ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY started_at DESC LIMIT ${patientId ? 500 : 100}`,
    params,
  );
};

export const getPractitioner = (id: string) => get<Practitioner>('SELECT * FROM practitioner WHERE id = ?', [id]);
export const listPractitioners = () => all<Practitioner>('SELECT * FROM practitioner ORDER BY family_name');

export const defaultPractitioner = () =>
  get<Practitioner>('SELECT * FROM practitioner ORDER BY created_at LIMIT 1');

export const getSegments = (consultationId: string) =>
  all<TranscriptSegment>('SELECT * FROM transcript_segment WHERE consultation_id = ? ORDER BY seq', [consultationId]);

export const getAllergies = (patientId: string) =>
  all<Allergy>('SELECT * FROM allergy WHERE patient_id = ? ORDER BY recorded_at DESC', [patientId]);

export const getProblems = (patientId: string) =>
  all<Problem>('SELECT * FROM problem WHERE patient_id = ? ORDER BY recorded_at DESC', [patientId]);

export const getMedicationStatements = (patientId: string) =>
  all<MedicationStatement>("SELECT * FROM medication_statement WHERE patient_id = ? AND status = 'active'", [patientId]);

export const getObservations = (patientId: string, consultationId?: string) =>
  consultationId
    ? all<Observation>('SELECT * FROM observation WHERE consultation_id = ? ORDER BY effective_at', [consultationId])
    : all<Observation>('SELECT * FROM observation WHERE patient_id = ? ORDER BY effective_at DESC LIMIT 200', [patientId]);

export const getDiagnoses = (consultationId: string) =>
  all<Diagnosis>('SELECT * FROM diagnosis WHERE consultation_id = ? ORDER BY rank', [consultationId]);

export const getServiceRequests = (consultationId: string) =>
  all<ServiceRequest>('SELECT * FROM service_request WHERE consultation_id = ?', [consultationId]);

export const getPrescriptions = (consultationId: string) =>
  all<Prescription>('SELECT * FROM prescription WHERE consultation_id = ? ORDER BY created_at DESC', [consultationId]);

export const getPatientPrescriptions = (patientId: string) =>
  all<Prescription>('SELECT * FROM prescription WHERE patient_id = ? ORDER BY created_at DESC', [patientId]);

export const getPrescription = (id: string) => get<Prescription>('SELECT * FROM prescription WHERE id = ?', [id]);

export const getPrescriptionItems = (prescriptionId: string) =>
  all<PrescriptionItem>('SELECT * FROM prescription_item WHERE prescription_id = ? ORDER BY seq', [prescriptionId]);

export function parseExtraction(c: Consultation): ClinicalExtraction | null {
  if (!c.analysis_json) return null;
  try {
    return JSON.parse(c.analysis_json) as ClinicalExtraction;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- ecriture

export function createPatient(data: Partial<Patient>): string {
  const id = uid();
  const mrn = data.mrn || nextMrn();
  insert('patient', {
    id,
    mrn,
    national_id: data.national_id ?? null,
    insurance_id: data.insurance_id ?? null,
    insurance_scheme: data.insurance_scheme ?? null,
    given_name: data.given_name || 'Inconnu',
    family_name: data.family_name || 'Inconnu',
    birth_date: data.birth_date ?? null,
    birth_date_estimated: data.birth_date_estimated ?? 0,
    gender: data.gender ?? 'unknown',
    phone: data.phone ?? null,
    address_line: data.address_line ?? null,
    city: data.city ?? null,
    district: data.district ?? null,
    country: data.country ?? process.env.FACILITY_COUNTRY ?? 'BJ',
    preferred_language: data.preferred_language ?? 'fr',
    blood_group: data.blood_group ?? null,
    weight_kg: data.weight_kg ?? null,
    height_cm: data.height_cm ?? null,
    is_pregnant: data.is_pregnant ?? 0,
    renal_impairment: data.renal_impairment ?? 0,
    hepatic_impairment: data.hepatic_impairment ?? 0,
    emergency_contact: data.emergency_contact ?? null,
    organization_id: data.organization_id ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  audit({ action: 'create', entity: 'patient', entityId: id, patientId: id, detail: { mrn } });
  return id;
}

function nextMrn(): string {
  const prefix = (process.env.FACILITY_ID || 'PD').split('-').pop() || 'PD';
  const row = get<{ n: number }>('SELECT COUNT(*) as n FROM patient');
  const seq = String((row?.n ?? 0) + 1).padStart(5, '0');
  return `${prefix}-${new Date().getFullYear()}-${seq}`;
}

export function updatePatient(id: string, data: Partial<Patient>, actor?: Practitioner | null) {
  update('patient', id, { ...data, updated_at: nowIso() });
  audit({
    action: 'update',
    entity: 'patient',
    entityId: id,
    patientId: id,
    actorId: actor?.id,
    actorLabel: actor ? `${actor.given_name} ${actor.family_name}` : undefined,
    detail: Object.keys(data).join(', '),
  });
}

export function createConsultation(
  patientId: string,
  practitionerId?: string | null,
  reason?: string,
  organizationId?: string | null,
): string {
  const id = uid();
  insert('consultation', {
    id,
    patient_id: patientId,
    practitioner_id: practitionerId ?? defaultPractitioner()?.id ?? null,
    status: 'in-progress',
    reason_text: reason ?? null,
    started_at: nowIso(),
    location: process.env.FACILITY_NAME ?? null,
    organization_id: organizationId ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  audit({ action: 'create', entity: 'consultation', entityId: id, patientId });
  return id;
}

export interface IncomingSegment {
  text: string;
  speaker?: string;
  startMs?: number;
  endMs?: number;
  confidence?: number;
  language?: string;
  /** Hauteur mediane de la voix, mesuree cote client. Indice de changement de locuteur. */
  pitchHz?: number;
  /** true si le praticien a impose le locuteur : la detection ne le touchera plus. */
  speakerLocked?: boolean;
  /** Phrase prononcee, quand `text` en est une traduction automatique. */
  sourceText?: string;
  sourceLanguage?: string;
}

export function appendSegments(consultationId: string, segments: IncomingSegment[]) {
  const row = get<{ n: number }>('SELECT COALESCE(MAX(seq), 0) as n FROM transcript_segment WHERE consultation_id = ?', [
    consultationId,
  ]);
  let seq = row?.n ?? 0;
  tx(() => {
    for (const s of segments) {
      if (!s.text?.trim()) continue;
      seq += 1;
      insert('transcript_segment', {
        id: uid(),
        consultation_id: consultationId,
        seq,
        speaker: s.speaker ?? 'unknown',
        text: s.text.trim(),
        start_ms: s.startMs ?? null,
        end_ms: s.endMs ?? null,
        confidence: s.confidence ?? null,
        language: s.language ?? null,
        speaker_source: s.speakerLocked ? 'manual' : 'auto',
        pitch_hz: s.pitchHz ?? null,
        source_text: s.sourceText?.trim() || null,
        source_language: s.sourceLanguage ?? null,
        created_at: nowIso(),
      });
    }
    update('consultation', consultationId, { transcript_full: renderTranscript(consultationId), updated_at: nowIso() });
  });
  return seq;
}

/**
 * Correction du locuteur d'un segment par le praticien.
 *
 * Passe la source a « manual » : c'est ce marqueur qui protege la correction
 * d'une re-attribution automatique ulterieure. La transcription complete est
 * regeneree, puisque c'est elle que lit le moteur d'extraction.
 */
export function setSegmentSpeaker(consultationId: string, segmentId: string, speaker: string): boolean {
  const segment = get<TranscriptSegment>('SELECT * FROM transcript_segment WHERE id = ? AND consultation_id = ?', [
    segmentId,
    consultationId,
  ]);
  if (!segment) return false;

  update('transcript_segment', segmentId, { speaker, speaker_source: 'manual', speaker_confidence: 1 });
  update('consultation', consultationId, {
    transcript_full: renderTranscript(consultationId),
    updated_at: nowIso(),
  });
  return true;
}

/**
 * Re-attribution automatique des locuteurs sur toute la consultation.
 *
 * Utile apres coup : une fois l'echange complet disponible, le regroupement
 * par hauteur de voix dispose de bien plus de matiere qu'au fil de l'eau et
 * rattrape les tours restes indetermines. Les segments corriges a la main sont
 * laisses intacts.
 */
export function reattributeSpeakers(consultationId: string): { updated: number; undetermined: number } {
  const segments = getSegments(consultationId);
  if (segments.length === 0) return { updated: 0, undetermined: 0 };

  const attributed = attributeSpeakers(
    segments.map((s) => ({
      text: s.text,
      hint: {
        pitchHz: s.pitch_hz ?? undefined,
        manual: s.speaker_source === 'manual' ? (s.speaker as Speaker) : undefined,
      },
    })),
  );

  let updated = 0;
  let undetermined = 0;
  tx(() => {
    attributed.forEach((a, i) => {
      const segment = segments[i];
      if (a.locked) return;
      if (a.speaker === 'unknown') undetermined++;
      if (segment.speaker === a.speaker && segment.speaker_confidence === a.confidence) return;
      update('transcript_segment', segment.id, {
        speaker: a.speaker,
        speaker_source: 'auto',
        speaker_confidence: a.confidence,
      });
      updated++;
    });
    update('consultation', consultationId, {
      transcript_full: renderTranscript(consultationId),
      updated_at: nowIso(),
    });
  });

  return { updated, undetermined };
}

export function replaceTranscript(consultationId: string, text: string) {
  tx(() => {
    run('DELETE FROM transcript_segment WHERE consultation_id = ?', [consultationId]);
    let seq = 0;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      seq += 1;
      const m = line.match(/^\s*\[?(medecin|docteur|patient|accompagnant)\]?\s*[:\-]\s*/i);
      const speaker = m
        ? ['medecin', 'docteur'].includes(m[1].toLowerCase())
          ? 'clinician'
          : m[1].toLowerCase() === 'patient'
            ? 'patient'
            : 'companion'
        : 'unknown';
      insert('transcript_segment', {
        id: uid(),
        consultation_id: consultationId,
        seq,
        speaker,
        text: m ? line.slice(m[0].length).trim() : line.trim(),
        created_at: nowIso(),
      });
    }
    update('consultation', consultationId, { transcript_full: text, updated_at: nowIso() });
  });
}

/** Transcription lisible, avec etiquette de locuteur : format attendu par les moteurs d'extraction. */
export function renderTranscript(consultationId: string): string {
  const segs = getSegments(consultationId);
  return segs
    .map((s) => {
      const label =
        s.speaker === 'clinician' ? 'Medecin' : s.speaker === 'patient' ? 'Patient' : s.speaker === 'companion' ? 'Accompagnant' : '';
      return label ? `[${label}] ${s.text}` : s.text;
    })
    .join('\n');
}

// -------------------------------------------- integration au dossier medical

export interface CommitSelection {
  vitals?: number[];
  diagnoses?: number[];
  allergies?: number[];
  history?: number[];
  medications?: number[];
  investigations?: number[];
}

export interface CommitResult {
  observations: number;
  diagnoses: number;
  problems: number;
  allergies: number;
  medications: number;
  serviceRequests: number;
  patientFieldsUpdated: string[];
  prescriptionId?: string;
  safetyAlerts: SafetyAlert[];
}

/**
 * Ecrit dans le dossier medical les elements que le medecin a explicitement
 * retenus dans l'ecran de revue. Rien n'est enregistre sans selection.
 * L'operation est atomique et integralement journalisee.
 */
export function commitExtraction(opts: {
  consultationId: string;
  extraction: ClinicalExtraction;
  selection: CommitSelection;
  patientUpdates?: Partial<Patient>;
  prescriptionItems?: ProposedMedication[];
  actor?: Practitioner | null;
}): CommitResult {
  const consultation = getConsultation(opts.consultationId);
  if (!consultation) throw new Error('Consultation introuvable');
  const patient = getPatient(consultation.patient_id);
  if (!patient) throw new Error('Patient introuvable');

  const e = opts.extraction;
  const sel = opts.selection;
  const pick = <T>(arr: T[], idx?: number[]) => (idx ? idx.map((i) => arr[i]).filter(Boolean) : []);
  const actorLabel = opts.actor ? `Dr ${opts.actor.given_name} ${opts.actor.family_name}` : undefined;

  const result: CommitResult = {
    observations: 0,
    diagnoses: 0,
    problems: 0,
    allergies: 0,
    medications: 0,
    serviceRequests: 0,
    patientFieldsUpdated: [],
    safetyAlerts: [],
  };

  tx(() => {
    // --- 1. Constantes -> Observation
    run("DELETE FROM observation WHERE consultation_id = ? AND source = 'ai-extraction'", [opts.consultationId]);
    for (const v of pick(e.vitals, sel.vitals)) {
      insert('observation', {
        id: uid(),
        patient_id: patient.id,
        consultation_id: opts.consultationId,
        category: 'vital-signs',
        code_loinc: v.loincCode ?? null,
        label: v.label,
        value_num: typeof v.value === 'number' ? v.value : null,
        value_text: v.valueText ?? null,
        unit: v.unit ?? null,
        ucum: VITALS.find((d) => d.loinc === v.loincCode)?.ucum ?? v.unit ?? null,
        interpretation: vitalInterpretation(v.loincCode, v.value ?? null),
        effective_at: consultation.started_at,
        source: 'ai-extraction',
        confidence: v.confidence ?? null,
      });
      result.observations++;
    }

    // Poids / taille remontent aussi sur la fiche patient
    const w = pick(e.vitals, sel.vitals).find((v) => v.loincCode === '29463-7')?.value;
    const h = pick(e.vitals, sel.vitals).find((v) => v.loincCode === '8302-2')?.value;

    // --- 2. Diagnostics de la rencontre
    run('DELETE FROM diagnosis WHERE consultation_id = ?', [opts.consultationId]);
    for (const [i, d] of pick(e.diagnoses, sel.diagnoses).entries()) {
      insert('diagnosis', {
        id: uid(),
        consultation_id: opts.consultationId,
        patient_id: patient.id,
        label: d.label,
        icd10_code: d.icd10Code ?? null,
        snomed_code: d.snomedCode ?? null,
        rank: d.rank ?? i + 1,
        certainty: d.certainty,
        confidence: d.confidence ?? null,
        rationale: d.rationale ?? null,
        created_at: nowIso(),
      });
      result.diagnoses++;

      // Un diagnostic confirme devient un probleme actif du dossier
      if (d.certainty === 'confirmed' && !problemExists(patient.id, d.label)) {
        insert('problem', {
          id: uid(),
          patient_id: patient.id,
          label: d.label,
          icd10_code: d.icd10Code ?? null,
          category: 'problem-list-item',
          clinical_status: 'active',
          recorded_at: nowIso(),
          source_consultation_id: opts.consultationId,
          confidence: d.confidence ?? null,
          verification_status: 'confirmed',
        });
        result.problems++;
      }
    }

    // --- 3. Antecedents -> liste de problemes persistante
    for (const h2 of pick(e.history, sel.history)) {
      if (problemExists(patient.id, h2.label)) continue;
      insert('problem', {
        id: uid(),
        patient_id: patient.id,
        label: h2.label,
        icd10_code: h2.icd10Code ?? null,
        category: 'problem-list-item',
        clinical_status: h2.status ?? 'active',
        onset_date: h2.onset ?? null,
        recorded_at: nowIso(),
        source_consultation_id: opts.consultationId,
        confidence: h2.confidence ?? null,
        verification_status: 'confirmed',
      });
      result.problems++;
    }

    // --- 4. Allergies
    for (const a of pick(e.allergies, sel.allergies)) {
      if (allergyExists(patient.id, a.substance)) continue;
      insert('allergy', {
        id: uid(),
        patient_id: patient.id,
        substance: a.substance,
        atc_code: findDrug(a.substance)?.atc ?? null,
        category: a.category ?? 'medication',
        criticality: a.criticality ?? 'low',
        reaction: a.reaction ?? null,
        recorded_at: nowIso(),
        source_consultation_id: opts.consultationId,
      });
      result.allergies++;
    }

    // --- 5. Traitements de fond
    for (const m of pick(e.currentMedications, sel.medications)) {
      if (medicationExists(patient.id, m.name)) continue;
      insert('medication_statement', {
        id: uid(),
        patient_id: patient.id,
        drug_name: m.name,
        atc_code: m.atcCode ?? findDrug(m.name)?.atc ?? null,
        dose: m.dose ?? null,
        status: 'active',
        source_consultation_id: opts.consultationId,
      });
      result.medications++;
    }

    // --- 6. Examens demandes
    run('DELETE FROM service_request WHERE consultation_id = ?', [opts.consultationId]);
    for (const i of pick(e.investigations, sel.investigations)) {
      insert('service_request', {
        id: uid(),
        consultation_id: opts.consultationId,
        patient_id: patient.id,
        label: i.label,
        loinc_code: i.loincCode ?? null,
        category: i.category ?? 'laboratory',
        priority: i.priority ?? 'routine',
        reason: i.reason ?? null,
        status: 'active',
        created_at: nowIso(),
      });
      result.serviceRequests++;
    }

    // --- 7. Mise a jour de la fiche patient (champs valides par le medecin)
    const updates: Record<string, unknown> = { ...(opts.patientUpdates ?? {}) };
    if (w && !updates.weight_kg) updates.weight_kg = w;
    if (h && !updates.height_cm) updates.height_cm = h;
    const clean = Object.fromEntries(
      Object.entries(updates).filter(([k, v]) => v !== undefined && v !== null && v !== '' && k !== 'id'),
    );
    if (Object.keys(clean).length) {
      update('patient', patient.id, { ...clean, updated_at: nowIso() });
      result.patientFieldsUpdated = Object.keys(clean);
    }

    // --- 8. Projet d'ordonnance (statut brouillon obligatoire)
    const items = opts.prescriptionItems ?? [];
    if (items.length) {
      run("DELETE FROM prescription WHERE consultation_id = ? AND status = 'draft'", [opts.consultationId]);
      const freshPatient = getPatient(patient.id)!;
      const alerts = checkPrescription(
        items.map((i) => ({
          drug_name: i.dci,
          atc_code: i.atcCode ?? null,
          strength: i.strength ?? null,
          frequency_per_day: i.frequencyPerDay ?? null,
          duration_days: i.durationDays ?? null,
          route: i.route ?? null,
        })),
        {
          patient: freshPatient,
          allergies: getAllergies(patient.id),
          currentMedications: getMedicationStatements(patient.id).map((m) => ({ drug_name: m.drug_name, atc_code: m.atc_code })),
        },
      );
      result.safetyAlerts = alerts;

      const prescriptionId = uid();
      insert('prescription', {
        id: prescriptionId,
        consultation_id: opts.consultationId,
        patient_id: patient.id,
        practitioner_id: consultation.practitioner_id,
        status: 'draft',
        origin: 'ai-proposed',
        safety_json: JSON.stringify(alerts),
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      for (const [idx, i] of items.entries()) {
        const def = findDrug(i.dci);
        insert('prescription_item', {
          id: uid(),
          prescription_id: prescriptionId,
          seq: idx + 1,
          drug_name: i.dci,
          atc_code: i.atcCode ?? def?.atc ?? null,
          form: i.form ?? null,
          strength: i.strength ?? null,
          dose: i.dose ?? null,
          route: i.route ?? 'oral',
          frequency: i.frequency ?? null,
          frequency_per_day: i.frequencyPerDay ?? null,
          duration_days: i.durationDays ?? null,
          quantity: i.quantity ?? null,
          instructions: i.instructions ?? null,
          is_essential_list: def?.essential ? 1 : 0,
          ai_confidence: i.confidence ?? null,
          ai_rationale: i.rationale ?? null,
          created_at: nowIso(),
        });
      }
      result.prescriptionId = prescriptionId;
    }

    update('consultation', opts.consultationId, {
      status: 'analyzed',
      analysis_json: JSON.stringify(e),
      updated_at: nowIso(),
    });
  });

  audit({
    action: 'update',
    entity: 'consultation',
    entityId: opts.consultationId,
    patientId: patient.id,
    actorId: opts.actor?.id,
    actorLabel,
    detail: {
      operation: 'integration-dossier',
      ...result,
      safetyAlerts: result.safetyAlerts.length,
    },
  });

  return result;
}

function problemExists(patientId: string, label: string): boolean {
  const rows = all<{ label: string }>('SELECT label FROM problem WHERE patient_id = ?', [patientId]);
  return rows.some((r) => normalizeText(r.label) === normalizeText(label));
}

function allergyExists(patientId: string, substance: string): boolean {
  const rows = all<{ substance: string }>('SELECT substance FROM allergy WHERE patient_id = ?', [patientId]);
  return rows.some((r) => normalizeText(r.substance) === normalizeText(substance));
}

function medicationExists(patientId: string, name: string): boolean {
  const rows = all<{ drug_name: string }>("SELECT drug_name FROM medication_statement WHERE patient_id = ? AND status = 'active'", [
    patientId,
  ]);
  return rows.some((r) => normalizeText(r.drug_name) === normalizeText(name));
}

// ------------------------------------------------------------- ordonnance

export function recomputeSafety(prescriptionId: string): SafetyAlert[] {
  const p = getPrescription(prescriptionId);
  if (!p) return [];
  const patient = getPatient(p.patient_id);
  if (!patient) return [];
  const items = getPrescriptionItems(prescriptionId);
  const alerts = checkPrescription(items, {
    patient,
    allergies: getAllergies(patient.id),
    currentMedications: getMedicationStatements(patient.id).map((m) => ({ drug_name: m.drug_name, atc_code: m.atc_code })),
  });
  update('prescription', prescriptionId, { safety_json: JSON.stringify(alerts), updated_at: nowIso() });
  return alerts;
}

/** Validation medicale : c'est cet acte qui donne sa valeur legale a l'ordonnance. */
export function validatePrescription(opts: {
  prescriptionId: string;
  practitioner: Practitioner;
  note?: string;
  overrideJustification?: string;
}): Prescription {
  const p = getPrescription(opts.prescriptionId);
  if (!p) throw new Error('Ordonnance introuvable');
  if (p.status === 'validated') return p;
  if (p.status === 'cancelled') throw new Error('Ordonnance annulee : validation impossible.');

  const items = getPrescriptionItems(opts.prescriptionId);
  if (items.length === 0) throw new Error('Ordonnance vide : ajoutez au moins une ligne.');

  const alerts = recomputeSafety(opts.prescriptionId);
  const blocking = alerts.filter((a) => a.severity === 'contraindicated');
  if (blocking.length && !opts.overrideJustification?.trim()) {
    throw new Error(
      `${blocking.length} contre-indication(s) detectee(s). Une justification ecrite est requise pour valider malgre l alerte : ${blocking
        .map((b) => b.message)
        .join(' | ')}`,
    );
  }

  const validatedAt = nowIso();
  const qr = JSON.stringify({
    v: 1,
    rx: opts.prescriptionId,
    pt: p.patient_id,
    pr: opts.practitioner.license_number || opts.practitioner.id,
    at: validatedAt,
    n: items.length,
  });

  update('prescription', opts.prescriptionId, {
    status: 'validated',
    validated_by: opts.practitioner.id,
    validated_at: validatedAt,
    validation_note: [opts.note, opts.overrideJustification ? `Derogation : ${opts.overrideJustification}` : null]
      .filter(Boolean)
      .join(' — ') || null,
    qr_payload: qr,
    updated_at: validatedAt,
  });

  audit({
    action: 'validate',
    entity: 'prescription',
    entityId: opts.prescriptionId,
    patientId: p.patient_id,
    actorId: opts.practitioner.id,
    actorLabel: `Dr ${opts.practitioner.given_name} ${opts.practitioner.family_name}`,
    detail: {
      items: items.length,
      alerts: alerts.length,
      overridden: blocking.length,
      justification: opts.overrideJustification ?? null,
    },
  });

  return getPrescription(opts.prescriptionId)!;
}

export function signConsultation(consultationId: string, practitioner: Practitioner, report?: string) {
  const c = getConsultation(consultationId);
  if (!c) throw new Error('Consultation introuvable');
  const at = nowIso();
  update('consultation', consultationId, {
    status: 'signed',
    signed_at: at,
    ended_at: c.ended_at ?? at,
    report_markdown: report ?? c.report_markdown,
    report_edited: report && report !== c.report_markdown ? 1 : c.report_edited,
    updated_at: at,
  });
  audit({
    action: 'sign',
    entity: 'consultation',
    entityId: consultationId,
    patientId: c.patient_id,
    actorId: practitioner.id,
    actorLabel: `Dr ${practitioner.given_name} ${practitioner.family_name}`,
  });
  return getConsultation(consultationId)!;
}
