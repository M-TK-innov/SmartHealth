'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * Acquittement d'une valeur critique.
 *
 * Le champ est VIDE et obligatoire : il demande qui a ete joint. Un bouton
 * « Transmis » sans nom coche une case et ne transmet rien — c'est
 * exactement ce qu'on retrouve dans les dossiers apres un accident.
 *
 * Il n'y a pas de liste deroulante de soignants non plus : choisir un nom
 * dans une liste se fait sans avoir decroche le telephone.
 */
export function AcquitterCritique({
  demandeId,
  resultatId,
  peutAcquitter,
}: {
  demandeId: string;
  resultatId: string;
  peutAcquitter: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  if (!peutAcquitter) {
    return (
      <p className="shrink-0 text-xs text-ink-soft">
        Acquittement reserve au soignant qui recoit la valeur.
      </p>
    );
  }

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    const r = await fetch(`/api/hopital/examens/${demandeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'acquittement', resultatId, transmisA: nom }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setErreur(data.remede ?? data.error ?? 'Acquittement impossible.');
      return;
    }
    setNom('');
    demarrer(() => router.refresh());
  }

  return (
    <form onSubmit={envoyer} className="flex shrink-0 flex-wrap items-center gap-2">
      <input
        className="input w-56"
        placeholder="Nom du soignant joint"
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        required
        aria-label="Nom du soignant joint"
      />
      <button className="btn-primary btn-sm" disabled={enCours}>
        {enCours ? '...' : 'Acquitter'}
      </button>
      {erreur && <p className="w-full text-xs text-danger">{erreur}</p>}
    </form>
  );
}
