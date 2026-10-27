import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/session';
import { getPolicy } from '@/lib/auth/store';
import { needsBootstrap } from '@/lib/auth/bootstrap';
import { LoginForm } from '@/components/auth/LoginForm';
import { AuthShell } from '@/components/auth/AuthShell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Connexion — SmartHealth' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ suite?: string }> }) {
  const { suite } = await searchParams;
  if (await auth()) redirect(suite || '/');

  // Base vierge : une page de connexion sans aucun compte est une impasse.
  if (needsBootstrap()) redirect('/bienvenue');

  const policy = getPolicy();

  return (
    <AuthShell
      title="Connexion"
      subtitle="Accedez a votre espace SmartHealth."
      aside={
        <>
          <p className="text-sm leading-relaxed text-white/85">
            Chaque connexion est horodatee et inscrite au journal d audit : dans un dossier medical, savoir qui a
            consulte quoi fait partie du soin.
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-white/75">
            <li>Session de {policy.session_hours} h, revocable a tout moment</li>
            <li>Verrouillage apres {policy.max_failed_attempts} tentatives</li>
            <li>Mots de passe haches (scrypt), jamais stockes en clair</li>
          </ul>
        </>
      }
    >
      <LoginForm redirectTo={suite || '/'} />

      {policy.allow_self_registration === 1 && (
        <p className="mt-5 text-center text-sm text-ink-soft">
          Pas encore de compte ?{' '}
          <Link href="/inscription" className="font-medium text-brand-dark hover:underline">
            Demander un acces
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
