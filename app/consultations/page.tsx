import Link from 'next/link';
import { all } from '@/lib/db';
import { formatDate } from '@/lib/report';
import { organizationFilter, requirePermission } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  status: string;
  started_at: string;
  signed_at: string | null;
  analysis_engine: string | null;
  given_name: string;
  family_name: string;
  mrn: string | null;
  patient_id: string;
  n_diag: number;
  n_rx_draft: number;
}

const STATUS_LABEL: Record<string, string> = {
  'in-progress': 'en cours',
  analyzed: 'a signer',
  signed: 'signee',
  cancelled: 'annulee',
};

export default async function ConsultationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requirePermission('consultation:read', '/consultations');
  const scoped = organizationFilter(ctx);
  const { status } = await searchParams;

  // Le filtre d'etablissement fait partie de la requete, pas de l'affichage :
  // une liste filtree cote client resterait lisible dans la reponse reseau.
  const where: string[] = [];
  const params: unknown[] = [];
  if (status) {
    where.push('c.status = ?');
    params.push(status);
  }
  if (scoped) {
    where.push('(c.organization_id = ? OR c.organization_id IS NULL)');
    params.push(scoped);
  }

  const rows = all<Row>(
    `SELECT c.id, c.status, c.started_at, c.signed_at, c.analysis_engine, c.patient_id,
            p.given_name, p.family_name, p.mrn,
            (SELECT COUNT(*) FROM diagnosis d WHERE d.consultation_id = c.id) n_diag,
            (SELECT COUNT(*) FROM prescription r WHERE r.consultation_id = c.id AND r.status = 'draft') n_rx_draft
     FROM consultation c JOIN patient p ON p.id = c.patient_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY c.started_at DESC LIMIT 200`,
    params,
  );

  return (
    <section className="card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h1 className="text-lg font-bold">Consultations</h1>
        <nav className="flex gap-1">
          {[
            ['', 'Toutes'],
            ['in-progress', 'En cours'],
            ['analyzed', 'A signer'],
            ['signed', 'Signees'],
          ].map(([value, label]) => (
            <Link
              key={value}
              href={value ? `/consultations?status=${value}` : '/consultations'}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                (status ?? '') === value ? 'bg-brand text-white' : 'text-ink-soft hover:bg-paper'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {rows.length === 0 ? (
        <p className="p-5 text-sm text-ink-soft">Aucune consultation dans cette vue.</p>
      ) : (
        <table className="table-responsive">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-5 py-2">Patient</th>
              <th className="px-5 py-2">Date</th>
              <th className="px-5 py-2">Diagnostics</th>
              <th className="px-5 py-2">Statut</th>
              <th className="px-5 py-2">Export</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-paper">
                <td className="px-5 py-2.5">
                  <Link href={`/consultations/${r.id}`} className="font-medium hover:underline">
                    {r.given_name} {r.family_name}
                  </Link>
                  <div className="text-xs text-ink-soft">{r.mrn}</div>
                </td>
                <td data-label="Date" className="px-5 py-2.5 text-xs text-ink-soft">{formatDate(r.started_at)}</td>
                <td data-label="Diagnostics" className="px-5 py-2.5">{r.n_diag}</td>
                <td data-label="Statut" className="px-5 py-2.5">
                  <span className="chip bg-paper text-ink-soft">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  {r.n_rx_draft > 0 && (
                    <span className="chip ml-1 bg-warn-soft text-warn">ordonnance a valider</span>
                  )}
                </td>
                <td data-label="Export" className="px-5 py-2.5">
                  <a
                    className="text-xs text-brand-dark hover:underline"
                    href={`/api/export/${r.id}?format=fhir-document`}
                  >
                    FHIR
                  </a>
                  <span className="mx-1 text-line">|</span>
                  <a className="text-xs text-brand-dark hover:underline" href={`/api/export/${r.id}?format=hl7-oru`}>
                    HL7
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
