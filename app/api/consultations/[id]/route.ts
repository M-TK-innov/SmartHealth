import { body, fail, handle, ok } from '@/lib/api';
import { update, nowIso } from '@/lib/db';
import {
  getAllergies,
  getConsultation,
  getDiagnoses,
  getMedicationStatements,
  getObservations,
  getPatient,
  getPractitioner,
  getPrescriptionItems,
  getPrescriptions,
  getProblems,
  getSegments,
  getServiceRequests,
  parseExtraction,
} from '@/lib/repo';
import type { Consultation } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const consultation = getConsultation(id);
    if (!consultation) return fail('Consultation introuvable', 404);
    const patient = getPatient(consultation.patient_id);
    const prescriptions = getPrescriptions(id).map((p) => ({ ...p, items: getPrescriptionItems(p.id) }));
    return ok({
      consultation,
      patient,
      practitioner: consultation.practitioner_id ? getPractitioner(consultation.practitioner_id) : null,
      segments: getSegments(id),
      extraction: parseExtraction(consultation),
      observations: getObservations(consultation.patient_id, id),
      diagnoses: getDiagnoses(id),
      serviceRequests: getServiceRequests(id),
      prescriptions,
      patientContext: patient
        ? {
            problems: getProblems(patient.id),
            allergies: getAllergies(patient.id),
            medications: getMedicationStatements(patient.id),
          }
        : null,
    });
  });
}

const EDITABLE: (keyof Consultation)[] = [
  'reason_text',
  'encounter_class',
  'language',
  'consent_recording',
  'location',
  'audio_duration_s',
  'report_markdown',
  'ended_at',
];

export function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const consultation = getConsultation(id);
    if (!consultation) return fail('Consultation introuvable', 404);
    if (consultation.status === 'signed') return fail('Consultation signee : modification impossible.', 409);

    const data = await body<Partial<Consultation>>(req);
    const patch: Record<string, unknown> = { updated_at: nowIso() };
    for (const k of EDITABLE) if (data[k] !== undefined) patch[k] = data[k];
    if (data.consent_recording === 1 && !consultation.consent_at) patch.consent_at = nowIso();
    if (data.report_markdown !== undefined && data.report_markdown !== consultation.report_markdown) {
      patch.report_edited = 1;
    }
    update('consultation', id, patch);
    return ok({ consultation: getConsultation(id) });
  });
}
