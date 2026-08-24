import { body, currentPractitioner, fail, ok } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { audit, insert, nowIso, run, tx, uid, update } from '@/lib/db';
import { getPrescription, getPrescriptionItems, recomputeSafety } from '@/lib/repo';
import { findDrug } from '@/lib/terminology/formulary';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

interface ItemIn {
  drug_name: string;
  atc_code?: string | null;
  form?: string | null;
  strength?: string | null;
  dose?: string | null;
  route?: string | null;
  frequency?: string | null;
  frequency_per_day?: number | null;
  duration_days?: number | null;
  quantity?: string | null;
  instructions?: string | null;
  substitution_allowed?: boolean;
  ai_confidence?: number | null;
  ai_rationale?: string | null;
  edited_by_clinician?: boolean;
}

export function GET(_req: Request, ctx: Ctx) {
  return guarded(async () => {
    await apiRequire('consultation:read');
    const { id } = await ctx.params;
    const prescription = getPrescription(id);
    if (!prescription) return fail('Ordonnance introuvable', 404);
    return ok({
      prescription,
      items: getPrescriptionItems(id),
      safetyAlerts: JSON.parse(prescription.safety_json || '[]'),
    });
  });
}

/** Edition des lignes par le medecin : possible uniquement tant que l'ordonnance est en brouillon. */
export function PATCH(req: Request, ctx: Ctx) {
  return guarded(async () => {
    await apiRequire('consultation:write');
    const { id } = await ctx.params;
    const prescription = getPrescription(id);
    if (!prescription) return fail('Ordonnance introuvable', 404);
    if (prescription.status !== 'draft') {
      return fail('Ordonnance deja validee : creez-en une nouvelle plutot que de modifier celle-ci.', 409);
    }

    const data = await body<{ items?: ItemIn[]; notes?: string }>(req);
    if (data.items) {
      const invalid = data.items.find((i) => !i.drug_name?.trim());
      if (invalid) return fail('Chaque ligne doit porter un nom de medicament.');

      tx(() => {
        run('DELETE FROM prescription_item WHERE prescription_id = ?', [id]);
        data.items!.forEach((i, idx) => {
          const def = findDrug(i.drug_name);
          insert('prescription_item', {
            id: uid(),
            prescription_id: id,
            seq: idx + 1,
            drug_name: i.drug_name.trim(),
            atc_code: i.atc_code ?? def?.atc ?? null,
            form: i.form ?? null,
            strength: i.strength ?? null,
            dose: i.dose ?? null,
            route: i.route ?? 'oral',
            frequency: i.frequency ?? null,
            frequency_per_day: i.frequency_per_day ?? null,
            duration_days: i.duration_days ?? null,
            quantity: i.quantity ?? null,
            instructions: i.instructions ?? null,
            substitution_allowed: i.substitution_allowed === false ? 0 : 1,
            is_essential_list: def?.essential ? 1 : 0,
            ai_confidence: i.ai_confidence ?? null,
            ai_rationale: i.ai_rationale ?? null,
            edited_by_clinician: i.edited_by_clinician ? 1 : 0,
            created_at: nowIso(),
          });
        });
      });
    }
    if (data.notes !== undefined) update('prescription', id, { notes: data.notes, updated_at: nowIso() });

    const safetyAlerts = recomputeSafety(id);
    return ok({ prescription: getPrescription(id), items: getPrescriptionItems(id), safetyAlerts });
  });
}

/** Annulation de l'ordonnance (jamais de suppression : tracabilite medico-legale). */
export function DELETE(req: Request, ctx: Ctx) {
  return guarded(async () => {
    await apiRequire('prescription:validate');
    const { id } = await ctx.params;
    const prescription = getPrescription(id);
    if (!prescription) return fail('Ordonnance introuvable', 404);
    const { reason } = await body<{ reason?: string }>(req);
    const actor = await currentPractitioner();

    update('prescription', id, {
      status: 'cancelled',
      cancelled_reason: reason ?? 'Annulee par le praticien',
      updated_at: nowIso(),
    });
    audit({
      action: 'update',
      entity: 'prescription',
      entityId: id,
      patientId: prescription.patient_id,
      actorId: actor?.id,
      actorLabel: actor ? `Dr ${actor.given_name} ${actor.family_name}` : undefined,
      detail: { operation: 'annulation', reason: reason ?? null },
    });
    return ok({ prescription: getPrescription(id) });
  });
}
