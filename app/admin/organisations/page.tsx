import { requirePermission } from '@/lib/auth/guard';
import { OrgManager } from '@/components/admin/OrgManager';

export const dynamic = 'force-dynamic';

export default async function AdminOrgsPage() {
  const ctx = await requirePermission('org:read', '/admin/organisations');
  return <OrgManager canWrite={ctx.can('org:write')} />;
}
