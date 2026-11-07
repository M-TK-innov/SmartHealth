import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { BootstrapWizard } from '@/components/auth/BootstrapWizard';
import { currentPort, needsBootstrap, networkAddresses } from '@/lib/auth/bootstrap';
import { passwordPolicy } from '@/lib/auth/store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Premiere installation — SmartHealth' };

export default async function BootstrapPage() {
  // Installation deja amorcee : cet ecran n'a plus lieu d'etre, et le laisser
  // accessible laisserait croire qu'on peut y creer un compte.
  if (!needsBootstrap()) redirect('/connexion');

  return (
    <AuthShell
      wide
      title="Premiere installation"
      subtitle="Aucun compte n'existe encore. Creons celui du responsable."
      aside={
        <>
          <p className="text-sm leading-relaxed text-white/85">
            Cet ecran n&apos;apparait qu&apos;une fois, sur une base vierge. Des qu&apos;un compte existe, il se
            ferme definitivement : creer un super-administrateur sans etre authentifie ne doit jamais rester
            possible sur une installation en service.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-white/75">
            Les comptes suivants — medecins, etablissements, ministere — se creent depuis la console
            d&apos;administration, par un compte qui detient deja ce niveau.
          </p>
        </>
      }
    >
      <BootstrapWizard minLength={passwordPolicy().minLength} initialAddresses={networkAddresses(currentPort())} />
    </AuthShell>
  );
}
