import { audit } from '@/lib/db';
import { currentPractitioner, fail } from '@/lib/api';
import { apiRequire, assertSameOrganization, guarded } from '@/lib/auth/guard';
import { NextResponse } from 'next/server';
import { buildExport, logExport, type ExportFormat } from '@/lib/interop/build';
import { getConsultation } from '@/lib/repo';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const FORMATS: ExportFormat[] = [
  'fhir-document',
  'fhir-transaction',
  'hl7-adt',
  'hl7-oru',
  'hl7-rde',
  'hl7-orm',
  'dhis2-event',
  'markdown',
];

/** Telechargement d'un export dans le format demande. */
export function GET(req: Request, ctx: Ctx) {
  return guarded(async () => {
    const authCtx = await apiRequire('export:read');
    const { id } = await ctx.params;
    const consultation = getConsultation(id);
    if (!consultation) return fail('Consultation introuvable', 404);
    assertSameOrganization(authCtx, consultation.organization_id);

    const url = new URL(req.url);
    const format = (url.searchParams.get('format') || 'fhir-document') as ExportFormat;
    if (!FORMATS.includes(format)) return fail(`Format inconnu. Formats disponibles : ${FORMATS.join(', ')}`);
    const inline = url.searchParams.get('inline') === '1';

    let built;
    try {
      built = buildExport(id, format);
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Export impossible', 409);
    }

    logExport(id, consultation.patient_id, built);
    const actor = await currentPractitioner();
    audit({
      action: 'export',
      entity: 'consultation',
      entityId: id,
      patientId: consultation.patient_id,
      actorId: actor?.id,
      actorLabel: actor ? `Dr ${actor.given_name} ${actor.family_name}` : undefined,
      detail: { format },
    });

    return new NextResponse(built.payload, {
      headers: {
        'Content-Type': built.contentType,
        ...(inline ? {} : { 'Content-Disposition': `attachment; filename="${built.filename}"` }),
      },
    });
  });
}
