import { body, fail, ok } from '@/lib/api';
import { apiAuth } from '@/lib/auth/guard';
import { authPatient } from '@/lib/patient/session';
import { rendezVousParSalle, salleUtilisable } from '@/lib/rdv/store';
import { deposer, relever, serveursGlace, type RoleSignal } from '@/lib/teleconsultation/signal';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ salle: string }> };

/**
 * Signalisation de la consultation a distance.
 *
 * DEUX SESSIONS DIFFERENTES ENTRENT ICI, et c'est ce qui rend cette route
 * particuliere. Le praticien porte un cookie de soignant ; le patient porte
 * le sien, qui n'a ni role ni permission. Aucune des deux gardes habituelles
 * ne suffit seule : `apiRequire` rejetterait le patient, `gardePatient`
 * rejetterait le praticien.
 *
 * ON NE CHOISIT PAS LE ROLE : ON LE CONSTATE. Le client ne l'annonce jamais —
 * il suffirait alors de se declarer praticien pour recevoir ce que le
 * praticien doit lire. Le role se deduit de la session presentee, et chacune
 * est verifiee contre LE RENDEZ-VOUS de cette salle :
 *
 *   - le praticien doit etre celui du rendez-vous, ou appartenir a son
 *     etablissement ;
 *   - le patient doit porter ce dossier dans sa session.
 *
 * Et la salle doit etre utilisable : consentie, a l'heure, non annulee. Un
 * jeton note d'avance ne vaut donc rien hors de son creneau.
 */
async function identifier(salle: string): Promise<
  | { ok: true; role: RoleSignal }
  | { ok: false; code: number; motif: string }
> {
  const rdv = rendezVousParSalle(salle);
  // Meme reponse pour une salle inconnue et une salle fermee : distinguer les
  // deux confirmerait l'existence d'un jeton a qui le devine.
  if (!rdv || !salleUtilisable(rdv)) {
    return { ok: false, code: 404, motif: 'Salle introuvable ou fermee.' };
  }

  const patient = await authPatient();
  if (patient) {
    const sien = patient.dossiers.some((d) => d.patient_id === rdv.patient_id);
    if (!sien) return { ok: false, code: 404, motif: 'Salle introuvable ou fermee.' };
    return { ok: true, role: 'patient' };
  }

  try {
    const auth = await apiAuth();
    const memeEtablissement =
      rdv.organization_id === null || auth.user.organization_id === rdv.organization_id;
    const estLePraticien = auth.user.practitioner_id === rdv.practitioner_id;
    if (!estLePraticien && !memeEtablissement) {
      return { ok: false, code: 404, motif: 'Salle introuvable ou fermee.' };
    }
    return { ok: true, role: 'praticien' };
  } catch {
    return { ok: false, code: 401, motif: 'Session requise.' };
  }
}

/** Releve ce que l'autre pair a depose depuis le curseur. */
export async function GET(req: Request, ctxParam: Ctx) {
  const { salle } = await ctxParam.params;
  const qui = await identifier(salle);
  if (!qui.ok) return fail(qui.motif, qui.code);

  const depuis = Number(new URL(req.url).searchParams.get('depuis') ?? 0);
  const { messages, curseur } = relever(salle, qui.role, Number.isFinite(depuis) ? depuis : 0);
  return ok({ role: qui.role, messages, curseur, serveurs: serveursGlace() });
}

/** Depose une offre, une reponse ou un candidat a l'intention de l'autre pair. */
export async function POST(req: Request, ctxParam: Ctx) {
  const { salle } = await ctxParam.params;
  const qui = await identifier(salle);
  if (!qui.ok) return fail(qui.motif, qui.code);

  const d = await body<{ charge?: unknown }>(req);
  if (d.charge === undefined) return fail('Rien a transmettre.');

  const seq = deposer(salle, qui.role, d.charge);
  return ok({ seq, role: qui.role });
}
