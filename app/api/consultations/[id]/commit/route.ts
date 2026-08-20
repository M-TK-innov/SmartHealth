import { body, currentPractitioner, fail, handle, ok } from '@/lib/api';
import { update, nowIso } from '@/lib/db';
import { normalizeExtraction, type ClinicalExtraction, type ProposedMedication } from '@/lib/ai/schema';
import {
  commitExtraction,
  getConsultation,
  getPatient,
  getPractitioner,
  getPrescriptionItems,
  getPrescriptions,
  parseExtraction,
  type CommitSelection,
} from '@/lib/repo';
import { buildReport } from '@/lib/report';
import type { Patient } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

interface CommitBody {
  extraction?: ClinicalExtraction;
  selection?: CommitSelection;
  patientUpdates?: Partial<Patient>;
  prescriptionItems?: ProposedMedication[];
  report?: string;
}

/**
 * Integration au dossier medical des elements retenus par le medecin.
 * Cree egalement le projet d'ordonnance en statut brouillon.
 */
export function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const consultation = getConsultation(id);
    if (!consultation) return fail('Consultation introuvable', 404);
    if (consultation.status === 'signed') return fail('Consultation signee : le dossier est verrouille.', 409);

    const data = await body<CommitBody>(req);
    const extraction = data.extraction ? normalizeExtraction(data.extraction) : parseExtraction(consultation);
    if (!extraction) return fail("Aucune analyse disponible : lancez d'abord l'analyse de la consultation.");

    const actor = currentPractitioner(req);
    const result = commitExtraction({
      consultationId: id,
      extraction,
      selection: data.selection ?? {},
      patientUpdates: data.patientUpdates,
      prescriptionItems: data.prescriptionItems ?? [],
      actor,
    });

    const patient = getPatient(consultation.patient_id)!;
    const refreshed = getConsultation(id)!;
    const report =
      data.report?.trim() ||
      buildReport({
        patient,
        consultation: refreshed,
        practitioner: consultation.practitioner_id ? getPractitioner(consultation.practitioner_id) : null,
        extraction,
      });

    update('consultation', id, {
      report_markdown: report,
      report_edited: data.report?.trim() ? 1 : 0,
      updated_at: nowIso(),
    });

    return ok({
      result,
      report,
      consultation: getConsultation(id),
      patient: getPatient(consultation.patient_id),
      prescriptions: getPrescriptions(id).map((p) => ({ ...p, items: getPrescriptionItems(p.id) })),
    });
  });
}
