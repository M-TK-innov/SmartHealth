import Link from 'next/link';
import { auth } from '@/lib/auth/session';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { PERMISSIONS } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Acces refuse — ParleDocteur' };

export default async function AccessDeniedPage({ searchParams }: { searchParams: Promise<{ droit?: string }> }) {
  const { droit } = await searchParams;
  const ctx = await auth();
  const required = (droit ?? '').split(',').filter(Boolean);

  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-warn-soft text-3xl text-warn">
        &#9673;
      </div>
      <h1 className="mt-5 text-xl font-bold">Acces refuse</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Votre compte n a pas les droits necessaires pour cette page. Ce n est pas une erreur : le cloisonnement des
        acces fait partie de la protection des dossiers medicaux.
      </p>

      <div className="mt-5 rounded-xl border border-line bg-white p-4 text-left text-sm">
        {ctx && (
          <p>
            Connecte en tant que <strong>{ctx.user.full_name}</strong> — {ROLE_LABELS[ctx.user.role]}
            {ctx.organization ? ` · ${ctx.organization.name}` : ''}
          </p>
        )}
        {required.length > 0 && (
          <>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Droit requis</p>
            <ul className="mt-1 space-y-1">
              {required.map((r) => (
                <li key={r}>
                  <code className="text-[11px]">{r}</code>
                  {PERMISSIONS[r as keyof typeof PERMISSIONS] ? ` — ${PERMISSIONS[r as keyof typeof PERMISSIONS]}` : ''}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-3 text-xs text-ink-soft">
          Demandez ce droit a un administrateur : il peut vous l accorder individuellement depuis la console.
        </p>
      </div>

      <div className="mt-5 flex justify-center gap-2">
        <Link href="/" className="btn-primary">Tableau de bord</Link>
        <Link href="/compte" className="btn-ghost">Mon compte</Link>
      </div>
    </div>
  );
}
