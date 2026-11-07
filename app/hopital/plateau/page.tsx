import Link from 'next/link';
import { requirePermission } from '@/lib/auth/guard';
import {
  critiquesNonTransmises,
  demandesEnCours,
  tableauPlateau,
} from '@/lib/hopital/plateau-store';
import { AcquitterCritique } from '@/components/hopital/AcquitterCritique';
import { fuseauDe } from '@/lib/localisation-store';
import { formaterInstant } from '@/lib/localisation';

export const dynamic = 'force-dynamic';

const PRIORITE = {
  vitale: 'bg-danger text-white',
  urgente: 'bg-warn-soft text-warn',
  routine: 'bg-paper text-ink-soft',
} as const;

const ETAT = {
  demandee: 'Demandee',
  prelevee: 'Prelevee',
  'en-cours': 'En cours',
  'resultat-disponible': 'Resultat disponible',
  validee: 'Validee',
  annulee: 'Annulee',
} as const;

/**
 * Plateau technique : laboratoire et imagerie.
 *
 * Les valeurs critiques non acquittees sont EN TETE, dans un encadre a
 * part. Posees dans la liste des demandes, elles seraient des lignes parmi
 * d'autres — et c'est exactement ce qui fait qu'une kaliemie a 7 attend
 * une heure.
 */
export default async function PlateauPage() {
  const ctx = await requirePermission('plateau:read', '/hopital/plateau');
  const orgId = ctx.user.organization_id ?? null;

  const fuseau = fuseauDe(orgId);
  const critiques = critiquesNonTransmises(orgId);
  const demandes = demandesEnCours(orgId);
  const tension = tableauPlateau(orgId);

  return (
    <div className="grid gap-6">
      {critiques.length > 0 && (
        <section className="card border-danger">
          <header className="border-b border-danger bg-danger-soft px-5 py-3">
            <h1 className="text-lg font-bold text-danger">
              {critiques.length} valeur{critiques.length > 1 ? 's' : ''} critique
              {critiques.length > 1 ? 's' : ''} a transmettre
            </h1>
            <p className="text-xs">
              Tant que personne n est nomme, le resultat n a ete transmis a personne. Ce compteur
              doit revenir a zero.
            </p>
          </header>
          <ul className="divide-y divide-line">
            {critiques.map((c) => (
              <li key={c.resultat_id} className="grid gap-2 px-5 py-3 sm:flex sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {c.given_name} {c.family_name}
                  </p>
                  <p className="text-sm text-danger">
                    {c.examen} : <b>{c.valeur_num ?? '—'}</b> {c.unite ?? ''}
                    <span className="ml-2 text-xs text-ink-soft">
                      rendu {formaterInstant(c.rendu_le, fuseau)}
                    </span>
                  </p>
                </div>
                <AcquitterCritique
                  demandeId={c.demande_id}
                  resultatId={c.resultat_id}
                  peutAcquitter={ctx.can('plateau:acquitter')}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tension.map((t) => (
          <div key={t.domaine} className="card-pad">
            <p className="text-3xl font-bold">{t.enAttenteDeResultat}</p>
            <p className="text-sm font-medium capitalize">{t.domaine} — en attente</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {t.demandees} a prelever · delai median {t.delaiMedianMinutes} min
            </p>
          </div>
        ))}
        <div className={`card-pad ${critiques.length > 0 ? 'border-danger' : ''}`}>
          <p className={`text-3xl font-bold ${critiques.length > 0 ? 'text-danger' : ''}`}>
            {critiques.length}
          </p>
          <p className="text-sm font-medium">Critiques non transmises</p>
          <p className="mt-0.5 text-xs text-ink-soft">doit valoir zero</p>
        </div>
      </section>

      <section className="card">
        <header className="border-b border-line px-5 py-3">
          <h2 className="text-lg font-bold">Demandes en cours ({demandes.length})</h2>
          <p className="text-xs text-ink-soft">
            Les urgences vitales d abord, puis par anciennete de demande.
          </p>
        </header>
        {demandes.length === 0 ? (
          <p className="p-5 text-sm text-ink-soft">Aucune demande en cours.</p>
        ) : (
          <ul className="divide-y divide-line">
            {demandes.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <Link href={`/hopital/plateau/${d.id}`} className="min-w-0 flex-1 hover:underline">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{d.examen}</span>
                    <span className={`chip shrink-0 ${PRIORITE[d.priorite]}`}>{d.priorite}</span>
                  </span>
                  <span className="block text-xs text-ink-soft">
                    {d.domaine} · {ETAT[d.etat] ?? d.etat}
                  </span>
                </Link>
                <span className="shrink-0 text-xs text-ink-soft">
                  {formaterInstant(d.demandeeLe, fuseau)}
                </span>
              </li>
            ))}
          </ul>
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
