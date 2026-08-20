import { audit } from '@/lib/db';
import { body, currentPractitioner, fail, handle, ok } from '@/lib/api';
import { buildExport, logExport, type ExportFormat } from '@/lib/interop/build';
import { getConsultation } from '@/lib/repo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Transmission vers un systeme d'information tiers.
 *
 * L'endpoint cible est defini par la configuration de l'etablissement
 * (FHIR_EXPORT_ENDPOINT / DHIS2_BASE_URL) : on n'envoie jamais de donnees de
 * sante vers une adresse fournie dans la requete.
 */
export function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const consultation = getConsultation(id);
    if (!consultation) return fail('Consultation introuvable', 404);

    const { format = 'fhir-transaction' } = await body<{ format?: ExportFormat }>(req);
    const isDhis2 = format === 'dhis2-event';
    const endpoint = isDhis2
      ? process.env.DHIS2_BASE_URL && `${process.env.DHIS2_BASE_URL.replace(/\/$/, '')}/api/tracker`
      : process.env.FHIR_EXPORT_ENDPOINT;
    const token = isDhis2 ? process.env.DHIS2_TOKEN : process.env.FHIR_EXPORT_TOKEN;

    if (!endpoint) {
      return fail(
        `Aucune destination configuree pour ce format. Renseignez ${isDhis2 ? 'DHIS2_BASE_URL' : 'FHIR_EXPORT_ENDPOINT'} dans .env.local.`,
        412,
      );
    }

    let built;
    try {
      built = buildExport(id, format);
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Export impossible', 409);
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': built.contentType.split(';')[0],
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: built.payload,
        signal: AbortSignal.timeout(30000),
      });
      const responseText = (await res.text()).slice(0, 4000);
      logExport(id, consultation.patient_id, built, endpoint, res.ok ? 'sent' : 'failed', responseText);

      const actor = currentPractitioner(req);
      audit({
        action: 'export',
        entity: 'consultation',
        entityId: id,
        patientId: consultation.patient_id,
        actorId: actor?.id,
        actorLabel: actor ? `Dr ${actor.given_name} ${actor.family_name}` : undefined,
        detail: { format, endpoint, status: res.status },
      });

      if (!res.ok) return fail(`Le systeme distant a refuse l envoi (HTTP ${res.status}) : ${responseText}`, 502);
      return ok({ sent: true, status: res.status, response: responseText, endpoint });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erreur reseau';
      logExport(id, consultation.patient_id, built, endpoint, 'failed', message);
      return fail(`Transmission impossible : ${message}`, 502);
    }
  });
}
