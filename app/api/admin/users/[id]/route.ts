import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded, organizationFilter } from '@/lib/auth/guard';
import { generateTemporaryPassword } from '@/lib/auth/password';
import { changePassword, getUserById, setUserStatus, toSafeUser, updateUser } from '@/lib/auth/store';
import { canValidateRole, isRole, type Role } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const STATUSES = ['pending', 'active', 'suspended', 'rejected'] as const;
type Status = (typeof STATUSES)[number];

export function GET(_req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    const ctx = await apiRequire('user:read');
    const { id } = await ctxParam.params;
    const user = getUserById(id);
    if (!user) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });

    const scoped = organizationFilter(ctx);
    if (scoped && user.organization_id !== scoped) {
      return NextResponse.json({ error: 'Ce compte releve d un autre etablissement.' }, { status: 403 });
    }
    return NextResponse.json({ user: toSafeUser(user) });
  });
}

/**
 * Validation, refus, suspension, modification et reinitialisation de mot de passe.
 *
 * Deux garde-fous constants : on n'agit jamais sur un compte d'un role qu'on
 * ne peut pas valider, et on n'agit jamais sur son propre compte depuis cet
 * ecran (sinon un administrateur peut se verrouiller lui-meme, ou se
 * promouvoir).
 */
export function PATCH(req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    const ctx = await apiRequire('user:write');
    const { id } = await ctxParam.params;
    const target = getUserById(id);
    if (!target) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });

    if (target.id === ctx.user.id) {
      return NextResponse.json(
        { error: 'Vous ne pouvez pas modifier votre propre compte depuis la console d administration.' },
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

    const data = await body<{
      status?: string;
      reason?: string;
      fullName?: string;
      phone?: string;
      role?: string;
      organizationId?: string;
      licenseNumber?: string;
      resetPassword?: boolean;
    }>(req);

    let temporaryPassword: string | undefined;

    if (data.status) {
      if (!(STATUSES as readonly string[]).includes(data.status)) {
        return NextResponse.json({ error: 'Statut invalide.' }, { status: 400 });
      }
      if (data.status === 'rejected' && !data.reason?.trim()) {
        return NextResponse.json({ error: 'Un motif est obligatoire pour refuser une demande.' }, { status: 400 });
      }
      await apiRequire('user:validate');
      setUserStatus(id, data.status as Status, ctx.user, data.reason);
    }

    if (data.role !== undefined) {
      if (!isRole(data.role)) return NextResponse.json({ error: 'Role invalide.' }, { status: 400 });
      if (!canValidateRole(ctx.user.role, data.role as Role)) {
        return NextResponse.json({ error: `Vous ne pouvez pas attribuer le role « ${data.role} ».` }, { status: 403 });
      }
    }

    updateUser(
      id,
      {
        full_name: data.fullName,
        phone: data.phone,
        role: data.role as Role | undefined,
        organization_id: scoped ?? data.organizationId,
        license_number: data.licenseNumber,
      },
      ctx.user,
    );

    if (data.resetPassword) {
      temporaryPassword = generateTemporaryPassword();
      changePassword(id, temporaryPassword, ctx.user);
      // le titulaire doit le remplacer des sa prochaine connexion
      updateUser(id, {}, ctx.user);
      const { run } = await import('@/lib/db');
      run('UPDATE user_account SET must_change_password = 1 WHERE id = ?', [id]);
    }

    return NextResponse.json({ user: toSafeUser(getUserById(id)!), temporaryPassword });
  });
}
