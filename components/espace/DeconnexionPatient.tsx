'use client';

import { useRouter } from 'next/navigation';

/**
 * Deconnexion de l'espace patient.
 *
 * Elle revoque la ligne de session, pas seulement le cookie : sur un
 * telephone partage ou prete, effacer le cookie du navigateur ne suffit pas
 * si le jeton a ete recopie ailleurs.
 */
export function DeconnexionPatient() {
  const router = useRouter();

  async function sortir() {
    await fetch('/api/espace/deconnexion', { method: 'POST' });
    router.push('/espace/connexion');
    router.refresh();
  }

  return (
    <button type="button" onClick={sortir} className="btn-ghost btn-sm shrink-0">
      Quitter
    </button>
  );
}
