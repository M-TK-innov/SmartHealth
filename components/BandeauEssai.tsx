import Link from 'next/link';
import { MODE_ESSAI, etatEssaiCourant } from '@/lib/essai-store';
import { messageRestant } from '@/lib/essai';

/**
 * Bandeau de periode d'essai.
 *
 * Il ne crie qu'au bon moment. Un bandeau rouge pendant sept jours devient
 * du decor au troisieme ; celui-ci reste sobre tant qu'il reste du temps,
 * prend la couleur d'alerte le dernier jour, et devient un refus apres.
 *
 * Il dit toujours la DATE DE FIN, pas seulement un nombre de jours. « Trois
 * jours restants » se compte mal un vendredi soir ; une date se note dans un
 * agenda.
 *
 * Comme celui de la demonstration, il n'est pas refermable : un bandeau qu'on
 * peut faire disparaitre finit toujours par l'etre, et c'est la session
 * suivante qui ne saura plus de quoi il s'agit.
 */
export function BandeauEssai() {
  if (!MODE_ESSAI) return null;

  const etat = etatEssaiCourant();
  if (!etat) return null;

  const urgent = etat.phase === 'expire' || etat.joursRestants <= 1;
  const teinte = urgent
    ? 'border-danger bg-danger-soft text-danger'
    : 'border-line bg-brand-soft text-ink-soft';

  return (
    <div className={`no-print border-b px-4 py-2 text-center text-xs sm:px-6 ${teinte}`}>
      <b>{etat.phase === 'expire' ? 'Essai termine.' : "Version d'essai."}</b>{' '}
      {messageRestant(etat)}{' '}
      <Link href="/essai-termine" className="underline">
        Ce qui reste possible
      </Link>
      {etat.horlogeReculee && (
        <>
          {' '}
          <span className="font-semibold">
            L&apos;horloge de ce poste est en retard sur la derniere date observee ; c&apos;est
            cette derniere qui fait foi.
          </span>
        </>
      )}
    </div>
  );
}
