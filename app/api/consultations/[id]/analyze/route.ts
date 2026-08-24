import { fail, ok } from '@/lib/api';
import { apiRequire, assertSameOrganization, guarded } from '@/lib/auth/guard';
import { nowIso, update } from '@/lib/db';
import { extractFromTranscript } from '@/lib/ai/extract';
import {
  getAllergies,
  getConsultation,
  getMedicationStatements,
  getPatient,
  getPractitioner,
  getProblems,
  renderTranscript,
} from '@/lib/repo';
import { buildReport } from '@/lib/report';
import { checkPrescription } from '@/lib/safety';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Analyse de la consultation.
 *
 * Produit l'extraction structuree, le compte rendu SOAP et un pre-controle de
 * securite du projet d'ordonnance. RIEN n'est encore ecrit dans le dossier
 * medical : cette etape alimente l'ecran de revue du medecin.
 */
export function POST(_req: Request, ctx: Ctx) {
  return guarded(async () => {
    const authCtx = await apiRequire('consultation:write');
    const { id } = await ctx.params;
    const consultation = getConsultation(id);
    if (!consultation) return fail('Consultation introuvable', 404);
    assertSameOrganization(authCtx, consultation.organization_id);
    const patient = getPatient(consultation.patient_id);
    if (!patient) return fail('Patient introuvable', 404);

    const transcript = renderTranscript(id) || consultation.transcript_full || '';
    if (!transcript.trim()) return fail('La transcription est vide : enregistrez ou saisissez l echange avant d analyser.');

    const allergies = getAllergies(patient.id);
    const problems = getProblems(patient.id);
    const medications = getMedicationStatements(patient.id);

    const result = await extractFromTranscript(transcript, {
      patient,
      knownAllergies: allergies.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ''}`),
      knownProblems: problems.filter((p) => p.clinical_status === 'active').map((p) => p.label),
      currentMedications: medications.map((m) => m.drug_name),
      facility: process.env.FACILITY_NAME,
    });

    const analysisAt = nowIso();
    update('consultation', id, {
      analysis_json: JSON.stringify(result.extraction),
      analysis_engine: result.engine,
      analysis_at: analysisAt,
      status: consultation.status === 'in-progress' ? 'analyzed' : consultation.status,
      updated_at: analysisAt,
    });

    const refreshed = getConsultation(id)!;
    const report = buildReport({
      patient,
      consultation: refreshed,
      practitioner: consultation.practitioner_id ? getPractitioner(consultation.practitioner_id) : null,
      extraction: result.extraction,
    });

    // pre-controle de securite sur le projet d'ordonnance (avant tout enregistrement)
    const safetyAlerts = result.extraction.proposedPrescription.length
      ? checkPrescription(
          result.extraction.proposedPrescription.map((p) => ({
            drug_name: p.dci,
            atc_code: p.atcCode ?? null,
            strength: p.strength ?? null,
            frequency_per_day: p.frequencyPerDay ?? null,
            duration_days: p.durationDays ?? null,
            route: p.route ?? null,
          })),
          {
            patient,
            allergies,
            currentMedications: medications.map((m) => ({ drug_name: m.drug_name, atc_code: m.atc_code })),
          },
        )
      : [];

    return ok({
      extraction: result.extraction,
      engine: result.engine,
      degraded: result.degraded,
      warning: result.warning,
      usage: result.usage,
      report,
      safetyAlerts,
    });
  });
}
