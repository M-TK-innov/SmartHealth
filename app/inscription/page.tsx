import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/session';
import { getPolicy } from '@/lib/auth/store';
import { AuthShell } from '@/components/auth/AuthShell';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Demande d acces — ParleDocteur' };

export default async function RegisterPage() {
  if (await auth()) redirect('/');
  const policy = getPolicy();

  if (policy.allow_self_registration !== 1) {
    return (
      <AuthShell title="Inscription fermee" subtitle="Les comptes sont crees par un administrateur.">
        <p className="text-sm leading-relaxed text-ink-soft">
          L inscription libre est desactivee sur cette instance. Adressez-vous a l administrateur de votre
          etablissement pour obtenir un acces.
        </p>
        <Link href="/connexion" className="btn-primary mt-4">
          Retour a la connexion
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      wide
      title="Demande d acces"
      subtitle="Creez votre compte. Il sera actif apres validation."
      aside={
        <>
          <p className="text-sm leading-relaxed text-white/85">
            Qui valide qui, sur cette plateforme :
          </p>
          <ul className="mt-3 space-y-2 text-sm text-white/75">
            <li><strong className="text-white">Medecin</strong> : valide par son etablissement</li>
            <li><strong className="text-white">Etablissement</strong> : valide par un administrateur plateforme</li>
            <li><strong className="text-white">Ministere</strong> : valide par un administrateur plateforme</li>
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-white/70">
            Les roles d administration ne sont pas ouverts a l inscription : ils sont attribues depuis la console,
            par un compte qui detient deja ce niveau.
          </p>
        </>
      }
    >
      <RegisterForm minLength={policy.password_min_length} />

      <p className="mt-5 text-center text-sm text-ink-soft">
        Deja un compte ?{' '}
        <Link href="/connexion" className="font-medium text-brand-dark hover:underline">
          Se connecter
        </Link>
      </p>
    </AuthShell>
  );
}
