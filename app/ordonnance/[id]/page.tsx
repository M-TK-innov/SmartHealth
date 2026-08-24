import { notFound } from 'next/navigation';
import { getPatient, getPractitioner, getPrescription, getPrescriptionItems } from '@/lib/repo';
import { computeAge, translateGender } from '@/lib/ai/prompts';
import { formatDate } from '@/lib/report';
import { assertSameOrganization, requirePermission } from '@/lib/auth/guard';
import { getConsultation } from '@/lib/repo';

export const dynamic = 'force-dynamic';

/**
 * Ordonnance imprimable.
 *
 * Ne s'affiche que pour une ordonnance validee : un brouillon genere par l'IA
 * ne doit jamais pouvoir sortir de l'application sous une forme qui ressemble
 * a une prescription.
 */
export default async function PrescriptionPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('consultation:read', `/ordonnance/${(await params).id}`);
  const { id } = await params;
  const rx = getPrescription(id);
  if (!rx) notFound();
  assertSameOrganization(ctx, getConsultation(rx.consultation_id)?.organization_id ?? null);

  const patient = getPatient(rx.patient_id);
  if (!patient) notFound();
  const items = getPrescriptionItems(id);
  const prescriber = rx.validated_by
    ? getPractitioner(rx.validated_by)
    : rx.practitioner_id
      ? getPractitioner(rx.practitioner_id)
      : null;
  const age = patient.birth_date ? computeAge(patient.birth_date) : null;

  if (rx.status !== 'validated') {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-warn bg-warn-soft p-6">
        <h1 className="text-lg font-bold text-warn">Ordonnance non validee</h1>
        <p className="mt-2 text-sm">
          Cette ordonnance est au statut « {rx.status} ». Une proposition generee par l intelligence artificielle n a
          aucune valeur de prescription tant qu un medecin ne l a pas relue et validee. L impression est donc
          volontairement bloquee.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-ink print:p-0">
      <header className="flex items-start justify-between border-b-2 border-brand pb-4">
        <div>
          <h1 className="text-xl font-bold text-brand-dark">
            {process.env.FACILITY_NAME || 'Structure de sante'}
          </h1>
          <p className="text-xs text-ink-soft">Identifiant etablissement : {process.env.FACILITY_ID || '—'}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">ORDONNANCE</p>
          <p className="text-xs text-ink-soft">N° {rx.id.slice(0, 8).toUpperCase()}</p>
          <p className="text-xs text-ink-soft">{formatDate(rx.validated_at ?? rx.created_at)}</p>
        </div>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Prescripteur</p>
          <p className="mt-1 font-semibold">
            {prescriber ? `Dr ${prescriber.given_name} ${prescriber.family_name}` : 'Praticien non identifie'}
          </p>
          {prescriber?.qualification && <p className="text-xs">{prescriber.qualification}</p>}
          {prescriber?.license_number && (
            <p className="text-xs text-ink-soft">N° ordre : {prescriber.license_number}</p>
          )}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Patient</p>
          <p className="mt-1 font-semibold">
            {patient.given_name} {patient.family_name}
          </p>
          <p className="text-xs">
            {age !== null ? `${age} ans` : 'age non renseigne'} · {translateGender(patient.gender)}
            {patient.weight_kg ? ` · ${patient.weight_kg} kg` : ''}
          </p>
          <p className="text-xs text-ink-soft">Dossier {patient.mrn}</p>
          {patient.is_pregnant === 1 && <p className="text-xs font-semibold text-warn">Grossesse en cours</p>}
        </div>
      </section>

      <section className="mt-6">
        <ol className="space-y-4">
          {items.map((it, i) => (
            <li key={it.id} className="border-b border-dashed border-line pb-3">
              <p className="text-base font-bold">
                {i + 1}. {it.drug_name} {it.strength}
                {it.form ? <span className="ml-2 text-sm font-normal text-ink-soft">({it.form})</span> : null}
              </p>
              <p className="mt-0.5 text-sm">
                {[
                  it.dose,
                  it.frequency,
                  it.duration_days ? `pendant ${it.duration_days} jour${it.duration_days > 1 ? 's' : ''}` : null,
                  it.route && it.route !== 'oral' ? `voie ${it.route}` : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </p>
              {it.instructions && <p className="text-sm italic text-ink-soft">{it.instructions}</p>}
              <p className="mt-1 text-[10px] text-ink-soft">
                {it.atc_code ? `ATC ${it.atc_code}` : ''}
                {it.substitution_allowed === 1 ? ' · substitution generique autorisee' : ' · non substituable'}
                {it.is_essential_list === 1 ? ' · liste des medicaments essentiels' : ''}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {rx.notes && (
        <section className="mt-4 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Remarques</p>
          <p>{rx.notes}</p>
        </section>
      )}

      <footer className="mt-10 flex items-end justify-between">
        <div className="text-[10px] leading-relaxed text-ink-soft">
          <p className="font-semibold">Verification pharmacie</p>
          <p>Reference : {rx.id}</p>
          <p>Validee le {rx.validated_at}</p>
          <p className="mt-1 max-w-xs">
            Document genere par ParleDocteur. Preparation assistee par intelligence artificielle, relue et validee
            par le prescripteur identifie ci-contre.
          </p>
        </div>
        <div className="text-center">
          <div className="h-16 w-48 border-b border-ink" />
          <p className="mt-1 text-xs">Signature et cachet</p>
        </div>
      </footer>

      <div className="no-print mt-8 flex gap-2">
        <a className="btn-ghost" href={`/consultations/${rx.consultation_id}`}>
          Retour a la consultation
        </a>
      </div>
    </div>
  );
}
