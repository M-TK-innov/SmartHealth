import { ok } from '@/lib/api';
import { fermerSessionPatient, gardePatient } from '@/lib/patient/session';

export const dynamic = 'force-dynamic';

export function POST() {
  return gardePatient(async () => {
    await fermerSessionPatient();
    return ok({ deconnecte: true });
  });
}
