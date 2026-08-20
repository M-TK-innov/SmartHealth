import { body, currentPractitioner, fail, handle, ok } from '@/lib/api';
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
  return handle(async () => {
    const { id } = await ctx.params;
    const patient = getPatient(id);
    if (!patient) return fail('Patient introuvable', 404);
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
  return handle(async () => {
    const { id } = await ctx.params;
    if (!getPatient(id)) return fail('Patient introuvable', 404);
    const data = await body<Partial<Patient>>(req);
    delete (data as { id?: string }).id;
    updatePatient(id, data, currentPractitioner(req));
    return ok({ patient: getPatient(id) });
  });
}
