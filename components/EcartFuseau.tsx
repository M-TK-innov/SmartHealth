'use client';

import { useEffect, useState } from 'react';
import { remarquerEcart, type RemarqueFuseau } from '@/lib/localisation';

/**
 * Signale un poste regle sur un autre fuseau que l'etablissement.
 *
 * POURQUOI SIGNALER PLUTOT QUE CORRIGER : parce que basculer sur le
 * fuseau du navigateur ferait voir a deux agents du meme service deux
 * journees differentes — l'un la file d'hier, l'autre celle
 * d'aujourd'hui. L'etablissement a UNE journee, et l'application s'y
 * tient. Mais un poste mal regle affiche tout de meme une horloge fausse
 * a cote de l'ecran, et le soignant compare les deux sans savoir laquelle
 * croire.
 *
 * Le calcul se fait ICI, dans le navigateur, parce que c'est le seul
 * endroit qui connaisse le reglage du poste. Rien n'est envoye au
 * serveur : ce n'est pas une donnee a collecter, c'est une remarque a
 * afficher a celui qui est devant.
 */
export function EcartFuseau({ fuseau }: { fuseau: string }) {
  // On ne rend rien au premier passage : le fuseau du poste n'est connu
  // que dans le navigateur, et un rendu serveur qui le devinerait
  // afficherait une remarque fausse le temps d'un eclair.
  const [remarque, setRemarque] = useState<RemarqueFuseau | null>(null);

  useEffect(() => {
    try {
      const poste = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setRemarque(remarquerEcart(fuseau, poste));
    } catch {
      // Un navigateur qui ne sait pas dire son fuseau ne merite pas
      // d'alerte : on ne reproche pas a quelqu'un de se taire.
      setRemarque(null);
    }
  }, [fuseau]);

  if (!remarque) return null;

  const grave = remarque.niveau === 'limitant';

  return (
    <div
      role="status"
      className={`no-print border-b px-4 py-2 text-xs sm:px-6 ${
        grave ? 'border-danger bg-danger-soft text-danger' : 'border-warn bg-warn-soft text-warn'
      }`}
    >
      <b>{remarque.message}</b> {remarque.remede}
    </div>
  );
}
