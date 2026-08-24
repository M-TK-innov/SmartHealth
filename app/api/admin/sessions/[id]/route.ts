import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { revokeSessionById } from '@/lib/auth/store';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Deconnexion forcee d'une session : poste perdu, depart d'un agent, incident. */
export function DELETE(req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    const ctx = await apiRequire('session:manage');
    const { id } = await ctxParam.params;
    const { reason } = await body<{ reason?: string }>(req);
    revokeSessionById(id, ctx.user, reason || 'revoquee par un administrateur');
    return NextResponse.json({ ok: true });
  });
}
