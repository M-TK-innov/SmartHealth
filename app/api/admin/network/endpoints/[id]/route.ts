import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { ComplianceError, deleteEndpoint, evaluateCurrent, saveEndpoint, type EndpointInput } from '@/lib/net/store';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export function PUT(req: Request, routeCtx: Ctx) {
  return guarded(async () => {
    const authCtx = await apiRequire('server:manage');
    const { id } = await routeCtx.params;
    const input = await body<EndpointInput>(req);

    try {
      const { endpoint, evaluation, message } = saveEndpoint({ ...input, id }, authCtx.user);
      return NextResponse.json({ endpoint, evaluation, message });
    } catch (e) {
      if (e instanceof ComplianceError) {
        return NextResponse.json({ error: e.message, evaluation: e.evaluation }, { status: 422 });
      }
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Modification impossible.' },
        { status: 400 },
      );
    }
  });
}

export function DELETE(_req: Request, routeCtx: Ctx) {
  return guarded(async () => {
    const authCtx = await apiRequire('server:manage');
    const { id } = await routeCtx.params;
    try {
      deleteEndpoint(id, authCtx.user);
      return NextResponse.json({ deleted: true, evaluation: evaluateCurrent() });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Suppression impossible.' },
        { status: 400 },
      );
    }
  });
}
