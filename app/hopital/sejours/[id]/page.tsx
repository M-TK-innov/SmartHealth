import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/guard';
import {
  consultationsDuSejour,
  litParId,
  mouvementsDuSejour,
  sejourParId,
} from '@/lib/hopital/store';
import { passagesOuvertsDuSejour } from '@/lib/hopital/flux-store';
import { factureOuverteDuSejour } from '@/lib/hopital/caisse-store';
import { francs, solde } from '@/lib/hopital/caisse';
import { dureeJours } from '@/lib/hopital/sejour';
import { get } from '@/lib/db';
import { fuseauDe } from '@/lib/localisation-store';
import { formaterInstant } from '@/lib/localisation';

export const dynamic = 'force-dynamic';

const STATUT = {
  prevu: 'Prevu',
  'en-cours': 'En cours',
  sorti: 'Sorti',
  annule: 'Annule',
} as const;

/**
 * Le dossier d'un sejour : le parcours, les consultations, la caisse.
 *
 * C'est l'ecran qui fait des modules une plateforme plutot que quatre
 * applications. Un soignant qui doit ouvrir quatre ecrans pour savoir ou en
 * est un patient finit par n'en ouvrir aucun.
 */
export default async function SejourPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('patient:read', '/hopital');
  const { id } = await params;

  const sejour = sejourParId(id);
  if (!sejour) notFound();

  const patient = get<{ given_name: string; family_name: string; mrn: string | null }>(
    'SELECT given_name, family_name, mrn FROM patient WHERE id = ?',
    [sejour.patientId],
  );
  if (!patient) notFound();

  const fuseau = fuseauDe(ctx.user.organization_id ?? null);
  const lit = sejour.litId ? litParId(sejour.litId) : null;
  const mouvements = mouvementsDuSejour(id);
  const consultations = consultationsDuSejour(id);
  const attentes = ctx.can('flux:read') ? passagesOuvertsDuSejour(id) : [];
  const facture = ctx.can('caisse:read') ? factureOuverteDuSejour(id) : null;
  const compte = facture ? solde(facture) : null;
  // Un sejour en cours se compte jusqu'a maintenant : afficher « 0 jour »
  // le troisieme jour d'une hospitalisation serait pire que de ne rien
  // afficher.
  const duree = sejour.admisLe
    ? dureeJours(sejour.admisLe, sejour.sortiLe ?? new Date().toISOString())
    : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="grid gap-6">
        <section className="card-pad">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold">
                {patient.given_name} {patient.family_name}
              </h1>
              <p className="text-xs text-ink-soft">
                {patient.mrn ? `${patient.mrn} · ` : ''}
                {STATUT[sejour.statut] ?? sejour.statut} · {sejour.type}
                {duree !== null ? ` · ${duree} jour${duree > 1 ? 's' : ''}` : ''}
              </p>
            </div>
            {lit && (
              <span className="chip bg-brand-soft text-brand-dark">
                Lit {lit.code}
                {lit.isolement ? ' · isolement' : ''}
              </span>
            )}
          </div>
        </section>

        <section className="card">
          <header className="border-b border-line px-5 py-3">
            <h2 className="text-base font-bold">Parcours</h2>
            <p className="text-xs text-ink-soft">
              Chaque passage dans un lit, et non seulement le lit actuel : c est ce qui permet de
              reconstituer un sejour apres coup.
            </p>
          </header>
          {mouvements.length === 0 ? (
            <p className="p-5 text-sm text-ink-soft">Aucun mouvement enregistre.</p>
          ) : (
            <ol className="divide-y divide-line">
              {mouvements.map((m) => (
                <li key={m.id} className="flex flex-wrap items-baseline gap-2 px-5 py-2.5 text-sm">
                  <span className="w-24 shrink-0 font-medium capitalize">{m.type}</span>
                  <span className="min-w-0 flex-1 text-ink-soft">
                    {m.unite_nom ?? '—'}
                    {m.lit_code ? ` · lit ${m.lit_code}` : ''}
                    {m.motif ? ` · ${m.motif}` : ''}
                  </span>
                  <span className="shrink-0 text-xs text-ink-soft">
                    {formaterInstant(m.survenu_le, fuseau)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card">
          <header className="border-b border-line px-5 py-3">
            <h2 className="text-base font-bold">Consultations de ce sejour</h2>
            <p className="text-xs text-ink-soft">
              Rattachees par le lien, et non deduites des dates : une consultation externe du meme
              jour n a rien a faire ici.
            </p>
          </header>
          {consultations.length === 0 ? (
            <p className="p-5 text-sm text-ink-soft">Aucune consultation rattachee a ce sejour.</p>
          ) : (
            <ul className="divide-y divide-line">
              {consultations.map((c) => (
                <li key={c.id} className="px-5 py-2.5 text-sm">
                  <Link href={`/consultations/${c.id}`} className="hover:underline">
                    <span className="font-medium">{c.reason_text ?? 'Consultation'}</span>{' '}
                    <span className="text-xs text-ink-soft">
                      {formaterInstant(c.started_at, fuseau)}
                      {c.signed_at ? ' · signee' : ` · ${c.status}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-4 self-start">
        {ctx.can('flux:read') && (
          <section className="card-pad">
            <h2 className="mb-2 text-sm font-semibold">File d attente</h2>
            {attentes.length === 0 ? (
              <p className="text-sm text-ink-soft">Ce patient n attend a aucun poste.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {attentes.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <Link href={`/hopital/files/${p.posteId}`} className="truncate hover:underline">
                      {p.etat === 'en-cours' ? 'Pris en charge' : 'En attente'}
                    </Link>
                    <span className="chip shrink-0 bg-paper text-ink-soft">{p.gravite}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {ctx.can('caisse:read') && (
          <section className="card-pad">
            <h2 className="mb-2 text-sm font-semibold">Caisse</h2>
            {!compte ? (
              <p className="text-sm text-ink-soft">Aucune facture ouverte.</p>
            ) : (
              <>
                <p className="text-2xl font-bold tabular-nums">{francs(compte.resteACharge)}</p>
                <p className="text-xs text-ink-soft">
                  reste a charge · {francs(compte.total)} facturés, {francs(compte.regle)} regles
                </p>
                {compte.tropPercu > 0 && (
                  <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
                    <b>{francs(compte.tropPercu)} percus en trop.</b> A rembourser.
                  </p>
                )}
                <Link href={`/hopital/caisse/${id}`} className="btn-ghost btn-sm mt-3 block text-center">
                  Ouvrir la caisse
                </Link>
              </>
            )}
          </section>
        )}

        <p className="text-xs text-ink-soft">
          <Link href="/hopital" className="hover:underline">
            ← Lits et files
          </Link>
        </p>
      </div>
    </div>
  );
}
