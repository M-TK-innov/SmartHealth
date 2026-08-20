import { fhirJson } from '@/lib/api';
import { isSupported, operationOutcome, searchResource, searchsetBundle } from '@/lib/fhir/server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ resourceType: string }> };

/** GET /api/fhir/{type}?patient=... - recherche FHIR (searchset Bundle). */
export async function GET(req: Request, ctx: Ctx) {
  const { resourceType } = await ctx.params;
  if (!isSupported(resourceType)) {
    return fhirJson(
      operationOutcome('error', 'not-supported', `Type de ressource non supporte : ${resourceType}`),
      404,
    );
  }
  const url = new URL(req.url);
  const base = process.env.FHIR_BASE_URL || `${url.origin}/api/fhir`;
  try {
    const resources = searchResource(resourceType, url.searchParams);
    return fhirJson(searchsetBundle(resources, base));
  } catch (e) {
    return fhirJson(operationOutcome('error', 'exception', e instanceof Error ? e.message : 'Erreur'), 500);
  }
}
