'use client';

import { useEffect, useState } from 'react';

/**
 * Diagnostic du poste, affiche avant la creation du premier compte.
 *
 * Il se place AVANT le formulaire, et non apres : un responsable qui decouvre
 * apres vingt minutes de saisie que le disque est plein a perdu vingt minutes,
 * et surtout la confiance dans l'outil.
 *
 * Le ton suit la meme regle que les restrictions sanitaires : on dit ce qui
 * est empeche, pas ce qui manque. « Node 20 » n'apprend rien a un responsable
 * de centre de sante ; « l'application ne demarrera pas » se comprend.
 */

interface Constat {
  code: string;
  niveau: 'bloquant' | 'limitant' | 'remarque';
  titre: string;
  detail: string;
  remede: string;
}

interface Diagnostic {
  constats: Constat[];
  bilan: { bloquants: number; limitants: number; remarques: number; utilisable: boolean };
  releve: { plateforme: string; nodeMajeur: number; memoireMo: number; disqueLibreMo: number | null };
}

const ALLURE = {
  bloquant: { cadre: 'border-danger bg-danger-soft', puce: 'bg-danger text-white', mot: 'Bloquant' },
  limitant: { cadre: 'border-warn bg-warn-soft', puce: 'bg-warn text-white', mot: 'Capacite en moins' },
  remarque: { cadre: 'border-line bg-paper', puce: 'bg-ink-soft text-white', mot: 'Information' },
} as const;

const PLATEFORMES: Record<string, string> = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
};

export function Prerequis({ onEtat }: { onEtat?: (utilisable: boolean) => void }) {
  const [diag, setDiag] = useState<Diagnostic | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    let vivant = true;
    fetch('/api/prerequis')
      .then((r) => r.json())
      .then((d: Diagnostic) => {
        if (!vivant) return;
        setDiag(d);
        // Les constats bloquants sont ouverts d'office : on ne demande pas au
        // responsable de cliquer pour apprendre que rien ne marchera.
        setOuvert(!d.bilan.utilisable);
        onEtat?.(d.bilan.utilisable);
      })
      .catch(() => vivant && setErreur('Diagnostic indisponible.'));
    return () => {
      vivant = false;
    };
  }, [onEtat]);

  if (erreur) {
    return (
      <div className="rounded-lg border border-line bg-paper p-3 text-sm text-ink-soft">
        {erreur} L installation peut se poursuivre : cette verification est une aide, pas une condition.
      </div>
    );
  }

  if (!diag) {
    return (
      <div className="rounded-lg border border-line bg-paper p-3 text-sm text-ink-soft">
        Verification du poste en cours...
      </div>
    );
  }

  const { bilan, constats, releve } = diag;
  const aDire = constats.length > 0;

  return (
    <section className="mb-5">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left ${
          bilan.utilisable ? 'border-line bg-paper' : 'border-danger bg-danger-soft'
        }`}
        aria-expanded={ouvert}
      >
        <span>
          <strong className="text-sm">
            {bilan.utilisable ? 'Ce poste peut faire tourner SmartHealth' : 'Ce poste ne peut pas encore faire tourner SmartHealth'}
          </strong>
          <span className="mt-0.5 block text-xs text-ink-soft">
            {PLATEFORMES[releve.plateforme] ?? releve.plateforme} · {Math.round(releve.memoireMo / 1024)} Go de memoire
            {releve.disqueLibreMo !== null && ` · ${Math.round(releve.disqueLibreMo / 1024)} Go libres`}
            {bilan.bloquants > 0 && ` · ${bilan.bloquants} point${bilan.bloquants > 1 ? 's' : ''} bloquant${bilan.bloquants > 1 ? 's' : ''}`}
            {bilan.limitants > 0 && ` · ${bilan.limitants} capacite${bilan.limitants > 1 ? 's' : ''} en moins`}
            {!aDire && ' · rien a signaler'}
          </span>
        </span>
        {aDire && <span className="shrink-0 text-xs text-ink-soft">{ouvert ? 'Masquer' : 'Voir le detail'}</span>}
      </button>

      {ouvert && aDire && (
        <ul className="mt-2 space-y-2">
          {constats.map((c) => {
            const a = ALLURE[c.niveau];
            return (
              <li key={c.code} className={`rounded-lg border p-3 ${a.cadre}`}>
                <div className="flex items-start justify-between gap-2">
                  <strong className="text-sm">{c.titre}</strong>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${a.puce}`}>
                    {a.mot}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{c.detail}</p>
                <p className="mt-1.5 text-xs leading-relaxed">
                  <span className="font-medium">A faire :</span> {c.remede}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {!bilan.utilisable && (
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          Vous pouvez tout de meme creer le compte, mais l application ne fonctionnera pas tant que les points
          bloquants ne sont pas leves. Rien n est perdu : le compte restera valable.
        </p>
      )}
    </section>
  );
}
