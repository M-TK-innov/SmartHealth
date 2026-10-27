'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Intervention, PointChecklist, TempsChecklist } from '@/lib/hopital/bloc';

/**
 * Checklist de securite au bloc, en trois temps.
 *
 * Le bouton d'incision est DESACTIVE tant que le time out n'est pas
 * complet, et le serveur refuse de toute facon. Les deux, et dans cet
 * ordre : l'ecran evite de proposer un geste qui sera refuse, le serveur
 * garantit qu'il ne passe pas par un autre chemin.
 *
 * Il n'y a pas de bouton « tout cocher ». Une checklist qui se coche d'un
 * geste ne verifie rien ; c'est le propre de celles qu'on remplit apres
 * coup.
 */

const TEMPS: { cle: TempsChecklist; titre: string; apres: string }[] = [
  { cle: 'avant-induction', titre: 'Avant induction', apres: 'entree' },
  { cle: 'avant-incision', titre: 'Avant incision — time out', apres: 'incision' },
  { cle: 'avant-sortie', titre: 'Avant sortie de salle', apres: 'sortie' },
];

const ACTION: Record<string, { libelle: string; etatRequis: Intervention['etat'] }> = {
  entree: { libelle: 'Enregistrer l entree au bloc', etatRequis: 'programmee' },
  incision: { libelle: 'Inciser', etatRequis: 'patient-au-bloc' },
  sortie: { libelle: 'Sortie de salle', etatRequis: 'en-cours' },
};

export function ChecklistBloc({
  intervention,
  points,
  coches,
  peutAgir,
}: {
  intervention: Intervention;
  points: PointChecklist[];
  coches: string[];
  peutAgir: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [refus, setRefus] = useState<{ message: string; remede: string } | null>(null);
  const faits = new Set(coches);

  async function envoyer(corps: Record<string, unknown>) {
    setRefus(null);
    const r = await fetch(`/api/hopital/bloc/interventions/${intervention.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setRefus({
        message: data.error ?? 'Action impossible.',
        remede: data.remede ?? 'L etat de l intervention a peut-etre change.',
      });
    }
    demarrer(() => router.refresh());
  }

  return (
    <div className="grid gap-4">
      {refus && (
        <div className="rounded-xl border border-danger bg-danger-soft px-5 py-3">
          <p className="text-sm font-semibold text-danger">{refus.message}</p>
          <p className="mt-0.5 text-sm">{refus.remede}</p>
        </div>
      )}

      {TEMPS.map(({ cle, titre, apres }) => {
        const duTemps = points.filter((p) => p.temps === cle);
        const restants = duTemps.filter((p) => !faits.has(p.cle));
        const action = ACTION[apres];
        const bonEtat = intervention.etat === action.etatRequis;

        return (
          <section key={cle} className="card">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
              <h2 className="text-base font-bold">{titre}</h2>
              <span
                className={`text-xs font-semibold ${restants.length === 0 ? 'text-ok' : 'text-ink-soft'}`}
              >
                {duTemps.length - restants.length} / {duTemps.length}
              </span>
            </header>

            <ul className="divide-y divide-line">
              {duTemps.map((p) => {
                const fait = faits.has(p.cle);
                return (
                  <li key={p.cle} className="flex items-start gap-3 px-5 py-2.5">
                    <input
                      type="checkbox"
                      id={`pt-${p.cle}`}
                      checked={fait}
                      disabled={!peutAgir || enCours}
                      onChange={() =>
                        envoyer({ type: fait ? 'decocher' : 'cocher', point: p.cle })
                      }
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <label
                      htmlFor={`pt-${p.cle}`}
                      className={`text-sm ${fait ? 'text-ink-soft line-through' : ''}`}
                    >
                      {p.libelle}
                    </label>
                  </li>
                );
              })}
            </ul>

            {peutAgir && (
              <div className="border-t border-line px-5 py-3">
                <button
                  className={apres === 'incision' ? 'btn-danger' : 'btn-primary'}
                  disabled={enCours || restants.length > 0 || !bonEtat}
                  onClick={() => envoyer({ type: apres })}
                >
                  {action.libelle}
                </button>
                {restants.length > 0 && bonEtat && (
                  <p className="mt-2 text-xs text-ink-soft">
                    {restants.length} point{restants.length > 1 ? 's' : ''} a verifier avant :{' '}
                    {restants.map((p) => p.libelle).join(' ; ')}.
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
