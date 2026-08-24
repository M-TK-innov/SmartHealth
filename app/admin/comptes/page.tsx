import { requirePermission } from '@/lib/auth/guard';
import { organizationFilter } from '@/lib/auth/guard';
import { listOrganizations } from '@/lib/auth/store';
import { UserManager } from '@/components/admin/UserManager';

export const dynamic = 'force-dynamic';

export default async function AdminAccountsPage() {
  const ctx = await requirePermission('user:read', '/admin/comptes');
  const scoped = organizationFilter(ctx);
  const organizations = listOrganizations().map((o) => ({ id: o.id, name: o.name }));

  return <UserManager actorRole={ctx.user.role} organizations={organizations} scoped={scoped} />;
}
