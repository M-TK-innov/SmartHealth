import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { ComplianceError, saveEndpoint, type EndpointInput } from '@/lib/net/store';

export const dynamic = 'force-dynamic';

/** Declaration d'un serveur interne ou externe. */
export function POST(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('server:manage');
    const input = await body<EndpointInput>(req);

    try {
      const { endpoint, evaluation, message } = saveEndpoint({ ...input, id: undefined }, ctx.user);
      return NextResponse.json({ endpoint, evaluation, message }, { status: 201 });
    } catch (e) {
      if (e instanceof ComplianceError) {
        return NextResponse.json({ error: e.message, evaluation: e.evaluation }, { status: 422 });
      }
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Creation impossible.' }, { status: 400 });
    }
  });
}
