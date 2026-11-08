import { body, fail, ok } from '@/lib/api';
import { apiRequire, assertSameOrganization, guarded } from '@/lib/auth/guard';
import {
  annulerRendezVous,
  cloreTeleconsultation,
  demarrerTeleconsultation,
  rendezVousParId,
} from '@/lib/rdv/store';
import { fermer } from '@/lib/teleconsultation/signal';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Les trois gestes qui font bouger un rendez-vous : annuler, demarrer, clore.
 *
 * Une seule route, parce qu'ils partagent la meme garantie : l'etat est lu,
 * les regles de `lib/rdv/regles.ts` tranchent, et l'ecriture n'a lieu que si
 * elles ont accorde. Un refus rend 409 avec son motif.
 *
 * LES DROITS NE SONT PAS LES MEMES D'UN GESTE A L'AUTRE, et c'est le coeur de
 * la chose : l'accueil annule un rendez-vous, il ne conduit pas une
 * consultation. Verifier le droit une seule fois a l'entree de la route
 * aurait donne le plus permissif des trois a tout le monde.
 */
export function POST(req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    const { id } = await ctxParam.params;
    const d = await body<{ action?: string; motif?: string }>(req);

    const rdv = rendezVousParId(id);
    if (!rdv) return fail('Rendez-vous introuvable.', 404);

    if (d.action === 'annuler') {
      const auth = await apiRequire('flux:write');
      assertSameOrganization(auth, rdv.organization_id);
      const decision = annulerRendezVous(id, d.motif ?? null, {
        id: auth.user.id,
        label: auth.user.full_name,
      });
      if (!decision.ok) return fail(decision.motif, 409);
      // La boite de signalisation d'une salle annulee n'a plus de raison
      // d'exister : la laisser ouverte garderait en memoire la negociation
      // d'une consultation qui n'aura pas lieu.
      if (rdv.salle) fermer(rdv.salle);
      return ok({ rendezVous: decision.resultat });
    }

    if (d.action === 'demarrer') {
      // `consultation:write` : conduire une consultation a distance, c'est
      // conduire une consultation. L'infirmier d'accueil, qui peut pourtant
      // poser le rendez-vous, ne passe pas cette porte.
      const auth = await apiRequire('consultation:write');
      assertSameOrganization(auth, rdv.organization_id);
      const decision = demarrerTeleconsultation(id, {
        id: auth.user.id,
        label: auth.user.full_name,
      });
      if (!decision.ok) return fail(decision.motif, 409);
      return ok(decision.resultat);
    }

    if (d.action === 'clore') {
      const auth = await apiRequire('consultation:write');
      assertSameOrganization(auth, rdv.organization_id);
      const decision = cloreTeleconsultation(id, {
        id: auth.user.id,
        label: auth.user.full_name,
      });
      if (!decision.ok) return fail(decision.motif, 409);
      if (rdv.salle) fermer(rdv.salle);
      return ok({ rendezVous: decision.resultat });
    }

    return fail('Action inconnue : annuler, demarrer ou clore.');
  });
}
