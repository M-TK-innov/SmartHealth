import { body, fail, ok } from '@/lib/api';
import { connecter } from '@/lib/patient/store';
import { gardePatient, ouvrirSessionPatient } from '@/lib/patient/session';
import type { TypeIdentifiant } from '@/lib/patient/identite';

export const dynamic = 'force-dynamic';

/**
 * Connexion d'un patient a son espace.
 *
 * Le type d'identifiant est EXIGE du client : telephone et NPI font dix
 * chiffres tous les deux, et deviner lequel a ete saisi reviendrait a
 * chercher le dossier de quelqu'un d'autre une fois sur deux.
 */
export function POST(req: Request) {
  return gardePatient(async () => {
    const d = await body<{ type?: string; identifiant?: string; pin?: string }>(req);

    if (d.type !== 'telephone' && d.type !== 'npi') {
      return fail('Precisez s il s agit d un numero de telephone ou d un NPI.');
    }
    if (!d.identifiant?.trim() || !d.pin?.trim()) {
      return fail('Identifiant et code sont requis.');
    }

    const r = connecter({
      type: d.type as TypeIdentifiant,
      identifiant: d.identifiant,
      pin: d.pin,
      contexte: {
        ip: req.headers.get('x-forwarded-for'),
        userAgent: req.headers.get('user-agent'),
      },
    });
    if (!r.ok) return fail(r.motif, 401);

    await ouvrirSessionPatient(r.resultat.token);
    return ok({ connecte: true });
  });
}
