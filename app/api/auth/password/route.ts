import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { guarded, apiAuth } from '@/lib/auth/guard';
import { verifyPassword } from '@/lib/auth/password';
import { checkPasswordStrength } from '@/lib/auth/password';
import { changePassword, getUserById, passwordPolicy, revokeUserSessions } from '@/lib/auth/store';
import { startSession } from '@/lib/auth/session';
import { authenticate } from '@/lib/auth/store';
import { requestContext } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * Changement de mot de passe par le titulaire du compte.
 *
 * L'ancien mot de passe est exige meme si la session est valide : sinon un
 * poste laisse deverrouille suffirait a confisquer un compte medecin.
 * Toutes les autres sessions sont revoquees, et une nouvelle est ouverte pour
 * l'appareil courant.
 */
export function POST(req: Request) {
  return guarded(async () => {
    const ctx = await apiAuth();
    const { currentPassword, newPassword } = await body<{ currentPassword?: string; newPassword?: string }>(req);

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Mot de passe actuel et nouveau mot de passe requis.' }, { status: 400 });
    }

    const full = getUserById(ctx.user.id);
    if (!full) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });

    const valid = verifyPassword(currentPassword, {
      hash: full.password_hash,
      salt: full.password_salt,
      algo: full.password_algo,
    });
    if (!valid) return NextResponse.json({ error: 'Mot de passe actuel incorrect.' }, { status: 400 });

    if (currentPassword === newPassword) {
      return NextResponse.json({ error: 'Le nouveau mot de passe doit differer de l ancien.' }, { status: 400 });
    }

    const problems = checkPasswordStrength(newPassword, passwordPolicy());
    if (problems.length) return NextResponse.json({ error: problems.join(' ') }, { status: 400 });

    changePassword(ctx.user.id, newPassword);
    revokeUserSessions(ctx.user.id, 'mot de passe modifie');

    // On rouvre une session pour l'appareil courant, sinon l'utilisateur est
    // deconnecte par son propre changement de mot de passe.
    const reauth = authenticate(ctx.user.email, newPassword, await requestContext());
    if (reauth.ok && reauth.token) await startSession(reauth.token);

    return NextResponse.json({ ok: true, message: 'Mot de passe modifie. Les autres sessions ont ete fermees.' });
  });
}
