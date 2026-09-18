import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { audit } from '@/lib/db';
import { auth } from '@/lib/auth/session';
import { operationOutcome } from '@/lib/fhir/server';
import { corsOriginFor, networkConfig } from '@/lib/net/store';

/**
 * Controle d'acces a l'API FHIR.
 *
 * L'API FHIR sert des ressources Patient, Condition, Observation et
 * MedicationRequest : c'est le dossier medical, dans un format que tout
 * systeme sait lire. Elle etait ouverte a qui pouvait atteindre le serveur.
 * Elle est desormais reglee depuis la console, et fermee par defaut.
 *
 *   session  la requete vient d'un compte connecte disposant de export:read ;
 *   token    la requete porte FHIR_API_TOKEN, pour un systeme tiers ;
 *   open     aucun controle — reserve aux maquettes, et soumis a une
 *            derogation ecrite d'un super-administrateur.
 *
 * Chaque acces accepte est inscrit au journal : un dossier medical consulte
 * par une machine doit laisser la meme trace qu'un dossier consulte par une
 * personne.
 */

const fhirError = (status: number, code: string, message: string) =>
  new NextResponse(JSON.stringify(operationOutcome('error', code, message), null, 2), {
    status,
    headers: { 'Content-Type': 'application/fhir+json; charset=utf-8' },
  });

/** Comparaison a duree constante : une comparaison naive revele le jeton octet par octet. */
function sameToken(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export interface GateResult {
  /** Reponse a renvoyer immediatement, ou null si l'acces est accorde. */
  denied: Response | null;
  headers: Record<string, string>;
}

export async function fhirGate(req: Request, resource: string): Promise<GateResult> {
  const headers = corsHeaders(req);
  const { fhir_access } = networkConfig();

  if (fhir_access === 'open') {
    return { denied: null, headers };
  }

  if (fhir_access === 'token') {
    const expected = process.env.FHIR_API_TOKEN?.trim();
    if (!expected) {
      // La regle JETON_API_ABSENT empeche d'enregistrer ce cas, mais la
      // variable peut disparaitre de l'environnement apres coup. On ferme,
      // plutot que de comparer a une valeur vide.
      return {
        denied: fhirError(503, 'security', "L'API FHIR est reglee sur jeton de service, mais aucun jeton n'est defini sur ce serveur."),
        headers,
      };
    }
    const presented = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!presented || !sameToken(presented, expected)) {
      return {
        denied: fhirError(401, 'login', "Jeton de service requis sur l'API FHIR."),
        headers,
      };
    }
    audit({
      action: 'read',
      entity: 'api_fhir',
      entityId: resource,
      actorLabel: 'systeme tiers (jeton de service)',
      detail: { resource, mode: 'token' },
    });
    return { denied: null, headers };
  }

  const ctx = await auth();
  if (!ctx) {
    return {
      denied: fhirError(401, 'login', "Authentification requise sur l'API FHIR."),
      headers,
    };
  }
  if (!ctx.can('export:read')) {
    return {
      denied: fhirError(403, 'forbidden', "Droit insuffisant : export:read est requis pour interroger l'API FHIR."),
      headers,
    };
  }
  audit({
    action: 'read',
    entity: 'api_fhir',
    entityId: resource,
    actorId: ctx.user.id,
    actorLabel: ctx.user.full_name,
    detail: { resource, mode: 'session' },
  });
  return { denied: null, headers };
}

/**
 * En-tetes CORS calcules par requete.
 *
 * Ils etaient figes dans next.config.mjs, donc decides a la construction : une
 * structure ne pouvait pas restreindre les origines sans reconstruire
 * l'application. Ils viennent maintenant de la configuration, et l'origine
 * n'est renvoyee que si elle figure dans la liste autorisee.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = corsOriginFor(req.headers.get('origin'));
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    // L'origine varie selon la requete : sans Vary, un cache partage servirait
    // la reponse d'une origine autorisee a une origine qui ne l'est pas.
    Vary: 'Origin',
  };
}

export function withHeaders(res: Response, headers: Record<string, string>): Response {
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export function preflight(req: Request): Response {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}
