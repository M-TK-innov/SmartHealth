import Link from 'next/link';
import { requireAnyPermission } from '@/lib/auth/guard';
import { tableauOccupation } from '@/lib/hopital/store';
import { tableauTension } from '@/lib/hopital/flux-store';

export const dynamic = 'force-dynamic';

/**
 * Tableau de bord de l'etablissement : les lits et les files, cote a cote.
 *
 * Les deux moities repondent a la meme question — « est-ce que ca tient ? » —
 * a deux echelles de temps. L'occupation dit si on pourra admettre ce soir ;
 * la tension dit si on tient l'heure qui vient.
 *
 * Un chiffre est mis en avant que les tableaux de bord hospitaliers affichent
 * rarement : les patients PARTIS sans avoir ete vus. C'est le seul qui compte
 * des gens, et non des actes.
 */
export default async function HopitalPage() {
  const ctx = await requireAnyPermission(['flux:read', 'patient:read'], '/hopital');
  const orgId = ctx.user.organization_id ?? null;
  const peutVoirFiles = ctx.can('flux:read');

  const unites = tableauOccupation(orgId);
  const postes = peutVoirFiles ? tableauTension(orgId) : [];

  const utilisables = unites.reduce((n, u) => n + (u.total - u.horsService), 0);
  const occupes = unites.reduce((n, u) => n + u.occupes, 0);
  const taux = utilisables === 0 ? 0 : Math.round((occupes / utilisables) * 100);
  const partis = postes.reduce((n, p) => n + p.partis, 0);
  const enAttente = postes.reduce((n, p) => n + p.enAttente, 0);

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Chiffre valeur={`${taux} %`} libelle="Occupation" detail={`${occupes} lits sur ${utilisables} utilisables`} />
        <Chiffre valeur={String(utilisables - occupes)} libelle="Places disponibles" detail="hors lits a preparer et hors service" />
        {peutVoirFiles && (
          <>
            <Chiffre valeur={String(enAttente)} libelle="Patients en attente" detail="tous postes confondus" />
            <Chiffre
              valeur={String(partis)}
              libelle="Partis sans etre vus"
              detail="aujourd hui — l indicateur le plus direct d un poste sature"
              alerte={partis > 0}
            />
          </>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <header className="border-b border-line px-5 py-3">
            <h2 className="text-lg font-bold">Lits par unite</h2>
            <p className="text-xs text-ink-soft">
              Les lits hors service sont retires du denominateur : les compter ferait paraitre une
              unite saturee moins pleine qu elle ne l est.
            </p>
          </header>
          {unites.length === 0 ? (
            <p className="p-5 text-sm text-ink-soft">Aucune unite de soins enregistree.</p>
          ) : (
            <ul className="divide-y divide-line">
              {unites.map((u) => {
                const util = u.total - u.horsService;
                const pct = util === 0 ? 0 : Math.round((u.occupes / util) * 100);
                return (
                  <li key={u.code} className="px-5 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{u.nom}</span>
                      <span className={`text-sm font-semibold ${pct >= 90 ? 'text-danger' : 'text-ink-soft'}`}>
                        {u.occupes}/{util} · {pct} %
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper">
                      <div
                        className={`h-full rounded-full ${pct >= 90 ? 'bg-danger' : 'bg-brand'}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      {u.libres} libre{u.libres > 1 ? 's' : ''} · {u.aPreparer} a preparer ·{' '}
                      {u.horsService} hors service
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {peutVoirFiles && (
          <section className="card">
            <header className="border-b border-line px-5 py-3">
              <h2 className="text-lg font-bold">Tension des postes</h2>
              <p className="text-xs text-ink-soft">
                L attente mediane dit ce que vit la majorite ; l attente maximale dit qui est
                oublie.
              </p>
            </header>
            {postes.length === 0 ? (
              <p className="p-5 text-sm text-ink-soft">Aucun poste enregistre.</p>
            ) : (
              <ul className="divide-y divide-line">
                {postes.map((p) => (
                  <li key={p.posteId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <Link href={`/hopital/files/${p.posteId}`} className="min-w-0 flex-1 hover:underline">
                      <div className="truncate font-medium">{p.nom}</div>
                      <div className="text-xs text-ink-soft">
                        {p.enAttente} en attente · {p.enCours} en cours
                        {p.remontes > 0 ? ` · ${p.remontes} remonte(s) par anciennete` : ''}
                        {p.partis > 0 ? ` · ${p.partis} parti(s) sans etre vu(s)` : ''}
                      </div>
                    </Link>
                    <span
                      className={`shrink-0 text-right text-sm font-semibold ${
                        p.attenteMaxMinutes >= 90 ? 'text-danger' : 'text-ink-soft'
                      }`}
                    >
                      {p.attenteMedianeMinutes} min
                      <span className="block text-[10px] font-normal">max {p.attenteMaxMinutes} min</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
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
