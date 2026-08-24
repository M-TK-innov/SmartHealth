import { all } from '@/lib/db';
import { ok } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return guarded(async () => {
    await apiRequire('audit:read');
    const params = new URL(req.url).searchParams;
    const patientId = params.get('patientId');
    const limit = Math.min(Number(params.get('limit') ?? 200), 1000);
    const rows = patientId
      ? all('SELECT * FROM audit_log WHERE patient_id = ? ORDER BY at DESC, rowid DESC LIMIT ?', [patientId, limit])
      : all('SELECT * FROM audit_log ORDER BY at DESC, rowid DESC LIMIT ?', [limit]);
    return ok({ entries: rows });
  });
}
