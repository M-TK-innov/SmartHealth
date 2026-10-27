import { NextResponse } from 'next/server';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { tableauOccupation } from '@/lib/hopital/store';

export const dynamic = 'force-dynamic';

/**
 * Tableau d'occupation des unites de soins.
 *
 * C'est le chiffre sur lequel un cadre decide d'ouvrir une place ou de
 * refuser une admission. Les lits hors service sont retires du denominateur :
 * les compter ferait paraitre une unite saturee moins pleine qu'elle ne l'est.
 */
export function GET() {
  return guarded(async () => {
    const ctx = await apiRequire('patient:read');
    const unites = tableauOccupation(ctx.user.organization_id ?? null);

    const utilisables = unites.reduce((n, u) => n + (u.total - u.horsService), 0);
    const occupes = unites.reduce((n, u) => n + u.occupes, 0);

    return NextResponse.json({
      unites,
      ensemble: {
        litsUtilisables: utilisables,
        occupes,
        libres: unites.reduce((n, u) => n + u.libres, 0),
        aPreparer: unites.reduce((n, u) => n + u.aPreparer, 0),
        horsService: unites.reduce((n, u) => n + u.horsService, 0),
        tauxOccupation: utilisables === 0 ? 0 : Math.round((occupes / utilisables) * 100),
      },
    });
  });
}
