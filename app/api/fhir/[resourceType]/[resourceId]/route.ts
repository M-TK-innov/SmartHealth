import { fhirJson } from '@/lib/api';
import { isSupported, operationOutcome, readResource } from '@/lib/fhir/server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ resourceType: string; resourceId: string }> };

/** GET /api/fhir/{type}/{id} - lecture unitaire d'une ressource FHIR. */
export async function GET(_req: Request, ctx: Ctx) {
  const { resourceType, resourceId } = await ctx.params;
  if (!isSupported(resourceType)) {
    return fhirJson(
      operationOutcome('error', 'not-supported', `Type de ressource non supporte : ${resourceType}`),
      404,
    );
  }
  try {
    const resource = readResource(resourceType, resourceId);
    if (!resource) {
      return fhirJson(operationOutcome('error', 'not-found', `${resourceType}/${resourceId} introuvable`), 404);
    }
    return fhirJson(resource);
  } catch (e) {
    return fhirJson(operationOutcome('error', 'exception', e instanceof Error ? e.message : 'Erreur'), 500);
  }
}
