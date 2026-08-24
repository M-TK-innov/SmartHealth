import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { authenticate, purgeExpiredSessions } from '@/lib/auth/store';
import { requestContext, startSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { email, password } = await body<{ email?: string; password?: string }>(req);

  if (!email?.trim() || !password) {
    return NextResponse.json({ error: 'Adresse e-mail et mot de passe requis.' }, { status: 400 });
  }

  const context = await requestContext();
  const result = authenticate(email, password, context);

  if (!result.ok || !result.user || !result.token) {
    // 401 uniforme : ne pas distinguer compte inconnu, mot de passe faux et
    // compte inactif permettrait d'enumerer les comptes de la plateforme.
    return NextResponse.json({ error: result.error ?? 'Connexion impossible.' }, { status: 401 });
  }

  await startSession(result.token);
  purgeExpiredSessions();

  return NextResponse.json({
    user: {
      id: result.user.id,
      email: result.user.email,
      fullName: result.user.full_name,
      role: result.user.role,
      mustChangePassword: result.user.must_change_password === 1,
    },
  });
}
