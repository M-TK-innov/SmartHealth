import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { auth, type AuthContext } from './session';
import type { Permission } from './roles';

/**
 * Gardes d'acces.
 *
 * Deux familles, parce que les deux contextes n'echouent pas de la meme
 * facon : une PAGE redirige vers la connexion, une API repond 401 ou 403.
 *
 * Regle du projet : toute page et toute route qui touche a des donnees de
 * sante passe par une de ces gardes. Aucun controle d'acces n'est fait dans
 * le composant client — il serait contournable.
 */

// ------------------------------------------------------------------- pages

export async function requireAuth(returnTo?: string): Promise<AuthContext> {
  const ctx = await auth();
  if (!ctx) redirect(`/connexion${returnTo ? `?suite=${encodeURIComponent(returnTo)}` : ''}`);
  return ctx;
}

export async function requirePermission(permission: Permission, returnTo?: string): Promise<AuthContext> {
  const ctx = await requireAuth(returnTo);
  if (!ctx.can(permission)) redirect(`/acces-refuse?droit=${encodeURIComponent(permission)}`);
  return ctx;
}

export async function requireAnyPermission(permissions: Permission[], returnTo?: string): Promise<AuthContext> {
  const ctx = await requireAuth(returnTo);
  if (!permissions.some((p) => ctx.can(p))) {
    redirect(`/acces-refuse?droit=${encodeURIComponent(permissions.join(','))}`);
  }
  return ctx;
}

// -------------------------------------------------------------------- API

export class ApiAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function apiAuth(): Promise<AuthContext> {
  const ctx = await auth();
  if (!ctx) throw new ApiAuthError('Authentification requise.', 401);
  return ctx;
}

export async function apiRequire(permission: Permission): Promise<AuthContext> {
  const ctx = await apiAuth();
  if (!ctx.can(permission)) {
    throw new ApiAuthError(`Droit insuffisant : ${permission} est requis pour cette action.`, 403);
  }
  return ctx;
}

/** Enveloppe une route : convertit les erreurs d'acces en reponses HTTP propres. */
export function guarded(fn: () => Promise<Response> | Response) {
  return Promise.resolve()
    .then(fn)
    .catch((e) => {
      if (e instanceof ApiAuthError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur interne' }, { status: 500 });
    });
}

// ------------------------------------------------------- cloisonnement

/**
 * Verifie qu'une ressource appartient bien au perimetre du compte.
 *
 * Le cloisonnement n'est pas une permission : meme un medecin autorise a lire
 * les dossiers ne lit que ceux de son etablissement. Seuls les roles de portee
 * `all` traversent cette limite.
 */
export function assertSameOrganization(ctx: AuthContext, resourceOrganizationId: string | null | undefined) {
  if (ctx.scope === 'all') return;
  if (ctx.scope === 'national') {
    throw new ApiAuthError(
      "Ce role n'accede pas aux dossiers nominatifs, seulement aux indicateurs agreges.",
      403,
    );
  }
  // Les dossiers anterieurs a la mise en place du cloisonnement n'ont pas
  // d'organisation : on les rattache implicitement a l'etablissement courant
  // plutot que de bloquer l'acces a un dossier existant.
  if (!resourceOrganizationId) return;
  if (resourceOrganizationId !== ctx.user.organization_id) {
    throw new ApiAuthError("Ce dossier appartient a un autre etablissement.", 403);
  }
}

/** Identifiant d'organisation a appliquer aux filtres de liste, ou null si portee globale. */
export function organizationFilter(ctx: AuthContext): string | null {
  return ctx.scope === 'own-org' ? ctx.user.organization_id : null;
}
