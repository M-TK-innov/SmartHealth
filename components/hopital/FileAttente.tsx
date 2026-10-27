'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { PassageClasse } from '@/lib/hopital/flux';

/**
 * La file d'un poste, et les trois gestes qu'on y fait.
 *
 * « Parti sans etre vu » est un bouton a part entiere, et pas un repli de
 * « Terminer ». Un agent presse enregistre ce qui est a portee de main : si
 * le depart n'a pas son bouton, il devient un passage termine, et la
 * saturation disparait des tableaux au moment ou elle est la plus forte.
 *
 * Le refus du serveur s'affiche AVEC son remede. Un message qui dit seulement
 * « impossible » renvoie l'agent vers le telephone de l'informatique.
 */

const COULEUR: Record<string, string> = {
  vitale: 'bg-danger text-white',
  urgente: 'bg-warn-soft text-warn',
  standard: 'bg-brand-soft text-brand-dark',
  differable: 'bg-paper text-ink-soft',
};

export function FileAttente({
  posteId,
  posteNom,
  file,
  enCoursDeSoin,
  nomParSejour,
}: {
  posteId: string;
  posteNom: string;
  file: PassageClasse[];
  /** Patients deja appeles : sans eux, un passage appele ne pourrait plus etre clos. */
  enCoursDeSoin: { id: string; sejourId: string; gravite: string }[];
  nomParSejour: Record<string, string>;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [refus, setRefus] = useState<{ message: string; remede: string } | null>(null);

  async function agir(passageId: string, action: 'appel' | 'fin' | 'parti') {
    setRefus(null);
    const r = await fetch(`/api/hopital/passages/${passageId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setRefus({
        message: data.error ?? 'Action impossible.',
        remede: data.remede ?? 'Un autre poste a peut-etre agi entre-temps.',
      });
      // On resynchronise MEME sur un refus. Un refus signifie presque
      // toujours que l'etat a bouge ailleurs ; laisser la ligne perimee a
      // l'ecran avec son bouton invite a recliquer, et l'agent a l'impression
      // que l'application ne repond pas.
      demarrer(() => router.refresh());
      return;
    }
    demarrer(() => router.refresh());
  }

  return (
    <section className="card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div>
          <h1 className="text-lg font-bold">{posteNom}</h1>
          <p className="text-xs text-ink-soft">
            {file.length} patient{file.length > 1 ? 's' : ''} en attente · ordre par gravite, puis
            par anciennete
          </p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => demarrer(() => router.refresh())} disabled={enCours}>
          {enCours ? 'Actualisation...' : 'Actualiser'}
        </button>
      </header>

      {refus && (
        <div className="border-b border-danger bg-danger-soft px-5 py-3">
          <p className="text-sm font-semibold text-danger">{refus.message}</p>
          <p className="mt-0.5 text-sm">{refus.remede}</p>
        </div>
      )}

      {file.length === 0 ? (
        <p className="p-5 text-sm text-ink-soft">Personne n attend a ce poste.</p>
      ) : (
        <ol className="divide-y divide-line">
          {file.map((p, rang) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-paper text-sm font-bold">
                {rang + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">
                    {nomParSejour[p.sejourId] ?? 'Patient'}
                  </span>
                  <span className={`chip ${COULEUR[p.gravite] ?? ''}`}>{p.gravite}</span>
                  {p.remonte && (
                    <span
                      className="chip bg-warn-soft text-warn"
                      title="Remonte d un cran apres une longue attente — jamais au-dessus d un cas plus grave"
                    >
                      remonte
                    </span>
                  )}
                </div>
                <p className={`text-xs ${p.attenteMinutes >= 90 ? 'font-semibold text-danger' : 'text-ink-soft'}`}>
                  attend depuis {p.attenteMinutes} min
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button className="btn-primary btn-sm" onClick={() => agir(p.id, 'appel')}>
                  Appeler
                </button>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => agir(p.id, 'parti')}
                  title="Le patient a quitte la file sans etre vu"
                >
                  Parti
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {enCoursDeSoin.length > 0 && (
        <div className="border-t border-line">
          <h2 className="px-5 pt-3 text-sm font-semibold">En cours de prise en charge</h2>
          <ul className="divide-y divide-line">
            {enCoursDeSoin.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                  <span className="truncate">{nomParSejour[p.sejourId] ?? 'Patient'}</span>
                  <span className={`chip shrink-0 ${COULEUR[p.gravite] ?? ''}`}>{p.gravite}</span>
                </span>
                <button className="btn-ghost btn-sm shrink-0" onClick={() => agir(p.id, 'fin')}>
                  Terminer
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="border-t border-line px-5 py-2 text-[11px] text-ink-soft">
        Poste {posteId.slice(0, 8)} · une urgence vitale ne passe jamais derriere un cas moins
        grave, meme apres une tres longue attente du second.
      </p>
    </section>
  );
}
