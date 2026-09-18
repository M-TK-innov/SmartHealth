import { fhirJson } from '@/lib/api';
import { isSupported, operationOutcome, searchResource, searchsetBundle } from '@/lib/fhir/server';
import { fhirBaseUrl } from '@/lib/net/public-url';
import { fhirGate, preflight, withHeaders } from '@/lib/net/fhir-gate';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ resourceType: string }> };

export function OPTIONS(req: Request) {
  return preflight(req);
}

/** GET /api/fhir/{type}?patient=... - recherche FHIR (searchset Bundle). */
export async function GET(req: Request, ctx: Ctx) {
  const { resourceType } = await ctx.params;

  const gate = await fhirGate(req, resourceType);
  if (gate.denied) return withHeaders(gate.denied, gate.headers);

  if (!isSupported(resourceType)) {
    return withHeaders(
      fhirJson(
        operationOutcome('error', 'not-supported', `Type de ressource non supporte : ${resourceType}`),
        404,
      ),
      gate.headers,
    );
  }
  const url = new URL(req.url);
  try {
    const resources = searchResource(resourceType, url.searchParams);
    return withHeaders(fhirJson(searchsetBundle(resources, fhirBaseUrl(url.origin))), gate.headers);
  } catch (e) {
    return withHeaders(
      fhirJson(operationOutcome('error', 'exception', e instanceof Error ? e.message : 'Erreur'), 500),
      gate.headers,
    );
  }
}
