import { fhirJson } from '@/lib/api';
import { capabilityStatement } from '@/lib/fhir';
import { corsHeaders, preflight, withHeaders } from '@/lib/net/fhir-gate';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: Request) {
  return preflight(req);
}

/**
 * GET /api/fhir/metadata - CapabilityStatement (point d'entree standard FHIR).
 *
 * Volontairement hors du controle d'acces : le CapabilityStatement decrit ce
 * que le serveur sait faire, pas ce qu'il contient. C'est par lui qu'un
 * systeme tiers decouvre qu'une authentification est attendue ; le fermer
 * rendrait la negociation impossible.
 */
export function GET(req: Request) {
  return withHeaders(fhirJson(capabilityStatement()), corsHeaders(req));
}
