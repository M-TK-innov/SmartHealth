import Link from 'next/link';
import { requirePermission } from '@/lib/auth/guard';
import { journeeDe } from '@/lib/rdv/store';
import { listPractitioners } from '@/lib/repo';
import { nowIso, get } from '@/lib/db';
import { DemarrerTeleconsultation } from '@/components/rdv/DemarrerTeleconsultation';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Rendez-vous — SmartHealth' };

const ETAT: Record<string, { libelle: string; classe: string }> = {
  propose: { libelle: 'Propose', classe: '' },
  confirme: { libelle: 'Confirme', classe: 'bg-brand-soft text-brand' },
  'en-salle': { libelle: 'En salle', classe: 'bg-warn-soft text-warn' },
  'en-cours': { libelle: 'En cours', classe: 'bg-danger text-white' },
  honore: { libelle: 'Honore', classe: '' },
  annule: { libelle: 'Annule', classe: 'bg-danger-soft text-danger' },
  absent: { libelle: 'Non honore', classe: 'bg-warn-soft text-warn' },
};

/**
 * Le planning du jour.
 *
 * LE PRATICIEN PAR DEFAUT EST CELUI QUI REGARDE, quand il en est un. Un
 * medecin qui ouvre cette page veut sa journee, pas un menu deroulant a
 * remplir. L'accueil, lui, n'est rattache a aucun praticien : il choisit, et
 * la liste lui est proposee.
 *
 * L'etat « non honore » est distingue de « annule » a l'affichage comme en
 * base : un patient qui previent n'est pas un patient qui ne vient pas, et
 * confondre les deux rendrait tout indicateur d'absenteisme faux.
 */
export default async function RendezVousPage({
  searchParams,
}: {
  searchParams: Promise<{ praticien?: string; jour?: string }>;
}) {
  const ctx = await requirePermission('consultation:read', '/rendez-vous');
  const { praticien, jour } = await searchParams;

  const praticiens = listPractitioners();
  const choisi = praticien ?? ctx.user.practitioner_id ?? praticiens[0]?.id ?? null;
  const date = jour ?? nowIso().slice(0, 10);

  const rdvs = choisi ? journeeDe(choisi, date) : [];

  // Le nom du patient n'est pas joint dans le store : il ne regarde que cette
  // page, et une requete par ligne reste negligeable sur une journee de
  // consultation. Mieux vaut cela qu'une projection de plus a maintenir.
  const nomDe = (id: string) => {
    const p = get<{ given_name: string; family_name: string }>(
      'SELECT given_name, family_name FROM patient WHERE id = ?',
      [id],
    );
    return p ? `${p.given_name} ${p.family_name}` : 'Dossier inconnu';
  };

  return (
    <div className="space-y-4">
      <header className="card-pad">
        <h1 className="text-xl font-bold">Rendez-vous</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Journee du {date}. Les consultations a distance s ouvrent un quart d heure avant l heure
          prevue, et seulement si le patient a donne son accord.
        </p>

        {praticiens.length > 1 && (
          <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs text-ink-soft">
              Praticien
              <select name="praticien" defaultValue={choisi ?? ''} className="input mt-1 block">
                {praticiens.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.given_name} {p.family_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-soft">
              Jour
              <input type="date" name="jour" defaultValue={date} className="input mt-1 block" />
            </label>
            <button type="submit" className="btn-ghost btn-sm">
              Voir
            </button>
          </form>
        )}
      </header>

      {rdvs.length === 0 ? (
        <p className="card-pad text-sm text-ink-soft">Aucun rendez-vous ce jour.</p>
      ) : (
        <ul className="space-y-2">
          {rdvs.map((r) => {
            const etat = ETAT[r.etat] ?? { libelle: r.etat, classe: '' };
            return (
              <li key={r.id} className={`card-pad ${r.etat === 'annule' ? 'opacity-70' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {r.debut.slice(11, 16)} — {nomDe(r.patient_id)}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {r.mode === 'distance' ? 'A distance' : 'Sur place'} · {r.duree_min} min
                      {r.motif ? ` · ${r.motif}` : ''}
                    </p>
                  </div>
                  <span className={`chip ${etat.classe}`}>{etat.libelle}</span>
                </div>

                {r.mode === 'distance' && r.etat !== 'annule' && r.etat !== 'honore' && (
                  <>
                    {r.consentement_le ? (
                      r.etat === 'en-cours' ? (
                        <Link
                          href={`/rendez-vous/${r.id}/salle`}
                          className="btn-primary btn-sm mt-2 inline-block"
                        >
                          Rejoindre la salle
                        </Link>
                      ) : (
                        <DemarrerTeleconsultation rendezVousId={r.id} />
                      )
                    ) : (
                      <p className="mt-2 rounded-lg bg-warn-soft p-2 text-xs leading-relaxed text-warn">
                        Le patient n a pas encore donne son accord. La salle ne peut pas s ouvrir :
                        appelez-le, ou recevez-le sur place.
                      </p>
                    )}
                  </>
                )}

                {r.etat === 'annule' && r.annule_motif && (
                  <p className="mt-2 text-xs text-ink-soft">Motif : {r.annule_motif}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
