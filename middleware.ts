import { NextResponse, type NextRequest } from 'next/server';

/**
 * Premier filtre : redirige vers la connexion quand aucun cookie de session
 * n'est present.
 *
 * Ce middleware s'execute sur le runtime Edge et n'a donc PAS acces a la base :
 * il ne peut pas verifier qu'un jeton est valide, seulement qu'il existe. Ce
 * n'est pas le controle d'acces — c'est du confort de navigation.
 *
 * L'autorisation reelle (session valide, statut du compte, permissions,
 * cloisonnement par etablissement) est faite cote serveur, par `requireAuth` /
 * `requirePermission` dans les pages et `apiRequire` dans les routes. Un jeton
 * forge ou expire passe ce middleware et se fait refuser juste apres.
 */

const SESSION_COOKIE = 'pd_session';

/** Accessibles sans session. */
const PUBLIC_PATHS = ['/connexion', '/inscription', '/acces-refuse', '/hors-ligne', '/bienvenue'];

/** Routes d'API ouvertes : authentification et liste publique des etablissements. */
const PUBLIC_API = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/organizations',
  // Amorcage : la route se verrouille d'elle-meme des qu'un compte existe.
  '/api/auth/bootstrap',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublicPage = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isPublicApi = PUBLIC_API.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublicPage || isPublicApi) return NextResponse.next();

  // L'API FHIR n'est pas redirigee vers une page de connexion HTML : un systeme
  // tiers attend un OperationOutcome FHIR, pas du HTML. Elle n'est pas ouverte
  // pour autant — son controle d'acces vit dans la route (lib/net/fhir-gate.ts),
  // qui sait repondre dans le bon format et applique le reglage choisi dans
  // Administration > Reseau et serveurs. Le middleware tourne sur l'Edge et ne
  // peut pas lire la base : il ne pourrait pas decider ici.
  if (pathname.startsWith('/api/fhir')) return NextResponse.next();

  if (req.cookies.get(SESSION_COOKIE)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/connexion';
  url.search = `?suite=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Tout sauf les ressources statiques, le manifeste, le service worker et les icones.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js).*)'],
};
