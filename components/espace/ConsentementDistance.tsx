'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * L'accord du patient pour une consultation a distance.
 *
 * CE QUI EST DIT AVANT D'ACCEPTER. Un bouton « J'accepte » seul ne vaut pas
 * un consentement : il faut savoir a quoi l'on consent. L'ecran enonce donc
 * les trois points qui changent quelque chose pour le patient — qui le verra,
 * ce qui est conserve, et qu'il peut refuser sans perdre son rendez-vous.
 *
 * LE REFUS N'EST PAS UNE IMPASSE. Quelqu'un qui n'a pas de reseau, pas de
 * camera, ou simplement pas envie d'etre filme garde son creneau : il le dit
 * a son centre, qui le bascule sur place. Presenter la consultation a
 * distance comme la seule option transformerait le consentement en formalite.
 */
export function ConsentementDistance({ rendezVousId }: { rendezVousId: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function accepter() {
    setEnvoi(true);
    setErreur(null);
    const r = await fetch(`/api/espace/rendez-vous/${rendezVousId}`, { method: 'POST' }).catch(
      () => null,
    );
    setEnvoi(false);
    if (!r || !r.ok) {
      const m = r ? await r.json().catch(() => null) : null;
      setErreur(m?.error ?? 'Votre accord n a pas pu etre enregistre. Reessayez.');
      return;
    }
    router.refresh();
  }

  if (!ouvert) {
    return (
      <div className="mt-2 rounded-lg bg-paper p-2">
        <p className="text-xs leading-relaxed text-ink-soft">
          Consultation a distance. Votre accord est necessaire avant de commencer.
        </p>
        <button type="button" onClick={() => setOuvert(true)} className="btn-primary btn-sm mt-2">
          Donner mon accord
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg bg-paper p-3">
      <p className="text-sm font-semibold">Consultation a distance</p>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-soft">
        <li>
          <b>Qui vous verra.</b> Le praticien de ce rendez-vous, et personne d autre. L image et le
          son passent directement entre vos deux appareils.
        </li>
        <li>
          <b>Ce qui est conserve.</b> Le compte rendu de la consultation, comme pour une visite au
          cabinet. <b>Ni l image ni le son ne sont enregistres.</b>
        </li>
        <li>
          <b>Vous pouvez refuser.</b> Votre rendez-vous ne sera pas annule : appelez votre centre,
          il vous recevra sur place.
        </li>
      </ul>

      {erreur && <p className="mt-2 text-xs text-danger">{erreur}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={accepter} disabled={envoi} className="btn-primary btn-sm">
          {envoi ? 'Enregistrement...' : 'J accepte'}
        </button>
        <button type="button" onClick={() => setOuvert(false)} className="btn-ghost btn-sm">
          Pas maintenant
        </button>
      </div>
    </div>
  );
}
