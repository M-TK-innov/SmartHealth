import Logo from '@/components/Logo';
import { FormuleAcces } from '@/components/espace/FormuleAcces';
import { authPatient } from '@/lib/patient/session';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Mon espace sante — SmartHealth',
  description: 'Vos ordonnances, vos factures et vos sejours, sans vous deplacer.',
};

export default async function ConnexionPatientPage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>;
}) {
  // Deja connecte : on ne redemande pas un code a quelqu'un qui l'a donne.
  if (await authPatient()) redirect('/espace');
  const { suite } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <Logo className="mx-auto h-14 w-14 text-brand" />
        <h1 className="mt-4 text-xl font-bold">Mon espace sante</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Vos ordonnances, vos factures et vos sejours, sans vous deplacer.
        </p>
      </div>

      <div className="card-pad">
        <FormuleAcces suite={suite} />
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-ink-soft">
        Vous ne verrez ici que ce qu un soignant a valide. Les resultats d examen et les comptes
        rendus restent a discuter avec lui.
      </p>
    </main>
  );
}
