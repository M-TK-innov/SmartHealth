import { body, fail, ok } from '@/lib/api';
import { apiRequire, guarded, organizationFilter } from '@/lib/auth/guard';
import { createPatient, getPatient, listPatients } from '@/lib/repo';
import type { Patient } from '@/lib/types';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('patient:read');
    const q = new URL(req.url).searchParams.get('q') ?? '';
    // cloisonnement : un etablissement ne liste que ses propres dossiers
    return ok({ patients: listPatients(q, organizationFilter(ctx)) });
  });
}

export function POST(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('patient:write');
    const data = await body<Partial<Patient>>(req);
    if (!data.given_name?.trim() || !data.family_name?.trim()) {
      return fail('Le prenom et le nom sont obligatoires.');
    }
    // le dossier appartient a l etablissement qui le cree
    const id = createPatient({ ...data, organization_id: organizationFilter(ctx) ?? data.organization_id });
    return ok({ patient: getPatient(id) }, { status: 201 });
  });
}
