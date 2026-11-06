import { body, fail, ok } from '@/lib/api';
import { apiRequire, guarded, organizationFilter } from '@/lib/auth/guard';
import { noterRapportProduit, rapportDuMois } from '@/lib/interop/rapport-store';
import { fuseauDe } from '@/lib/localisation-store';
import { jourCivil } from '@/lib/temps';

export const dynamic = 'force-dynamic';

/**
 * Enregistre qu'un rapport mensuel a ete produit, donc une ressaisie evitee.
 *
 * LE CLIENT NE DIT PAS COMBIEN. Il annonce un mois ; le serveur recalcule le
 * rapport depuis la base et compte lui-meme les lignes. Un compteur alimente
 * par ce que le navigateur veut bien declarer est un compteur declaratif, et
 * le premier chiffre qu'on en tirerait serait indefendable.
 *
 * Le mois en cours est refuse : il est incomplet par construction, et
 * l'enregistrer comme produit ferait compter deux fois la meme periode.
 */
export function POST(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('export:read');
    const data = await body<{ annee?: number; mois?: number }>(req);

    const annee = Number(data.annee);
    const mois = Number(data.mois);
    if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) {
      return fail('Annee invalide.');
    }
    if (!Number.isInteger(mois) || mois < 1 || mois > 12) {
      return fail('Mois invalide.');
    }

    const fuseau = ctx.user.organization_id ? fuseauDe(ctx.user.organization_id) : undefined;
    const [anneeCourante, moisCourant] = jourCivil(new Date(), fuseau).split('-').map(Number);
    if (annee > anneeCourante || (annee === anneeCourante && mois >= moisCourant)) {
      return fail(
        "Ce mois n'est pas termine. Attendez sa cloture : un rapport produit sur un mois en cours est incomplet.",
      );
    }

    const organizationId = organizationFilter(ctx);
    const rapport = rapportDuMois({ organizationId, annee, mois });
    const note = noterRapportProduit(rapport, organizationId);

    return ok({
      enregistre: note,
      lignes: rapport.lignes.length,
      retenus: rapport.retenus,
    });
  });
}
