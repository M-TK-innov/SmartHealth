import Link from 'next/link';
import { all, get } from '@/lib/db';
import { listPatients } from '@/lib/repo';
import { organizationFilter, requireAuth } from '@/lib/auth/guard';
import { NewPatientForm } from '@/components/NewPatientForm';
import { StartConsultation } from '@/components/StartConsultation';
import { formatDate } from '@/lib/report';
import { aiAvailable, aiModel } from '@/lib/ai/extract';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  status: string;
  started_at: string;
  patient_id: string;
  given_name: string;
  family_name: string;
  mrn: string | null;
  analysis_engine: string | null;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card-pad">
      <div className="text-3xl font-bold text-brand-dark">{value}</div>
      <div className="mt-1 text-sm font-medium">{label}</div>
      {hint && <div className="text-xs text-ink-soft">{hint}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  'in-progress': 'bg-warn-soft text-warn',
  analyzed: 'bg-brand-soft text-brand-dark',
  signed: 'bg-ok-soft text-ok',
  cancelled: 'bg-paper text-ink-soft',
};

const STATUS_LABEL: Record<string, string> = {
  'in-progress': 'en cours',
  analyzed: 'analysee, a signer',
  signed: 'signee',
  cancelled: 'annulee',
};

export default async function Dashboard() {
  const ctx = await requireAuth('/');
  const scoped = organizationFilter(ctx);
  // Chaque compteur est cloisonne au meme titre que les listes : un chiffre
  // d'activite renseigne deja sur l'activite d'un autre etablissement.
  const orgClause = (alias: string) =>
    scoped ? `(${alias}.organization_id = ? OR ${alias}.organization_id IS NULL)` : '1 = 1';
  const orgParams: unknown[] = scoped ? [scoped] : [];

  const recent = all<Row>(
    `SELECT c.id, c.status, c.started_at, c.patient_id, c.analysis_engine,
            p.given_name, p.family_name, p.mrn
     FROM consultation c JOIN patient p ON p.id = c.patient_id
     WHERE ${orgClause('c')}
     ORDER BY c.started_at DESC LIMIT 12`,
    orgParams,
  );

  const today = new Date().toISOString().slice(0, 10);
  const countConsult = (extra: string, params: unknown[] = []) =>
    get<{ n: number }>(`SELECT COUNT(*) n FROM consultation c WHERE ${orgClause('c')} AND ${extra}`, [
      ...orgParams,
      ...params,
    ])?.n ?? 0;

  const nToday = countConsult('date(c.started_at) = ?', [today]);
  const nPending = countConsult("c.status = 'analyzed'");
  const nDraftRx =
    get<{ n: number }>(
      `SELECT COUNT(*) n FROM prescription r
       JOIN consultation c ON c.id = r.consultation_id
       WHERE r.status = 'draft' AND ${orgClause('c')}`,
      orgParams,
    )?.n ?? 0;
  const nPatients =
    get<{ n: number }>(`SELECT COUNT(*) n FROM patient p WHERE ${orgClause('p')}`, orgParams)?.n ?? 0;
  const patients = listPatients('', scoped).slice(0, 6);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-brand p-8 text-white">
        <h1 className="text-2xl font-bold">Le medecin parle. Le dossier s ecrit.</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/85">
          ParleDocteur ecoute la consultation, en extrait les donnees cliniques codees (CIM-10, LOINC, SNOMED CT, ATC),
          redige le compte rendu SOAP, enrichit le dossier medical et prepare une ordonnance numerique que vous
          validez. Tout ressort en FHIR R4, HL7 v2 et DHIS2 : exploitable par n importe quel systeme de sante,
          national ou international.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white/15 px-3 py-1">
            IA : {aiAvailable() ? aiModel() : 'moteur local hors-ligne (aucune cle configuree)'}
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1">Donnees stockees localement (SQLite)</span>
          <span className="rounded-full bg-white/15 px-3 py-1">Validation medicale obligatoire</span>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Consultations aujourd hui" value={nToday} />
        <Stat label="Comptes rendus a signer" value={nPending} hint="analyses mais non signes" />
        <Stat label="Ordonnances en attente" value={nDraftRx} hint="brouillons a valider" />
        <Stat label="Patients au fichier" value={nPatients} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="card">
          <header className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="section-title">Consultations recentes</h2>
            <Link href="/consultations" className="text-xs text-brand-dark hover:underline">
              Tout voir
            </Link>
          </header>
          {recent.length === 0 ? (
            <p className="p-5 text-sm text-ink-soft">
              Aucune consultation. Creez un patient a droite pour demarrer.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/consultations/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-paper">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {r.given_name} {r.family_name}
                        <span className="ml-2 text-xs font-normal text-ink-soft">{r.mrn}</span>
                      </div>
                      <div className="text-xs text-ink-soft">{formatDate(r.started_at)}</div>
                    </div>
                    {r.analysis_engine === 'local-rules' && (
                      <span className="chip bg-warn-soft text-warn">hors-ligne</span>
                    )}
                    <span className={`chip ${STATUS_STYLE[r.status] ?? ''}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          <NewPatientForm />
          {patients.length > 0 && (
            <section className="card">
              <header className="border-b border-line px-5 py-3">
                <h2 className="section-title">Reprendre avec un patient connu</h2>
              </header>
              <ul className="divide-y divide-line">
                {patients.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 px-4 py-2.5">
                    <Link href={`/patients/${p.id}`} className="min-w-0 flex-1 hover:underline">
                      <div className="truncate text-sm font-medium">
                        {p.given_name} {p.family_name}
                      </div>
                      <div className="text-xs text-ink-soft">{p.mrn}</div>
                    </Link>
                    <StartConsultation patientId={p.id} label="Consulter" className="btn-ghost btn-sm" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
