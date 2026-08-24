import { NextResponse } from 'next/server';
import { apiRequire, guarded, organizationFilter } from '@/lib/auth/guard';
import { listActiveSessions } from '@/lib/auth/store';

export const dynamic = 'force-dynamic';

export function GET() {
  return guarded(async () => {
    const ctx = await apiRequire('session:manage');
    const scoped = organizationFilter(ctx);
    return NextResponse.json({
      sessions: listActiveSessions(scoped ?? undefined),
      currentUserId: ctx.user.id,
    });
  });
}
