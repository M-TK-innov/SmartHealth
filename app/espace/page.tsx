import Link from 'next/link';
import Logo from '@/components/Logo';
import { requirePatient } from '@/lib/patient/session';
import { facturesDe, noterVisiteADistance, ordonnancesDe, sejoursDe } from '@/lib/patient/dossier';
import { francs } from '@/lib/hopital/caisse';
import { DeconnexionPatient } from '@/components/espace/DeconnexionPatient';
import { PayerFacture } from '@/components/espace/PayerFacture';
import { referenceFacture } from '@/lib/paiement/tentative';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Mon espace sante — SmartHealth' };

const JOUR = (v: string | null) => (v ? v.slice(0, 10) : '');

/**
 * Accueil de l'espace patient.
 *
 * Trois sections, dans l'ordre de ce qu'on vient y chercher : ce que je dois
 * payer, ce que je dois prendre, ou je suis passe. Pas de tableau de bord,
 * pas de graphique : quelqu'un qui ouvre cet ecran a une question precise.
 */
export default async function EspacePage() {
  const session = await requirePatient('/espace');

  const ordonnances = ordonnancesDe(session);
  const factures = facturesDe(session);
  const sejours = sejoursDe(session);

  // Une visite a distance est une visite qu'on n'a pas eu a faire. Comptee
  // une seule fois pour cette session, sans rien de nominatif.
  noterVisiteADistance(session);

  const duTotal = factures.reduce((n, f) => n + f.resteACharge, 0);

  return (
    <main className="mx-auto max-w-md px-4 py-6 pb-16">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Logo className="h-9 w-9 text-brand" />
          <div>
            <p className="text-[15px] font-bold leading-none">Mon espace sante</p>
            <p className="text-[11px] text-ink-soft">
              {session.dossiers.length} dossier{session.dossiers.length > 1 ? 's' : ''} rattache
              {session.dossiers.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <DeconnexionPatient />
      </header>

      {duTotal > 0 && (
        <section className="card-pad mb-4 border-l-4 border-warn">
          <p className="text-sm text-ink-soft">Reste a payer</p>
          <p className="text-2xl font-bold">{francs(duTotal)}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Reglable a la caisse de votre centre. Presentez le numero de la facture.
          </p>
        </section>
      )}

      <section className="mb-6">
        <h2 className="section-title mb-2">Mes ordonnances</h2>
        {ordonnances.length === 0 ? (
          <p className="card-pad text-sm text-ink-soft">
            Aucune ordonnance validee pour le moment. Une ordonnance n apparait ici qu une fois
            signee par le praticien.
          </p>
        ) : (
          <ul className="space-y-3">
            {ordonnances.map((o) => (
              <li key={o.id} className={`card-pad ${o.annulee ? 'opacity-70' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {JOUR(o.prescriteLe)}
                      {o.prescripteur ? ` — ${o.prescripteur}` : ''}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {o.lignes.length} medicament{o.lignes.length > 1 ? 's' : ''}
                    </p>
                  </div>
                  {o.annulee && (
                    <span className="chip bg-danger-soft text-danger">Annulee</span>
                  )}
                </div>

                <ul className="mt-3 space-y-2">
                  {o.lignes.map((l, i) => (
                    <li key={i} className={`text-sm ${o.annulee ? 'line-through' : ''}`}>
                      <b>{l.medicament}</b>
                      {l.dosage ? ` ${l.dosage}` : ''}
                      {l.posologie ? <span className="text-ink-soft"> — {l.posologie}</span> : null}
                      {l.dureeJours ? (
                        <span className="text-ink-soft"> pendant {l.dureeJours} jours</span>
                      ) : null}
                    </li>
                  ))}
                </ul>

                {o.annulee ? (
                  <p className="mt-3 rounded-lg bg-danger-soft p-2 text-xs leading-relaxed text-danger">
                    Cette ordonnance a ete annulee. Ne la presentez pas en pharmacie, meme si vous
                    en avez garde une photo.
                  </p>
                ) : o.qr ? (
                  <p className="mt-3 break-all rounded-lg bg-paper p-2 font-mono text-[11px] text-ink-soft">
                    Code pharmacie : {o.qr}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <h2 className="section-title mb-2">Mes factures</h2>
        {factures.length === 0 ? (
          <p className="card-pad text-sm text-ink-soft">Aucune facture.</p>
        ) : (
          <ul className="space-y-3">
            {factures.map((f) => (
              <li key={f.id} className="card-pad">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-xs text-ink-soft">{referenceFacture(f.id)}</p>
                  {f.soldee ? (
                    <span className="chip">Soldee</span>
                  ) : (
                    <span className="chip bg-warn-soft text-warn">{francs(f.resteACharge)}</span>
                  )}
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {f.lignes.map((l, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {l.libelle}
                        {l.quantite > 1 ? ` x${l.quantite}` : ''}
                      </span>
                      <span className="shrink-0 tabular-nums">{francs(l.montant * l.quantite)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex justify-between border-t border-line pt-2 text-sm">
                  <span className="text-ink-soft">Total</span>
                  <span className="font-semibold tabular-nums">{francs(f.total)}</span>
                </div>
                {f.partTiers > 0 && (
                  <div className="flex justify-between text-sm text-ink-soft">
                    <span>Pris en charge</span>
                    <span className="tabular-nums">{francs(f.partTiers)}</span>
                  </div>
                )}
                <PayerFacture factureId={f.id} resteACharge={f.resteACharge} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <h2 className="section-title mb-2">Mes passages</h2>
        {sejours.length === 0 ? (
          <p className="card-pad text-sm text-ink-soft">Aucun passage enregistre.</p>
        ) : (
          <ul className="space-y-2">
            {sejours.map((s) => (
              <li key={s.id} className="card-pad flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{JOUR(s.entreeLe)}</p>
                  {s.motif && <p className="truncate text-xs text-ink-soft">{s.motif}</p>}
                </div>
                {s.enCours ? (
                  <span className="chip bg-brand-soft text-brand">En cours</span>
                ) : (
                  <span className="text-xs text-ink-soft">{JOUR(s.sortieLe)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs leading-relaxed text-ink-soft">
        Vous ne voyez ici que ce qu un soignant a valide. Les resultats d examen et les comptes
        rendus ne s y trouvent pas : ils se lisent avec la personne qui vous suit.{' '}
        <Link href="/espace/connexion" className="underline">
          Aide
        </Link>
      </p>
    </main>
  );
}
