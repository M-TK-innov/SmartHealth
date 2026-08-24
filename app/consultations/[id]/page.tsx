import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getAllergies,
  getConsultation,
  getPatient,
  getPractitioner,
  getPrescriptionItems,
  getPrescriptions,
  getSegments,
  parseExtraction,
} from '@/lib/repo';
import { Workspace } from '@/components/consultation/Workspace';
import { assertSameOrganization, requirePermission } from '@/lib/auth/guard';
import { buildReport, formatDate } from '@/lib/report';
import { computeAge, translateGender } from '@/lib/ai/prompts';

export const dynamic = 'force-dynamic';

export default async function ConsultationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('consultation:read', `/consultations/${(await params).id}`);
  const { id } = await params;
  const consultation = getConsultation(id);
  if (!consultation) notFound();
  assertSameOrganization(ctx, consultation.organization_id);

  const patient = getPatient(consultation.patient_id);
  if (!patient) notFound();

  const practitioner = consultation.practitioner_id ? getPractitioner(consultation.practitioner_id) ?? null : null;
  const extraction = parseExtraction(consultation);
  const prescriptions = getPrescriptions(id).map((p) => ({ ...p, items: getPrescriptionItems(p.id) }));
  const allergies = getAllergies(patient.id);
  const age = patient.birth_date ? computeAge(patient.birth_date) : null;

  const report =
    consultation.report_markdown ||
    (extraction ? buildReport({ patient, consultation, practitioner, extraction }) : '');

  return (
    <div className="space-y-4">
      <header className="card-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href={`/patients/${patient.id}`} className="text-xl font-bold hover:underline">
              {patient.given_name} {patient.family_name}
            </Link>
            <p className="mt-0.5 text-sm text-ink-soft">
              {patient.mrn} · {age !== null ? `${age} ans` : 'age inconnu'} · {translateGender(patient.gender)} ·
              consultation du {formatDate(consultation.started_at)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allergies.length > 0 ? (
                allergies.map((a) => (
                  <span key={a.id} className="chip bg-danger-soft text-danger">
                    allergie : {a.substance}
                  </span>
                ))
              ) : (
                <span className="chip bg-paper text-ink-soft">aucune allergie connue</span>
              )}
              {patient.is_pregnant === 1 && <span className="chip bg-warn-soft text-warn">grossesse</span>}
              {patient.renal_impairment === 1 && <span className="chip bg-warn-soft text-warn">insuff. renale</span>}
              {patient.weight_kg && <span className="chip bg-paper">{patient.weight_kg} kg</span>}
            </div>
          </div>
          <div className="text-right text-xs text-ink-soft">
            <div>{practitioner ? `Dr ${practitioner.given_name} ${practitioner.family_name}` : 'praticien non defini'}</div>
            <div>{practitioner?.qualification}</div>
          </div>
        </div>
      </header>

      <Workspace
        consultation={consultation}
        patient={patient}
        practitioner={practitioner}
        segments={getSegments(id)}
        extraction={extraction}
        prescriptions={prescriptions}
        report={report}
      />
    </div>
  );
}
