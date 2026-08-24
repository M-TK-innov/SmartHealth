import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded, organizationFilter } from '@/lib/auth/guard';
import { effectivePermissions, getUserById, rolePermissions, setUserOverride, userOverrides } from '@/lib/auth/store';
import { ALL_PERMISSIONS, canValidateRole, type Permission } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export function GET(_req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    const ctx = await apiRequire('permission:manage');
    const { id } = await ctxParam.params;
    const user = getUserById(id);
    if (!user) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });

    return NextResponse.json({
      role: user.role,
      fromRole: rolePermissions(user.role),
      overrides: userOverrides(id),
      effective: [...effectivePermissions(user)].sort(),
      catalogue: ALL_PERMISSIONS,
      actor: ctx.user.id,
    });
  });
}

/**
 * Derogation individuelle : accorde ou retire une permission a un compte,
 * par-dessus la matrice de son role. `granted: null` supprime la derogation
 * et rend le compte a la regle generale.
 */
export function PATCH(req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    const ctx = await apiRequire('permission:manage');
    const { id } = await ctxParam.params;
    const target = getUserById(id);
    if (!target) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });

    if (target.id === ctx.user.id) {
      return NextResponse.json(
        { error: 'Vous ne pouvez pas modifier vos propres droits — cela contournerait toute la hierarchie.' },
        { status: 403 },
      );
    }
    if (!canValidateRole(ctx.user.role, target.role)) {
      return NextResponse.json({ error: `Votre role ne permet pas d agir sur un compte « ${target.role} ».` }, { status: 403 });
    }
    const scoped = organizationFilter(ctx);
    if (scoped && target.organization_id !== scoped) {
      return NextResponse.json({ error: 'Ce compte releve d un autre etablissement.' }, { status: 403 });
    }

    const { permission, granted, reason } = await body<{
      permission?: string;
      granted?: boolean | null;
      reason?: string;
    }>(req);

    if (!permission || !ALL_PERMISSIONS.includes(permission as Permission)) {
      return NextResponse.json({ error: 'Permission inconnue.' }, { status: 400 });
    }
    // On ne peut pas accorder un droit qu'on ne detient pas soi-meme.
    if (granted === true && !ctx.can(permission as Permission)) {
      return NextResponse.json(
        { error: `Vous ne detenez pas « ${permission} » : vous ne pouvez pas l accorder.` },
        { status: 403 },
      );
    }

    setUserOverride(id, permission as Permission, granted ?? null, ctx.user, reason);

    const refreshed = getUserById(id)!;
    return NextResponse.json({
      overrides: userOverrides(id),
      effective: [...effectivePermissions(refreshed)].sort(),
    });
  });
}
