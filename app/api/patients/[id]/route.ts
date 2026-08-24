import { body, fail, ok } from '@/lib/api';
import { apiRequire, assertSameOrganization, guarded } from '@/lib/auth/guard';
import { currentPractitioner } from '@/lib/api';
import {
  getAllergies,
  getMedicationStatements,
  getObservations,
  getPatient,
  getPatientPrescriptions,
  getProblems,
  listConsultations,
  updatePatient,
} from '@/lib/repo';
import type { Patient } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export function GET(_req: Request, ctx: Ctx) {
  return guarded(async () => {
    const auth = await apiRequire('patient:read');
    const { id } = await ctx.params;
    const patient = getPatient(id);
    if (!patient) return fail('Patient introuvable', 404);
    assertSameOrganization(auth, patient.organization_id);
    return ok({
      patient,
      problems: getProblems(id),
      allergies: getAllergies(id),
      medications: getMedicationStatements(id),
      observations: getObservations(id),
      consultations: listConsultations(id),
      prescriptions: getPatientPrescriptions(id),
    });
  });
}

export function PATCH(req: Request, ctx: Ctx) {
  return guarded(async () => {
    const auth = await apiRequire('patient:write');
    const { id } = await ctx.params;
    const existing = getPatient(id);
    if (!existing) return fail('Patient introuvable', 404);
    assertSameOrganization(auth, existing.organization_id);
    const data = await body<Partial<Patient>>(req);
    delete (data as { id?: string }).id;
    updatePatient(id, data, await currentPractitioner());
    return ok({ patient: getPatient(id) });
  });
}
