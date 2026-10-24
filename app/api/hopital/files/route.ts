import { NextResponse } from 'next/server';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { tableauTension } from '@/lib/hopital/flux-store';

export const dynamic = 'force-dynamic';

/**
 * Tension de tous les postes : l'etat du flux a l'instant ou on le regarde.
 *
 * Deux chiffres portent la decision d'ouvrir un poste de renfort :
 * l'attente mediane, et le nombre de patients PARTIS sans avoir ete vus.
 * Le second est le plus direct, et c'est celui qu'un indicateur d'activite
 * classique efface en comptant les passages termines.
 */
export function GET() {
  return guarded(async () => {
    const ctx = await apiRequire('flux:read');
    const postes = tableauTension(ctx.user.organization_id ?? null);

    return NextResponse.json({
      postes,
      ensemble: {
        enAttente: postes.reduce((n, p) => n + p.enAttente, 0),
        enCours: postes.reduce((n, p) => n + p.enCours, 0),
        partis: postes.reduce((n, p) => n + p.partis, 0),
        attenteMaxMinutes: postes.reduce((n, p) => Math.max(n, p.attenteMaxMinutes), 0),
      },
    });
  });
}
