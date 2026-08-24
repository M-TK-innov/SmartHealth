import { requirePermission } from '@/lib/auth/guard';
import { SystemPanel } from '@/components/admin/SystemPanel';

export const dynamic = 'force-dynamic';

export default async function AdminSystemPage() {
  const ctx = await requirePermission('database:manage', '/admin/systeme');
  return <SystemPanel canManageServer={ctx.can('server:manage')} />;
}
