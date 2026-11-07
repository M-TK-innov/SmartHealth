import { requireAuth } from '@/lib/auth/guard';
import { ROLE_LABELS, ORG_TYPE_LABELS, PERMISSIONS, type Permission } from '@/lib/auth/roles';
import { PasswordForm } from '@/components/auth/PasswordForm';
import { formatDate } from '@/lib/report';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mon compte — SmartHealth' };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ motdepasse?: string }> }) {
  const { motdepasse } = await searchParams;
  const ctx = await requireAuth('/compte');
  const forced = motdepasse === '1' || ctx.user.must_change_password === 1;
  const permissions = [...ctx.permissions].sort();

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="card-pad">
        <h1 className="text-xl font-bold">{ctx.user.full_name}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {ctx.user.email} · {ROLE_LABELS[ctx.user.role]}
          {ctx.organization ? ` · ${ctx.organization.name} (${ORG_TYPE_LABELS[ctx.organization.type]})` : ''}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <span className="chip bg-ok-soft text-ok">compte {ctx.user.status}</span>
          <span className="chip bg-paper text-ink-soft">portee des donnees : {ctx.scope}</span>
          {ctx.user.last_login_at && (
            <span className="chip bg-paper text-ink-soft">
              derniere connexion {formatDate(ctx.user.last_login_at)}
            </span>
          )}
        </div>
      </header>

      {forced && (
        <div className="rounded-xl border border-warn bg-warn-soft p-4 text-sm">
          <strong>Changement de mot de passe requis.</strong> Votre mot de passe a ete genere par un administrateur.
          Remplacez-le maintenant : tant qu il est en place, quelqu un d autre en connait la valeur.
        </div>
      )}

      <section className="card-pad">
        <h2 className="section-title mb-3">Changer mon mot de passe</h2>
        <PasswordForm />
      </section>

      <section className="card-pad">
        <h2 className="section-title mb-1">Mes droits</h2>
        <p className="mb-3 text-xs text-ink-soft">
          Droits effectifs : ceux de votre role, corriges des derogations accordees a votre compte.
        </p>
        {permissions.length === 0 ? (
          <p className="text-sm text-ink-soft">Aucun droit actif.</p>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {permissions.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm">
                <span aria-hidden className="mt-0.5 text-ok">✓</span>
                <span>
                  {PERMISSIONS[p as Permission]}
                  <code className="ml-1 text-[10px] text-ink-soft">{p}</code>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
