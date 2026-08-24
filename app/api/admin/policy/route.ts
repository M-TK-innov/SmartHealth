import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { getPolicy, updatePolicy, type AccessPolicy } from '@/lib/auth/store';

export const dynamic = 'force-dynamic';

export function GET() {
  return guarded(async () => {
    await apiRequire('policy:manage');
    return NextResponse.json({ policy: getPolicy() });
  });
}

/** Bornes volontairement strictes : la console ne doit pas pouvoir affaiblir
 *  la plateforme au-dela de ce qui reste defendable pour des donnees de sante. */
const BOUNDS: Record<string, [number, number]> = {
  password_min_length: [8, 64],
  session_hours: [1, 24],
  max_failed_attempts: [3, 20],
  lockout_minutes: [1, 1440],
};

export function PATCH(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('policy:manage');
    const data = await body<Partial<AccessPolicy>>(req);

    for (const [key, [min, max]] of Object.entries(BOUNDS)) {
      const value = data[key as keyof AccessPolicy];
      if (value === undefined) continue;
      const n = Number(value);
      if (!Number.isFinite(n) || n < min || n > max) {
        return NextResponse.json({ error: `${key} doit etre compris entre ${min} et ${max}.` }, { status: 400 });
      }
    }

    return NextResponse.json({ policy: updatePolicy(data, ctx.user) });
  });
}
