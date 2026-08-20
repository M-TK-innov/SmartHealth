import { body, currentPractitioner, fail, handle, ok } from '@/lib/api';
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
  return handle(async () => {
    const { id } = await ctx.params;
    const prescription = getPrescription(id);
    if (!prescription) return fail('Ordonnance introuvable', 404);

    const practitioner = currentPractitioner(req);
    if (!practitioner) return fail('Aucun praticien identifie : validation impossible.', 401);

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
