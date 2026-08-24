import { requirePermission } from '@/lib/auth/guard';
import { PermissionMatrix } from '@/components/admin/PermissionMatrix';

export const dynamic = 'force-dynamic';

export default async function AdminRightsPage({ searchParams }: { searchParams: Promise<{ compte?: string }> }) {
  await requirePermission('permission:manage', '/admin/droits');
  const { compte } = await searchParams;
  return <PermissionMatrix initialUserId={compte} />;
}
