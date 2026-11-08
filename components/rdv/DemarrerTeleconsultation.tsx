'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Ouvre la salle, cote praticien.
 *
 * LE REFUS EST AFFICHE EN TOUTES LETTRES. Les regles peuvent refuser pour
 * trois raisons — le patient n'a pas donne son accord, l'heure n'est pas
 * venue, le rendez-vous est annule — et chacune appelle un geste different.
 * Un bouton qui ne reagit pas ferait appeler l'informatique ; un motif lisible
 * fait appeler le patient.
 */
export function DemarrerTeleconsultation({
  rendezVousId,
  libelle = 'Demarrer la consultation',
}: {
  rendezVousId: string;
  libelle?: string;
}) {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);

  async function demarrer() {
    setEnvoi(true);
    setRefus(null);
    const r = await fetch(`/api/rendez-vous/${rendezVousId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'demarrer' }),
    }).catch(() => null);
    setEnvoi(false);

    if (!r || !r.ok) {
      const m = r ? await r.json().catch(() => null) : null;
      setRefus(m?.error ?? 'La salle n a pas pu etre ouverte.');
      return;
    }
    router.push(`/rendez-vous/${rendezVousId}/salle`);
  }

  return (
    <div className="mt-2">
      <button type="button" onClick={demarrer} disabled={envoi} className="btn-primary btn-sm">
        {envoi ? 'Ouverture...' : libelle}
      </button>
      {refus && <p className="mt-2 text-xs leading-relaxed text-danger">{refus}</p>}
    </div>
  );
}
