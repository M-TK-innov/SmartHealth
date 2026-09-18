import { fhirJson } from '@/lib/api';
import { isSupported, operationOutcome, readResource } from '@/lib/fhir/server';
import { fhirGate, preflight, withHeaders } from '@/lib/net/fhir-gate';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ resourceType: string; resourceId: string }> };

export function OPTIONS(req: Request) {
  return preflight(req);
}

/** GET /api/fhir/{type}/{id} - lecture unitaire d'une ressource FHIR. */
export async function GET(req: Request, ctx: Ctx) {
  const { resourceType, resourceId } = await ctx.params;

  const gate = await fhirGate(req, `${resourceType}/${resourceId}`);
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
  try {
    const resource = readResource(resourceType, resourceId);
    if (!resource) {
      return withHeaders(
        fhirJson(operationOutcome('error', 'not-found', `${resourceType}/${resourceId} introuvable`), 404),
        gate.headers,
      );
    }
    return withHeaders(fhirJson(resource), gate.headers);
  } catch (e) {
    return withHeaders(
      fhirJson(operationOutcome('error', 'exception', e instanceof Error ? e.message : 'Erreur'), 500),
      gate.headers,
    );
  }
}
