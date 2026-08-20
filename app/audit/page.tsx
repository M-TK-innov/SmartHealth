import Link from 'next/link';
import { all } from '@/lib/db';
import { getPatient } from '@/lib/repo';
import { formatDate } from '@/lib/report';

export const dynamic = 'force-dynamic';

interface Entry {
  id: string;
  at: string;
  actor_label: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  patient_id: string | null;
  detail: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  create: 'creation',
  read: 'consultation',
  update: 'modification',
  delete: 'suppression',
  sign: 'signature',
  validate: 'validation',
  export: 'export',
};

const ACTION_STYLE: Record<string, string> = {
  validate: 'bg-ok-soft text-ok',
  sign: 'bg-ok-soft text-ok',
  export: 'bg-brand-soft text-brand-dark',
  delete: 'bg-danger-soft text-danger',
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ patientId?: string }> }) {
  const { patientId } = await searchParams;
  const patient = patientId ? getPatient(patientId) : null;

  const entries = patientId
    ? all<Entry>('SELECT * FROM audit_log WHERE patient_id = ? ORDER BY at DESC, rowid DESC LIMIT 400', [patientId])
    : all<Entry>('SELECT * FROM audit_log ORDER BY at DESC, rowid DESC LIMIT 400');

  return (
    <section className="card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <h1 className="text-lg font-bold">Journal d audit</h1>
          <p className="text-xs text-ink-soft">
            {patient
              ? `Filtre sur le dossier de ${patient.given_name} ${patient.family_name}.`
              : 'Toute ecriture au dossier, validation d ordonnance, signature et export est tracee.'}
          </p>
        </div>
        {patient && (
          <Link href="/audit" className="btn-ghost btn-sm">
            Retirer le filtre
          </Link>
        )}
      </header>

      {entries.length === 0 ? (
        <p className="p-5 text-sm text-ink-soft">Aucune entree.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-5 py-2">Horodatage</th>
              <th className="px-5 py-2">Acteur</th>
              <th className="px-5 py-2">Action</th>
              <th className="px-5 py-2">Objet</th>
              <th className="px-5 py-2">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap px-5 py-2 text-xs text-ink-soft">{formatDate(e.at)}</td>
                <td className="px-5 py-2 text-xs">{e.actor_label ?? 'systeme'}</td>
                <td className="px-5 py-2">
                  <span className={`chip ${ACTION_STYLE[e.action] ?? 'bg-paper text-ink-soft'}`}>
                    {ACTION_LABEL[e.action] ?? e.action}
                  </span>
                </td>
                <td className="px-5 py-2 text-xs">
                  {e.entity}
                  {e.patient_id && (
                    <Link href={`/patients/${e.patient_id}`} className="ml-2 text-brand-dark hover:underline">
                      dossier
                    </Link>
                  )}
                </td>
                <td className="max-w-md px-5 py-2 text-xs text-ink-soft">
                  <span className="line-clamp-3 break-words">{e.detail}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
