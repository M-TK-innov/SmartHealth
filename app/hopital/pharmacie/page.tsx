import Link from 'next/link';
import { requirePermission } from '@/lib/auth/guard';
import { rayon } from '@/lib/hopital/pharmacie-store';
import { HORIZON_PEREMPTION_JOURS } from '@/lib/hopital/pharmacie';

export const dynamic = 'force-dynamic';

const LIBELLE = {
  perime: 'Perime',
  rupture: 'Rupture',
  bas: 'Stock bas',
  ok: 'Suffisant',
} as const;

const COULEUR = {
  perime: 'bg-danger text-white',
  rupture: 'bg-danger-soft text-danger',
  bas: 'bg-warn-soft text-warn',
  ok: 'bg-brand-soft text-brand-dark',
} as const;

/**
 * L'etat du rayon.
 *
 * Deux colonnes separees pour « perime » et « perime bientot », et ce n'est
 * pas une coquetterie : la premiere est une perte deja consommee, la seconde
 * est le seul chiffre sur lequel on peut encore agir — servir en priorite,
 * ou transferer vers un centre qui en consomme davantage.
 */
export default async function PharmaciePage() {
  const ctx = await requirePermission('pharmacie:read', '/hopital/pharmacie');
  const articles = rayon(ctx.user.organization_id ?? null);

  const aAgir = articles.filter((a) => a.niveau !== 'ok');
  const perimees = articles.reduce((n, a) => n + a.perimees, 0);

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Chiffre valeur={String(articles.length)} libelle="References" detail="au catalogue actif" />
        <Chiffre
          valeur={String(articles.filter((a) => a.niveau === 'rupture').length)}
          libelle="En rupture"
          detail="aucune unite servable"
          alerte={articles.some((a) => a.niveau === 'rupture')}
        />
        <Chiffre
          valeur={String(perimees)}
          libelle="Unites perimees en rayon"
          detail="a retirer et mettre en destruction"
          alerte={perimees > 0}
        />
        <Chiffre
          valeur={String(articles.reduce((n, a) => n + a.bientotPerimees, 0))}
          libelle={`Perimeront sous ${HORIZON_PEREMPTION_JOURS} jours`}
          detail="encore servables : a ecouler en priorite"
        />
      </section>

      <section className="card">
        <header className="border-b border-line px-5 py-3">
          <h1 className="text-lg font-bold">Rayon</h1>
          <p className="text-xs text-ink-soft">
            Ce qui demande une action est en tete. Les sorties se font du lot qui perime le plus
            tot, pas du plus ancien.
          </p>
        </header>

        {articles.length === 0 ? (
          <p className="p-5 text-sm text-ink-soft">Aucun article au catalogue.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase text-ink-soft">
              <tr>
                <th className="px-5 py-2 font-medium">Article</th>
                <th className="px-2 py-2 text-right font-medium">Servable</th>
                <th className="px-2 py-2 text-right font-medium">Seuil</th>
                <th className="px-2 py-2 text-right font-medium">Perime</th>
                <th className="px-2 py-2 text-right font-medium">Bientot</th>
                <th className="px-5 py-2 font-medium">Etat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {articles.map((a) => (
                <tr key={a.articleId}>
                  <td className="px-5 py-2 font-medium">{a.dci}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{a.disponible}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-ink-soft">{a.seuilAlerte}</td>
                  <td
                    className={`px-2 py-2 text-right tabular-nums ${
                      a.perimees > 0 ? 'font-semibold text-danger' : 'text-ink-soft'
                    }`}
                  >
                    {a.perimees || '—'}
                  </td>
                  <td
                    className={`px-2 py-2 text-right tabular-nums ${
                      a.bientotPerimees > 0 ? 'text-warn' : 'text-ink-soft'
                    }`}
                  >
                    {a.bientotPerimees || '—'}
                  </td>
                  <td className="px-5 py-2">
                    <span className={`chip ${COULEUR[a.niveau]}`}>{LIBELLE[a.niveau]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {aAgir.length > 0 && (
          <p className="border-t border-line px-5 py-2 text-[11px] text-ink-soft">
            {aAgir.length} reference{aAgir.length > 1 ? 's' : ''} demande
            {aAgir.length > 1 ? 'nt' : ''} une action. Un lot perime ne sort jamais, meme s il est
            le seul en rayon : la dispensation est refusee et le motif le dit.
          </p>
        )}
      </section>

      <p className="text-xs text-ink-soft">
        <Link href="/hopital" className="hover:underline">
          ← Lits et files
        </Link>
      </p>
    </div>
  );
}

function Chiffre({
  valeur,
  libelle,
  detail,
  alerte = false,
}: {
  valeur: string;
  libelle: string;
  detail: string;
  alerte?: boolean;
}) {
  return (
    <div className={`card-pad ${alerte ? 'border-danger' : ''}`}>
      <p className={`text-3xl font-bold ${alerte ? 'text-danger' : ''}`}>{valeur}</p>
      <p className="text-sm font-medium">{libelle}</p>
      <p className="mt-0.5 text-xs text-ink-soft">{detail}</p>
    </div>
  );
}
