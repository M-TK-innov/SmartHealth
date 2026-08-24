import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { rolePermissions, setRolePermissions } from '@/lib/auth/store';
import { ALL_PERMISSIONS, ROLES, isRole, type Permission } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export function GET() {
  return guarded(async () => {
    await apiRequire('permission:manage');
    const matrix = Object.fromEntries(ROLES.map((r) => [r, rolePermissions(r)]));
    return NextResponse.json({ matrix, catalogue: ALL_PERMISSIONS });
  });
}

/**
 * Modification de la matrice role -> permissions.
 *
 * Deux verrous : on ne modifie pas un role au-dessus du sien, et le
 * super-administrateur conserve toujours l'integralite des droits — sinon une
 * mauvaise manipulation rendrait la plateforme definitivement inadministrable.
 */
export function PATCH(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('permission:manage');
    const { role, permissions } = await body<{ role?: string; permissions?: string[] }>(req);

    if (!isRole(role)) return NextResponse.json({ error: 'Role inconnu.' }, { status: 400 });
    if (role === 'super_admin') {
      return NextResponse.json(
        { error: 'Les droits du super-administrateur ne sont pas modifiables : ce verrou evite de rendre la plateforme inadministrable.' },
        { status: 403 },
      );
    }
    if (ctx.user.role !== 'super_admin' && (role === 'admin' || role === 'ministere')) {
      return NextResponse.json({ error: `Seul un super-administrateur peut modifier les droits du role « ${role} ».` }, { status: 403 });
    }

    const requested = (permissions ?? []).filter((p): p is Permission => ALL_PERMISSIONS.includes(p as Permission));
    const notHeld = requested.filter((p) => !ctx.can(p));
    if (notHeld.length) {
      return NextResponse.json(
        { error: `Vous ne detenez pas ces droits et ne pouvez donc pas les attribuer : ${notHeld.join(', ')}.` },
        { status: 403 },
      );
    }

    setRolePermissions(role, requested, ctx.user);
    return NextResponse.json({ role, permissions: rolePermissions(role) });
  });
}
