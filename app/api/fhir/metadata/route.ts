import { fhirJson } from '@/lib/api';
import { capabilityStatement } from '@/lib/fhir';

export const dynamic = 'force-dynamic';

/** GET /api/fhir/metadata - CapabilityStatement (point d'entree standard FHIR). */
export function GET() {
  return fhirJson(capabilityStatement());
}
