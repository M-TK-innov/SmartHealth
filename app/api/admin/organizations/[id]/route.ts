import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { getOrganization, updateOrganization } from '@/lib/auth/store';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const STATUSES = ['pending', 'active', 'suspended', 'rejected'];

export function PATCH(req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    const ctx = await apiRequire('org:write');
    const { id } = await ctxParam.params;
    if (!getOrganization(id)) {
      return NextResponse.json({ error: 'Organisation introuvable.' }, { status: 404 });
    }

    const data = await body<Record<string, string>>(req);
    if (data.status) {
      if (!STATUSES.includes(data.status)) {
        return NextResponse.json({ error: 'Statut invalide.' }, { status: 400 });
      }
      await apiRequire('org:validate');
    }

    updateOrganization(id, data, ctx.user);
    return NextResponse.json({ organization: getOrganization(id) });
  });
}
