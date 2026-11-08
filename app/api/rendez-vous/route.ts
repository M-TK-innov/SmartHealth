import { body, fail, ok } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { journeeDe, poserRendezVous } from '@/lib/rdv/store';
import { nowIso } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Le planning d'un praticien pour une journee.
 *
 * `consultation:read` et non `flux:read` : savoir qui un praticien voit dans
 * la journee, c'est connaitre les patients qu'il recoit. L'accueil a besoin
 * d'y acceder, et il a ce droit ; le ministere ne l'a pas, et c'est voulu.
 */
export function GET(req: Request) {
  return guarded(async () => {
    await apiRequire('consultation:read');
    const url = new URL(req.url);
    const praticien = url.searchParams.get('praticien');
    if (!praticien) return fail('Indiquez le praticien dont vous voulez le planning.');
    const jour = url.searchParams.get('jour') ?? nowIso().slice(0, 10);
    return ok({ jour, praticien, rendezVous: journeeDe(praticien, jour) });
  });
}

/**
 * Pose un rendez-vous.
 *
 * `flux:write` : c'est le droit de placer et d'orienter un patient, et poser
 * un rendez-vous en releve. L'accueil le fait, le medecin aussi. Celui qui ne
 * peut pas orienter un patient n'a pas a lui fixer une date.
 *
 * Un refus rend 409 avec son motif : le creneau est pris, la date est passee,
 * la duree est hors bornes. L'agent d'accueil doit pouvoir corriger sans
 * appeler l'informatique.
 */
export function POST(req: Request) {
  return guarded(async () => {
    const auth = await apiRequire('flux:write');
    const d = await body<{
      patientId?: string;
      practitionerId?: string;
      mode?: string;
      motif?: string;
      debut?: string;
      dureeMin?: number;
    }>(req);

    if (!d.patientId?.trim()) return fail('Dossier patient requis.');
    if (!d.practitionerId?.trim()) return fail('Praticien requis.');
    if (d.mode !== 'presentiel' && d.mode !== 'distance') {
      return fail('Precisez si le rendez-vous a lieu sur place ou a distance.');
    }
    if (!d.debut?.trim()) return fail('Date et heure requises.');

    const decision = poserRendezVous(
      {
        patientId: d.patientId,
        practitionerId: d.practitionerId,
        organizationId: auth.user.organization_id ?? null,
        mode: d.mode,
        motif: d.motif?.trim() || null,
        debut: d.debut,
        dureeMin: Number(d.dureeMin ?? 20),
      },
      { id: auth.user.id, label: auth.user.full_name, organizationId: auth.user.organization_id },
    );

    if (!decision.ok) return fail(decision.motif, 409);
    return ok({ rendezVous: decision.resultat }, { status: 201 });
  });
}
