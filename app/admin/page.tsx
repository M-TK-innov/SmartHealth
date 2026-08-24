import Link from 'next/link';
import { get } from '@/lib/db';
import { organizationFilter, requireAnyPermission } from '@/lib/auth/guard';
import { listOrganizations, listUsers } from '@/lib/auth/store';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { formatDate } from '@/lib/report';

export const dynamic = 'force-dynamic';

function Tile({
  value,
  label,
  hint,
  href,
  tone,
}: {
  value: number | string;
  label: string;
  hint?: string;
  href?: string;
  tone?: 'warn' | 'ok';
}) {
  const inner = (
    <div
      className={`card-pad h-full ${tone === 'warn' ? 'border-warn bg-warn-soft' : tone === 'ok' ? 'border-ok bg-ok-soft' : ''}`}
    >
      <div className="text-3xl font-bold text-brand-dark">{value}</div>
      <div className="mt-1 text-sm font-medium">{label}</div>
      {hint && <div className="text-xs text-ink-soft">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:opacity-90">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export default async function AdminOverview() {
  const ctx = await requireAnyPermission(['user:read', 'org:read'], '/admin');
  const scoped = organizationFilter(ctx);

  const pendingUsers = listUsers({ status: 'pending', organizationId: scoped ?? undefined });
  const activeUsers = listUsers({ status: 'active', organizationId: scoped ?? undefined });
  const organizations = ctx.can('org:read') ? listOrganizations() : [];
  const pendingOrgs = organizations.filter((o) => o.status === 'pending');

  const activeSessions =
    get<{ n: number }>(
      "SELECT COUNT(*) n FROM user_session WHERE revoked_at IS NULL AND expires_at > datetime('now')",
    )?.n ?? 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          value={pendingUsers.length}
          label="Comptes a valider"
          hint={pendingUsers.length ? 'en attente de votre decision' : 'rien a traiter'}
          href="/admin/comptes"
          tone={pendingUsers.length ? 'warn' : undefined}
        />
        <Tile value={activeUsers.length} label="Comptes actifs" href="/admin/comptes" />
        {ctx.can('org:read') && (
          <Tile
            value={pendingOrgs.length}
            label="Organisations a valider"
            hint={`${organizations.length} au total`}
            href="/admin/organisations"
            tone={pendingOrgs.length ? 'warn' : undefined}
          />
        )}
        <Tile value={activeSessions} label="Sessions ouvertes" href="/admin/acces" />
      </div>

      {pendingUsers.length > 0 && (
        <section className="card">
          <header className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="section-title">Demandes en attente</h2>
            <Link href="/admin/comptes" className="text-xs text-brand-dark hover:underline">
              Traiter
            </Link>
          </header>
          <ul className="divide-y divide-line">
            {pendingUsers.slice(0, 8).map((u) => (
              <li key={u.id} className="px-5 py-3">
                <p className="text-sm font-medium">{u.full_name}</p>
                <p className="text-xs text-ink-soft">
                  {u.email} · {ROLE_LABELS[u.role]} · demande du {formatDate(u.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card-pad">
        <h2 className="section-title mb-2">Comment les acces sont organises</h2>
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-lg border border-line p-3">
            <p className="font-semibold">1. Le role</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Donne un jeu de droits par defaut, modifiable dans « Droits ».
            </p>
          </div>
          <div className="rounded-lg border border-line p-3">
            <p className="font-semibold">2. La derogation</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Accorde ou retire un droit a un compte precis. Motivee et tracee.
            </p>
          </div>
          <div className="rounded-lg border border-line p-3">
            <p className="font-semibold">3. Le cloisonnement</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Un droit ne traverse pas les etablissements. Ce n est pas un droit attribuable : c est une regle de
              confidentialite.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
