import { body, currentPractitioner, fail, ok } from '@/lib/api';
import { apiRequire, assertSameOrganization, guarded, organizationFilter } from '@/lib/auth/guard';
import { createConsultation, getConsultation, getPatient, listConsultations } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('consultation:read');
    const patientId = new URL(req.url).searchParams.get('patientId') ?? undefined;
    return ok({ consultations: listConsultations(patientId, organizationFilter(ctx)) });
  });
}

export function POST(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('consultation:write');
    const { patientId, reason } = await body<{ patientId?: string; reason?: string }>(req);
    if (!patientId) return fail('patientId est obligatoire.');
    const patient = getPatient(patientId);
    if (!patient) return fail('Patient introuvable', 404);
    assertSameOrganization(ctx, patient.organization_id);

    const practitioner = await currentPractitioner();
    if (!practitioner) return fail("Votre compte n'est pas rattache a une fiche praticien : il ne peut pas ouvrir de consultation.", 403);

    const id = createConsultation(patientId, practitioner.id, reason, organizationFilter(ctx) ?? patient.organization_id);
    return ok({ consultation: getConsultation(id) }, { status: 201 });
  });
}
