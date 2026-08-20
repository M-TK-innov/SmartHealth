import { body, currentPractitioner, fail, handle, ok } from '@/lib/api';
import { createConsultation, getConsultation, getPatient, listConsultations } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return handle(() => {
    const patientId = new URL(req.url).searchParams.get('patientId') ?? undefined;
    return ok({ consultations: listConsultations(patientId) });
  });
}

export function POST(req: Request) {
  return handle(async () => {
    const { patientId, reason } = await body<{ patientId?: string; reason?: string }>(req);
    if (!patientId) return fail('patientId est obligatoire.');
    if (!getPatient(patientId)) return fail('Patient introuvable', 404);
    const id = createConsultation(patientId, currentPractitioner(req)?.id, reason);
    return ok({ consultation: getConsultation(id) }, { status: 201 });
  });
}
