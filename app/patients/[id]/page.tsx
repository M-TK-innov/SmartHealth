import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getAllergies,
  getMedicationStatements,
  getObservations,
  getPatient,
  getPatientPrescriptions,
  getPrescriptionItems,
  getProblems,
  listConsultations,
} from '@/lib/repo';
import { StartConsultation } from '@/components/StartConsultation';
import { assertSameOrganization, requirePermission } from '@/lib/auth/guard';
import { computeAge, translateGender } from '@/lib/ai/prompts';
import { formatDate } from '@/lib/report';

export const dynamic = 'force-dynamic';

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card">
      <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="section-title">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-ink-soft">{children}</p>
);

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('patient:read', `/patients/${(await params).id}`);
  const { id } = await params;
  const patient = getPatient(id);
  if (!patient) notFound();
  assertSameOrganization(ctx, patient.organization_id);

  const problems = getProblems(id);
  const allergies = getAllergies(id);
  const medications = getMedicationStatements(id);
  const observations = getObservations(id);
  const consultations = listConsultations(id);
  const prescriptions = getPatientPrescriptions(id).map((p) => ({ ...p, items: getPrescriptionItems(p.id) }));
  const age = patient.birth_date ? computeAge(patient.birth_date) : null;

  // derniere valeur par type de constante
  const latest = new Map<string, (typeof observations)[number]>();
  for (const o of observations) if (!latest.has(o.label)) latest.set(o.label, o);

  return (
    <div className="space-y-5">
      <header className="card-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              {patient.given_name} {patient.family_name}
            </h1>
            <p className="mt-1 text-sm text-ink-soft">
              Dossier {patient.mrn} · {age !== null ? `${age} ans${patient.birth_date_estimated ? ' (estime)' : ''}` : 'age inconnu'} ·{' '}
              {translateGender(patient.gender)}
              {patient.phone ? ` · ${patient.phone}` : ''}
              {patient.city ? ` · ${patient.city}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {patient.is_pregnant === 1 && <span className="chip bg-warn-soft text-warn">grossesse en cours</span>}
              {patient.renal_impairment === 1 && <span className="chip bg-warn-soft text-warn">insuffisance renale</span>}
              {patient.hepatic_impairment === 1 && (
                <span className="chip bg-warn-soft text-warn">insuffisance hepatique</span>
              )}
              {allergies.length > 0 && (
                <span className="chip bg-danger-soft text-danger">
                  {allergies.length} allergie{allergies.length > 1 ? 's' : ''}
                </span>
              )}
              {patient.blood_group && <span className="chip bg-paper">groupe {patient.blood_group}</span>}
              {patient.preferred_language && (
                <span className="chip bg-paper">langue : {patient.preferred_language}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StartConsultation patientId={patient.id} />
            <a className="btn-ghost" href={`/api/fhir/Patient/${patient.id}`} target="_blank" rel="noreferrer">
              Ressource FHIR
            </a>
            <Link className="btn-ghost" href={`/audit?patientId=${patient.id}`}>
              Journal d acces
            </Link>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Allergies">
          {allergies.length === 0 ? (
            <Empty>Aucune allergie documentee.</Empty>
          ) : (
            <ul className="space-y-2">
              {allergies.map((a) => (
                <li key={a.id} className="text-sm">
                  <span className="font-medium">{a.substance}</span>
                  {a.criticality === 'high' && <span className="chip ml-2 bg-danger text-white">critique</span>}
                  {a.reaction && <div className="text-xs text-ink-soft">{a.reaction}</div>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Problemes actifs">
          {problems.length === 0 ? (
            <Empty>Aucun antecedent enregistre.</Empty>
          ) : (
            <ul className="space-y-2">
              {problems.map((p) => (
                <li key={p.id} className="text-sm">
                  <span className="font-medium">{p.label}</span>
                  {p.icd10_code && <code className="ml-2 text-[11px]">{p.icd10_code}</code>}
                  <div className="text-xs text-ink-soft">
                    {p.clinical_status} · enregistre le {p.recorded_at.slice(0, 10)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Traitements de fond">
          {medications.length === 0 ? (
            <Empty>Aucun traitement au long cours.</Empty>
          ) : (
            <ul className="space-y-2">
              {medications.map((m) => (
                <li key={m.id} className="text-sm">
                  <span className="font-medium">{m.drug_name}</span>
                  {m.dose && <span className="ml-2 text-xs text-ink-soft">{m.dose}</span>}
                  {m.atc_code && <code className="ml-2 text-[11px]">ATC {m.atc_code}</code>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Dernieres constantes">
        {latest.size === 0 ? (
          <Empty>Aucune constante enregistree. Elles seront extraites automatiquement des consultations.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[...latest.values()].map((o) => (
              <div key={o.id} className="rounded-lg border border-line p-3">
                <div className="text-xs text-ink-soft">{o.label}</div>
                <div className="text-lg font-bold">
                  {o.value_num ?? o.value_text}
                  <span className="ml-1 text-xs font-normal text-ink-soft">{o.unit}</span>
                  {o.interpretation && o.interpretation !== 'N' && (
                    <span className={`chip ml-2 ${o.interpretation === 'H' ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn'}`}>
                      {o.interpretation === 'H' ? 'eleve' : 'bas'}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-ink-soft">{o.effective_at.slice(0, 10)}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={`Consultations (${consultations.length})`}>
          {consultations.length === 0 ? (
            <Empty>Aucune consultation.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {consultations.map((c) => (
                <li key={c.id}>
                  <Link href={`/consultations/${c.id}`} className="flex items-center gap-2 py-2 hover:underline">
                    <span className="flex-1 text-sm">{formatDate(c.started_at)}</span>
                    <span className="chip bg-paper text-ink-soft">{c.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Ordonnances (${prescriptions.length})`}>
          {prescriptions.length === 0 ? (
            <Empty>Aucune ordonnance.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {prescriptions.map((rx) => (
                <li key={rx.id} className="py-2">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-sm">
                      {rx.items.map((i) => i.drug_name).join(', ') || 'ordonnance vide'}
                    </span>
                    <span
                      className={`chip ${
                        rx.status === 'validated'
                          ? 'bg-ok-soft text-ok'
                          : rx.status === 'draft'
                            ? 'bg-warn-soft text-warn'
                            : 'bg-paper text-ink-soft'
                      }`}
                    >
                      {rx.status === 'draft' ? 'brouillon' : rx.status === 'validated' ? 'validee' : rx.status}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-ink-soft">
                    <span>{(rx.validated_at ?? rx.created_at).slice(0, 16)}</span>
                    {rx.status === 'validated' && (
                      <Link href={`/ordonnance/${rx.id}`} className="text-brand-dark hover:underline">
                        imprimer
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
