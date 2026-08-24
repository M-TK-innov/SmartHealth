import { requirePermission } from '@/lib/auth/guard';
import { AccessPanel } from '@/components/admin/AccessPanel';

export const dynamic = 'force-dynamic';

export default async function AdminAccessPage() {
  const ctx = await requirePermission('session:manage', '/admin/acces');
  return <AccessPanel canManagePolicy={ctx.can('policy:manage')} />;
}
