import { body, fail, ok } from '@/lib/api';
import { activer, connecter } from '@/lib/patient/store';
import { gardePatient, ouvrirSessionPatient } from '@/lib/patient/session';
import type { TypeIdentifiant } from '@/lib/patient/identite';

export const dynamic = 'force-dynamic';

/**
 * Activation : le patient presente le code remis au guichet et choisit son
 * code personnel.
 *
 * Il est connecte dans la foulee. Lui demander de se reconnecter juste apres
 * avoir choisi son code serait le meilleur moyen de le lui faire oublier.
 */
export function POST(req: Request) {
  return gardePatient(async () => {
    const d = await body<{ type?: string; identifiant?: string; code?: string; pin?: string }>(req);

    if (d.type !== 'telephone' && d.type !== 'npi') {
      return fail('Precisez s il s agit d un numero de telephone ou d un NPI.');
    }
    if (!d.identifiant?.trim() || !d.code?.trim() || !d.pin?.trim()) {
      return fail('Identifiant, code remis a l accueil et nouveau code sont requis.');
    }

    const type = d.type as TypeIdentifiant;
    const a = activer({ type, identifiant: d.identifiant, code: d.code, pin: d.pin });
    if (!a.ok) return fail(a.motif);

    const c = connecter({ type, identifiant: d.identifiant, pin: d.pin });
    if (!c.ok) return fail(c.motif, 401);

    await ouvrirSessionPatient(c.resultat.token);
    return ok({ active: true });
  });
}
