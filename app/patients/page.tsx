import Link from 'next/link';
import { listPatients } from '@/lib/repo';
import { NewPatientForm } from '@/components/NewPatientForm';
import { StartConsultation } from '@/components/StartConsultation';
import { computeAge, translateGender } from '@/lib/ai/prompts';

export const dynamic = 'force-dynamic';

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const patients = listPatients(q);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h1 className="text-lg font-bold">Patients ({patients.length})</h1>
          <form className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              className="input w-64"
              placeholder="Nom, prenom, dossier, telephone..."
            />
            <button className="btn-ghost">Rechercher</button>
          </form>
        </header>

        {patients.length === 0 ? (
          <p className="p-5 text-sm text-ink-soft">
            {q ? `Aucun patient ne correspond a « ${q} ».` : 'Aucun patient enregistre pour le moment.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {patients.map((p) => {
              const age = p.birth_date ? computeAge(p.birth_date) : null;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Link href={`/patients/${p.id}`} className="min-w-0 flex-1 hover:underline">
                    <div className="truncate font-medium">
                      {p.given_name} {p.family_name}
                    </div>
                    <div className="text-xs text-ink-soft">
                      {p.mrn} · {age !== null ? `${age} ans` : 'age inconnu'} · {translateGender(p.gender)}
                      {p.city ? ` · ${p.city}` : ''}
                      {p.is_pregnant === 1 ? ' · grossesse' : ''}
                    </div>
                  </Link>
                  <StartConsultation patientId={p.id} label="Consulter" className="btn-ghost btn-sm" />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <NewPatientForm compact />
    </div>
  );
}
