import Link from 'next/link';
import Logo from '@/components/Logo';

export const metadata = { title: 'Hors ligne — SmartHealth' };

/**
 * Page de repli servie par le service worker quand une navigation echoue.
 * Elle doit rassurer sans mentir : rien n'est perdu, mais rien n'est consultable
 * non plus tant que le serveur n'est pas joignable.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <Logo className="mx-auto h-16 w-16 text-warn" />
      <h1 className="mt-5 text-xl font-bold">Vous êtes hors ligne</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Le serveur SmartHealth n est pas joignable. Le dossier médical n est pas consultable tant que la connexion
        n est pas rétablie — nous préférons ne rien afficher plutôt qu une version périmée d un dossier.
      </p>
      <div className="mt-5 rounded-xl border border-line bg-white p-4 text-left">
        <p className="text-sm font-semibold">Une consultation était en cours ?</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          Revenez sur son onglet : la transcription continue d être capturée dans le navigateur et repart vers le
          serveur dès le retour du réseau. Ne fermez pas l onglet.
        </p>
      </div>
      <div className="mt-5 flex justify-center gap-2">
        <Link href="/" className="btn-primary">
          Réessayer
        </Link>
      </div>
    </div>
  );
}
