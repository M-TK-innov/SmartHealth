import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded, organizationFilter } from '@/lib/auth/guard';
import { checkPasswordStrength, generateTemporaryPassword } from '@/lib/auth/password';
import { createUser, listUsers, passwordPolicy } from '@/lib/auth/store';
import { canValidateRole, isRole } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('user:read');
    const params = new URL(req.url).searchParams;

    // Un administrateur d'etablissement ne voit que ses propres comptes.
    const scoped = organizationFilter(ctx);
    const users = listUsers({
      status: params.get('status') ?? undefined,
      role: params.get('role') ?? undefined,
      organizationId: scoped ?? params.get('organizationId') ?? undefined,
    });

    return NextResponse.json({ users, scopedToOrganization: scoped });
  });
}

/**
 * Creation d'un compte par un administrateur.
 *
 * Le mot de passe est genere par la plateforme et doit etre change a la
 * premiere connexion : l'administrateur ne choisit pas le mot de passe d'un
 * praticien, et personne d'autre que le titulaire ne le connait durablement.
 */
export function POST(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('user:write');
    const data = await body<{
      email?: string;
      fullName?: string;
      role?: string;
      organizationId?: string;
      phone?: string;
      licenseNumber?: string;
      password?: string;
    }>(req);

    if (!data.email?.trim() || !data.fullName?.trim()) {
      return NextResponse.json({ error: 'Adresse e-mail et nom complet requis.' }, { status: 400 });
    }
    if (!isRole(data.role)) return NextResponse.json({ error: 'Role invalide.' }, { status: 400 });

    // On ne cree pas un compte d'un niveau qu'on ne pourrait pas valider.
    if (!canValidateRole(ctx.user.role, data.role)) {
      return NextResponse.json(
        { error: `Votre role ne permet pas de creer un compte « ${data.role} ».` },
        { status: 403 },
      );
    }

    const scoped = organizationFilter(ctx);
    const organizationId = scoped ?? data.organizationId ?? null;
    if (scoped && data.organizationId && data.organizationId !== scoped) {
      return NextResponse.json({ error: 'Vous ne pouvez creer un compte que dans votre etablissement.' }, { status: 403 });
    }

    const password = data.password?.trim() || generateTemporaryPassword();
    const problems = checkPasswordStrength(password, passwordPolicy());
    if (problems.length) return NextResponse.json({ error: problems.join(' ') }, { status: 400 });

    try {
      const user = createUser(
        {
          email: data.email,
          password,
          fullName: data.fullName,
          role: data.role,
          organizationId,
          phone: data.phone ?? null,
          licenseNumber: data.licenseNumber ?? null,
          status: 'active',
          mustChangePassword: true,
        },
        ctx.user,
      );

      return NextResponse.json(
        {
          user,
          // Affiche une seule fois : il n'est jamais stocke en clair.
          temporaryPassword: data.password ? undefined : password,
          message: 'Compte cree. Le titulaire devra changer son mot de passe a la premiere connexion.',
        },
        { status: 201 },
      );
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Creation impossible.' }, { status: 400 });
    }
  });
}
