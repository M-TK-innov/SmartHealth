import { body, currentPractitioner, fail, ok } from '@/lib/api';
import { apiRequire, assertSameOrganization, guarded } from '@/lib/auth/guard';
import { getConsultation, getPrescriptions, signConsultation } from '@/lib/repo';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Signature du compte rendu par le medecin.
 *
 * C'est l'acte qui donne au document sa valeur medico-legale et fige la
 * consultation. Une ordonnance encore en brouillon bloque la signature :
 * on n'archive pas une consultation avec une prescription non tranchee.
 */
export function POST(req: Request, routeCtx: Ctx) {
  return guarded(async () => {
    const authCtx = await apiRequire('consultation:sign');
    const { id } = await routeCtx.params;
    const consultation = getConsultation(id);
    if (!consultation) return fail('Consultation introuvable', 404);
    if (consultation.status === 'signed') return ok({ consultation });
    assertSameOrganization(authCtx, consultation.organization_id);

    const practitioner = await currentPractitioner();
    if (!practitioner) return fail("Votre compte n'est pas rattache a une fiche praticien : la signature d'un compte rendu est un acte medical.", 403);

    const drafts = getPrescriptions(id).filter((p) => p.status === 'draft');
    const { report, force } = await body<{ report?: string; force?: boolean }>(req);
    if (drafts.length && !force) {
      return fail(
        `${drafts.length} ordonnance(s) encore en brouillon. Validez-la ou annulez-la avant de signer le compte rendu.`,
        409,
      );
    }

    const signed = signConsultation(id, practitioner, report);
    return ok({ consultation: signed });
  });
}
