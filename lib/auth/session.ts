import { cookies, headers } from 'next/headers';
import {
  effectivePermissions,
  getOrganization,
  getPolicy,
  resolveSession,
  revokeSessionByToken,
  type Organization,
  type SafeUser,
} from './store';
import { ROLE_DATA_SCOPE, type DataScope, type Permission } from './roles';

export const SESSION_COOKIE = 'pd_session';

export interface AuthContext {
  user: SafeUser;
  organization: Organization | null;
  permissions: Set<Permission>;
  scope: DataScope;
  can: (permission: Permission) => boolean;
}

/**
 * Contexte d'authentification de la requete courante.
 * Retourne null si aucune session valide : c'est a l'appelant de decider
 * s'il redirige (page) ou repond 401 (API).
 */
export async function auth(): Promise<AuthContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const resolved = resolveSession(token);
  if (!resolved) return null;

  const { user } = resolved;
  const permissions = effectivePermissions(user);
  return {
    user,
    organization: user.organization_id ? (getOrganization(user.organization_id) ?? null) : null,
    permissions,
    scope: ROLE_DATA_SCOPE[user.role],
    can: (permission: Permission) => permissions.has(permission),
  };
}

export async function startSession(token: string) {
  const policy = getPolicy();
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // inaccessible au JavaScript de la page : neutralise le vol par XSS
    sameSite: 'lax', // bloque l'envoi depuis un site tiers (CSRF)
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: policy.session_hours * 3600,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) revokeSessionByToken(token);
  jar.delete(SESSION_COOKIE);
}

/** Adresse et agent de l'appelant, pour la tracabilite des connexions. */
export async function requestContext(): Promise<{ ip?: string; userAgent?: string }> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  return {
    ip: forwarded ? forwarded.split(',')[0].trim() : (h.get('x-real-ip') ?? undefined),
    userAgent: h.get('user-agent') ?? undefined,
  };
}
