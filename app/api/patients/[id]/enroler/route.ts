import { body, fail, ok } from '@/lib/api';
import { apiRequire, assertSameOrganization, guarded } from '@/lib/auth/guard';
import { get } from '@/lib/db';
import { enroler, HEURES_CODE } from '@/lib/patient/store';
import type { TypeIdentifiant } from '@/lib/patient/identite';

export const dynamic = 'force-dynamic';

/**
 * Ouvre l'acces d'un patient a son propre dossier, depuis le guichet.
 *
 * POURQUOI CELA PASSE PAR UN AGENT
 *
 * C'est le seul moment ou l'identite est verifiee par un humain qui a la
 * personne devant lui. Un rattachement errone donne acces au dossier de
 * quelqu'un d'autre, et aucune verification automatique ne remplace un
 * regard sur une piece d'identite.
 *
 * Le code en clair n'est rendu QU'ICI, une seule fois, pour etre remis au
 * patient. Il n'est stocke nulle part en clair.
 */
export function POST(req: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  return guarded(async () => {
    const ctx = await apiRequire('patient:write');
    const { id } = await ctxRoute.params;

    const patient = get<{ id: string; organization_id: string | null }>(
      'SELECT id, organization_id FROM patient WHERE id = ?',
      [id],
    );
    if (!patient) return fail('Dossier introuvable.', 404);
    assertSameOrganization(ctx, patient.organization_id);

    const d = await body<{ type?: string; identifiant?: string }>(req);
    if (d.type !== 'telephone' && d.type !== 'npi') {
      return fail('Precisez telephone ou npi.');
    }
    if (!d.identifiant?.trim()) return fail('Identifiant requis.');

    const r = enroler({
      patientId: id,
      type: d.type as TypeIdentifiant,
      identifiant: d.identifiant,
      organizationId: patient.organization_id,
      parUserId: ctx.user.id,
    });
    if (!r.ok) return fail(r.motif);

    return ok({
      code: r.resultat.code,
      expireLe: r.resultat.expireLe,
      heures: HEURES_CODE,
      nouveauCompte: r.resultat.nouveau,
    });
  });
}
