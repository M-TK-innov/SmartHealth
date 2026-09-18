import { audit } from '@/lib/db';
import { body, currentPractitioner, fail, ok } from '@/lib/api';
import { apiRequire, assertSameOrganization, guarded } from '@/lib/auth/guard';
import { buildExport, logExport, type ExportFormat } from '@/lib/interop/build';
import { getConsultation } from '@/lib/repo';
import { blockingReason, resolveEndpoint } from '@/lib/net/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Transmission vers un systeme d'information tiers.
 *
 * La destination vient de la configuration de la structure — page
 * Administration > Reseau et serveurs, a defaut les variables d'environnement
 * historiques. Jamais d'une adresse fournie dans la requete : le client
 * choisirait alors ou partent les dossiers.
 *
 * Elle est de plus re-evaluee a chaque envoi. Une destination declaree reste
 * enregistree, mais cesse d'etre utilisable si la configuration devient non
 * conforme entre-temps : autorisation de transfert retiree, territoire de
 * residence modifie, certificat non verifie. Un flux de sante ne continue pas
 * de partir parce qu'il avait ete accepte un jour.
 */
export function POST(req: Request, ctx: Ctx) {
  return guarded(async () => {
    const authCtx = await apiRequire('export:send');
    const { id } = await ctx.params;
    const consultation = getConsultation(id);
    if (!consultation) return fail('Consultation introuvable', 404);
    assertSameOrganization(authCtx, consultation.organization_id);

    const { format = 'fhir-transaction' } = await body<{ format?: ExportFormat }>(req);
    const isDhis2 = format === 'dhis2-event';
    const category = isDhis2 ? 'dhis2' : 'fhir';

    const resolved = resolveEndpoint(category);
    let endpoint = resolved?.endpoint.url ?? null;
    let token = resolved?.secret ?? null;

    if (!endpoint) {
      // Une destination existe mais la configuration la refuse : le dire, plutot
      // que d'annoncer qu'aucune n'est configuree. L'administrateur chercherait
      // au mauvais endroit.
      const reason = blockingReason(category);
      if (reason) return fail(`Transmission refusee par la configuration reseau. ${reason}`, 412);

      endpoint = isDhis2
        ? (process.env.DHIS2_BASE_URL && `${process.env.DHIS2_BASE_URL.replace(/\/$/, '')}/api/tracker`) || null
        : process.env.FHIR_EXPORT_ENDPOINT || null;
      token = isDhis2 ? (process.env.DHIS2_TOKEN ?? null) : (process.env.FHIR_EXPORT_TOKEN ?? null);
    }

    if (!endpoint) {
      return fail(
        'Aucune destination declaree pour ce format. Ajoutez le serveur dans Administration > Reseau et serveurs.',
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

      const actor = await currentPractitioner();
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
