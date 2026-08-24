import { body, currentPractitioner, fail, ok } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { getPrescription, getPrescriptionItems, validatePrescription } from '@/lib/repo';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Validation medicale de l'ordonnance.
 *
 * C'est le seul point du systeme qui transforme une proposition de l'IA en
 * prescription opposable. Sans cet appel, aucune ordonnance ne peut etre
 * imprimee, transmise a une pharmacie ni exportee comme MedicationRequest actif.
 */
export function POST(req: Request, ctx: Ctx) {
  return guarded(async () => {
    await apiRequire('prescription:validate');
    const { id } = await ctx.params;
    const prescription = getPrescription(id);
    if (!prescription) return fail('Ordonnance introuvable', 404);

    const practitioner = await currentPractitioner();
    if (!practitioner) return fail("Votre compte n'est pas rattache a une fiche praticien : seule une personne habilitee a prescrire peut valider une ordonnance.", 403);

    const { note, overrideJustification } = await body<{ note?: string; overrideJustification?: string }>(req);

    try {
      const validated = validatePrescription({ prescriptionId: id, practitioner, note, overrideJustification });
      return ok({
        prescription: validated,
        items: getPrescriptionItems(id),
        safetyAlerts: JSON.parse(validated.safety_json || '[]'),
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Validation impossible', 409);
    }
  });
}
