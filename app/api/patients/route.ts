import { body, currentPractitioner, fail, handle, ok } from '@/lib/api';
import { createPatient, getPatient, listPatients } from '@/lib/repo';
import type { Patient } from '@/lib/types';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return handle(() => {
    const q = new URL(req.url).searchParams.get('q') ?? '';
    return ok({ patients: listPatients(q) });
  });
}

export function POST(req: Request) {
  return handle(async () => {
    const data = await body<Partial<Patient>>(req);
    if (!data.given_name?.trim() || !data.family_name?.trim()) {
      return fail('Le prenom et le nom sont obligatoires.');
    }
    const id = createPatient(data);
    currentPractitioner(req);
    return ok({ patient: getPatient(id) }, { status: 201 });
  });
}
