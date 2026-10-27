import Link from 'next/link';
import { requirePermission } from '@/lib/auth/guard';
import { programmeDuJour } from '@/lib/hopital/bloc-store';

export const dynamic = 'force-dynamic';

const ETAT = {
  programmee: { libelle: 'Programmee', classe: 'bg-paper text-ink-soft' },
  'patient-au-bloc': { libelle: 'Patient au bloc', classe: 'bg-warn-soft text-warn' },
  'en-cours': { libelle: 'En cours', classe: 'bg-danger text-white' },
  terminee: { libelle: 'Terminee', classe: 'bg-brand-soft text-brand-dark' },
  annulee: { libelle: 'Annulee', classe: 'bg-paper text-ink-soft' },
  deprogrammee: { libelle: 'Deprogrammee', classe: 'bg-paper text-ink-soft' },
} as const;

const COTE = {
  droite: 'DROITE',
  gauche: 'GAUCHE',
  bilateral: 'BILATERAL',
  'sans-objet': null,
} as const;

const heure = (iso: string) => iso.slice(11, 16);

/**
 * Le programme operatoire du jour.
 *
 * Le cote est affiche EN MAJUSCULES et en couleur, a cote du geste. Ce
 * n'est pas une coquetterie typographique : c'est la seule information de
 * cette liste dont une erreur ne se rattrape pas.
 */
export default async function BlocPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string }>;
}) {
  const ctx = await requirePermission('bloc:read', '/hopital/bloc');
  const { jour: demande } = await searchParams;
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(demande ?? '') ? demande! : new Date().toISOString().slice(0, 10);

  const programme = programmeDuJour(ctx.user.organization_id ?? null, jour);
  const total = programme.reduce((n, p) => n + p.interventions.length, 0);

  return (
    <div className="grid gap-6">
      <section className="card-pad">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">
              Programme operatoire — {new Date(`${jour}T00:00:00Z`).toLocaleDateString('fr-FR')}
            </h1>
            <p className="text-xs text-ink-soft">
              {total} intervention{total > 1 ? 's' : ''} sur {programme.length} salle
              {programme.length > 1 ? 's' : ''}
            </p>
          </div>
          <form className="flex items-center gap-2">
            <input type="date" name="jour" defaultValue={jour} className="input" aria-label="Jour" />
            <button className="btn-ghost btn-sm">Voir</button>
          </form>
        </div>
      </section>

      {programme.length === 0 ? (
        <p className="card-pad text-sm text-ink-soft">Aucune salle operatoire enregistree.</p>
      ) : (
        programme.map((p) => (
          <section key={p.salle.id} className="card">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
              <h2 className="text-base font-bold">
                {p.salle.nom} <span className="text-xs font-normal text-ink-soft">{p.salle.code}</span>
              </h2>
              <span className="text-xs text-ink-soft">
                {Math.round(p.minutesProgrammees / 60)} h programmees
              </span>
            </header>

            {p.interventions.length === 0 ? (
              <p className="p-5 text-sm text-ink-soft">Salle libre ce jour.</p>
            ) : (
              <ol className="divide-y divide-line">
                {p.interventions.map((i) => {
                  const cote = COTE[i.lateralite];
                  const etat = ETAT[i.etat] ?? ETAT.programmee;
                  return (
                    <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <span className="w-24 shrink-0 font-mono text-sm">
                        {heure(i.debutPrevu)}–{heure(i.finPrevue)}
                      </span>
                      <Link
                        href={`/hopital/bloc/${i.id}`}
                        className="min-w-0 flex-1 hover:underline"
                      >
                        <span className="block truncate font-medium">{i.patientNom}</span>
                        <span className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                          <span className="truncate">{i.geste}</span>
                          {cote && (
                            <span className="shrink-0 rounded bg-danger px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
                              {cote}
                            </span>
                          )}
                        </span>
                      </Link>
                      <span className={`chip shrink-0 ${etat.classe}`}>{etat.libelle}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        ))
      )}

      <p className="text-xs text-ink-soft">
        <Link href="/hopital" className="hover:underline">
          ← Lits et files
        </Link>
      </p>
    </div>
  );
}
