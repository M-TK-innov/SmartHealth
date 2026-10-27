import Link from 'next/link';
import { MODE_DEMO } from '@/lib/db';

/**
 * Bandeau de mode demonstration.
 *
 * Il dit DEUX choses, et les deux comptent :
 *
 *   - ce qu'on saisit ne sera pas conserve. Un visiteur qui enregistre une
 *     consultation et la retrouve disparue en conclut que l'application
 *     perd des donnees. C'est le contraire : elle n'en garde aucune ici,
 *     parce que la plateforme n'a pas de disque ;
 *   - aucune donnee reelle de patient ne doit y etre saisie. Une
 *     demonstration en ligne ressemble a l'application, et quelqu'un
 *     finira par y entrer un vrai dossier si personne ne l'en dissuade.
 *
 * Il n'est pas refermable. Un bandeau qu'on peut faire disparaitre finit
 * toujours par l'etre, et c'est precisement la session suivante qui
 * oubliera de quoi il s'agit.
 */
export function BandeauDemo() {
  if (!MODE_DEMO) return null;

  return (
    <div className="no-print border-b border-warn bg-warn-soft px-4 py-2 text-center text-xs text-warn sm:px-6">
      <b>Demonstration.</b> Les donnees sont fictives et remises a zero
      regulierement — n&apos;y saisissez aucune information reelle de patient.{' '}
      <Link href="/demo" className="underline">
        Parcours guide et comptes d&apos;essai
      </Link>
    </div>
  );
}
