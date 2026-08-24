import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { createOrganization, listOrganizations } from '@/lib/auth/store';
import { ORG_TYPES, type OrgType } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return guarded(async () => {
    await apiRequire('org:read');
    const status = new URL(req.url).searchParams.get('status') ?? undefined;
    return NextResponse.json({ organizations: listOrganizations(status) });
  });
}

export function POST(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('org:write');
    const data = await body<Record<string, string>>(req);

    if (!data.name?.trim()) {
      return NextResponse.json({ error: "Le nom de l'organisation est obligatoire." }, { status: 400 });
    }
    const type = (data.type as OrgType) ?? 'health-center';
    if (!ORG_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Type invalide.' }, { status: 400 });
    }

    const id = createOrganization(
      {
        type,
        name: data.name.trim(),
        code: data.code?.trim() || null,
        region: data.region?.trim() || null,
        address: data.address?.trim() || null,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        parent_id: data.parentId || null,
        status: 'active',
      },
      ctx.user,
    );
    return NextResponse.json({ id }, { status: 201 });
  });
}
