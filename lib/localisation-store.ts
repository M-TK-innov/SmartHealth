/**
 * Le fuseau de l'etablissement, retenu une fois pour toutes.
 *
 * LA PLATEFORME SE LOCALISE SEULE : au premier besoin, elle lit le fuseau
 * de la machine qui la sert et l'inscrit sur l'organisation. Personne ne
 * le saisit a l'installation.
 *
 * POURQUOI L'INSCRIRE plutot que le relire a chaque fois : parce qu'un
 * fuseau qui change sous les pieds de l'application change la journee.
 * Un serveur migre, une image systeme reconstruite avec un autre fuseau,
 * et du jour au lendemain les files, le programme operatoire et les
 * peremptions se decalent — sans que rien ne le signale. Inscrit, il se
 * compare ; detecte a la volee, il se subit.
 *
 * Le reglage SMARTHEALTH_FUSEAU l'emporte, pour le cas ou la machine
 * n'est pas dans l'etablissement : serveur mutualise, demonstration
 * servie depuis un centre de donnees lointain.
 */

import { get, run } from './db.ts';
import { reglage } from './heritage.ts';
import { fuseauMachine } from './temps.ts';
import { fuseauValide, resoudreFuseau, type Localisation } from './localisation.ts';

/** Cache par organisation : le fuseau ne change pas en cours d'execution. */
const cache = new Map<string, Localisation>();

/**
 * Le fuseau de l'etablissement.
 *
 * Sans organisation — scripts, amorcage, mode demonstration — on rend ce
 * que la machine declare, sans rien inscrire : il n'y a pas d'etablissement
 * a qui l'attribuer.
 */
export function localisation(organizationId: string | null): Localisation {
  const impose = reglage('FUSEAU', process.env);
  if (fuseauValide(impose)) return { fuseau: impose as string, source: 'configure' };

  if (!organizationId) return resoudreFuseau({ detecte: fuseauMachine() });

  const connu = cache.get(organizationId);
  if (connu) return connu;

  const ligne = get<{ fuseau: string | null }>('SELECT fuseau FROM organization WHERE id = ?', [
    organizationId,
  ]);

  const resolu = resoudreFuseau({
    configure: ligne?.fuseau ?? null,
    detecte: fuseauMachine(),
  });

  // Premiere fois : on inscrit ce qu'on a detecte, pour que la journee de
  // l'etablissement cesse de dependre de la machine qui le sert.
  if (ligne && !fuseauValide(ligne.fuseau) && resolu.source === 'detecte') {
    run('UPDATE organization SET fuseau = ? WHERE id = ?', [resolu.fuseau, organizationId]);
  }

  cache.set(organizationId, resolu);
  return resolu;
}

/** Raccourci : le seul fuseau, pour les appels qui n'ont pas besoin du reste. */
export function fuseauDe(organizationId: string | null): string {
  return localisation(organizationId).fuseau;
}

/**
 * Change le fuseau de l'etablissement.
 *
 * Reserve a la console d'administration : il deplace la frontiere de la
 * journee pour tout le monde, donc il ne se change pas depuis un ecran de
 * soin.
 */
export function definirFuseau(organizationId: string, fuseau: string): boolean {
  if (!fuseauValide(fuseau)) return false;
  run('UPDATE organization SET fuseau = ?, updated_at = ? WHERE id = ?', [
    fuseau,
    new Date().toISOString(),
    organizationId,
  ]);
  cache.delete(organizationId);
  return true;
}

/** Oublie ce qui a ete retenu — utile aux tests et apres un changement. */
export function oublierLocalisation(): void {
  cache.clear();
}
