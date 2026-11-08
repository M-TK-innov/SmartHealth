import { fail, ok } from '@/lib/api';
import { apiPatient, gardePatient } from '@/lib/patient/session';
import { consentirADistance, rendezVousParId } from '@/lib/rdv/store';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * L'accord du patient pour une consultation a distance.
 *
 * LE CONTROLE TIENT EN UNE LIGNE, et c'est la meme que partout dans l'espace
 * patient : le rendez-vous doit porter un dossier RATTACHE A LA SESSION. Un
 * identifiant glisse dans l'adresse ne donne donc rien — la faille la plus
 * banale de ce genre d'espace n'a pas de prise ici.
 *
 * L'accord se demande AVANT que la video ne s'ouvre. Apres, il ne vaut plus
 * rien : on ne demande pas a quelqu'un s'il accepte d'etre filme une fois la
 * camera allumee.
 */
export function POST(_req: Request, ctxParam: Ctx) {
  return gardePatient(async () => {
    const session = await apiPatient();
    const { id } = await ctxParam.params;

    const rdv = rendezVousParId(id);
    if (!rdv) return fail('Rendez-vous introuvable.', 404);

    const siens = session.dossiers.some((d) => d.patient_id === rdv.patient_id);
    // Meme reponse que pour un rendez-vous inexistant : distinguer les deux
    // dirait a qui tatonne que ce numero existe bel et bien.
    if (!siens) return fail('Rendez-vous introuvable.', 404);

    const decision = consentirADistance(id);
    if (!decision.ok) return fail(decision.motif, 409);

    return ok({
      consentementLe: decision.resultat.consentement_le,
      // La salle ne part PAS d'ici. Elle est servie par la page, au moment
      // d'entrer, et seulement si l'heure est venue : un jeton remis a
      // l'avance est un jeton qui circule.
    });
  });
}
