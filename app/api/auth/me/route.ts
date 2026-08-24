import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Identite et droits effectifs du compte connecte. Aucun secret n'est renvoye. */
export async function GET() {
  const ctx = await auth();
  if (!ctx) return NextResponse.json({ authenticated: false }, { status: 401 });

  return NextResponse.json({
    authenticated: true,
    user: {
      id: ctx.user.id,
      email: ctx.user.email,
      fullName: ctx.user.full_name,
      role: ctx.user.role,
      status: ctx.user.status,
      mustChangePassword: ctx.user.must_change_password === 1,
    },
    organization: ctx.organization
      ? { id: ctx.organization.id, name: ctx.organization.name, type: ctx.organization.type }
      : null,
    scope: ctx.scope,
    permissions: [...ctx.permissions].sort(),
  });
}
