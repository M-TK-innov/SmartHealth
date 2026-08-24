import Link from 'next/link';
import { requireAnyPermission } from '@/lib/auth/guard';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { AdminNav } from '@/components/admin/AdminNav';
import { ADMIN_SECTIONS } from '@/lib/auth/admin-sections';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // L'entree dans la console demande au moins un droit d'administration ;
  // chaque section revalide ensuite le sien.
  const ctx = await requireAnyPermission(
    ['user:read', 'org:read', 'permission:manage', 'session:manage', 'database:manage', 'server:manage'],
    '/admin',
  );

  const visible = ADMIN_SECTIONS.filter((s) => ctx.can(s.permission));

  return (
    <div className="space-y-4">
      <header className="card-pad">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Administration</h1>
            <p className="mt-1 text-sm text-ink-soft">
              {ROLE_LABELS[ctx.user.role]}
              {ctx.organization ? ` · ${ctx.organization.name}` : ' · portee plateforme'}
            </p>
          </div>
          {ctx.scope === 'own-org' && (
            <span className="chip bg-warn-soft text-warn">
              Perimetre limite a votre etablissement
            </span>
          )}
        </div>
      </header>

      <AdminNav sections={visible} />

      {visible.length === 0 ? (
        <p className="card-pad text-sm text-ink-soft">
          Aucune section d administration ne vous est ouverte.{' '}
          <Link href="/" className="text-brand-dark hover:underline">Retour au tableau de bord</Link>
        </p>
      ) : (
        children
      )}
    </div>
  );
}
