import { createHmac, timingSafeEqual } from 'node:crypto';
import { reglage } from '../heritage.ts';
import { signerJeton, verifierJeton } from '../demo/jeton.ts';

/**
 * Acces au depouillement de l'enquete.
 *
 * POURQUOI PAS UN COMPTE DE LA PLATEFORME
 *
 * Les comptes de la plateforme vivent dans la base de l'etablissement, sur
 * son poste. Le depouillement, lui, est consulte depuis l'exterieur et ne
 * concerne aucun etablissement : il n'y a pas de compte a y rattacher. Une
 * cle unique, posee dans l'environnement du serveur, est ce qui correspond
 * a ce que cette page est reellement — une page a usage personnel.
 *
 * CE QUE CETTE PROTECTION VAUT, ET CE QU'ELLE NE VAUT PAS
 *
 * Elle empeche la lecture par un tiers qui tombe sur l'adresse. Elle ne
 * distingue pas deux lecteurs et ne garde aucune trace de qui a lu. C'est
 * suffisant pour des reponses anonymes a une enquete d'opinion ; ce serait
 * insuffisant pour autre chose, et ce module n'est utilise nulle part
 * ailleurs.
 *
 * LA CLE NE SIGNE PAS LE COOKIE DIRECTEMENT. Elle en derive une seconde
 * valeur par HMAC. Un meme secret employe a deux usages finit toujours par
 * voir l'un affaiblir l'autre, et la derivation coute une ligne.
 */

export const COOKIE = 'sh_enquete';
export const DUREE_HEURES = 12;

/** La cle attendue, ou `undefined` si le serveur n'en a pas. */
export function cleAttendue(): string | undefined {
  const valeur = reglage('ENQUETE_CLE', process.env);
  return valeur && valeur.length > 0 ? valeur : undefined;
}

export function refusConfiguration(): string {
  return "Depouillement ferme : la variable SMARTHEALTH_ENQUETE_CLE n'est pas posee sur le serveur.";
}

/**
 * La cle fournie est-elle la bonne ?
 *
 * Comparaison a duree constante, et longueurs egalisees au prealable :
 * `timingSafeEqual` jette quand les tailles different, et ce jet est
 * lui-meme une mesure de la longueur de la cle.
 */
export function cleValide(fournie: string | null | undefined, attendue: string | undefined): boolean {
  if (!attendue) return false;
  if (!fournie) return false;
  const a = createHmac('sha256', 'comparaison').update(fournie).digest();
  const b = createHmac('sha256', 'comparaison').update(attendue).digest();
  return timingSafeEqual(a, b);
}

/** Secret de signature du cookie, derive de la cle et distinct d'elle. */
function secretCookie(cle: string): string {
  return createHmac('sha256', cle).update('cookie-enquete-v1').digest('hex');
}

/** Jeton a poser en cookie apres une cle acceptee. */
export function ouvrirSession(cle: string, instant: Date): string {
  const expireLe = new Date(instant.getTime() + DUREE_HEURES * 3600 * 1000).toISOString();
  return signerJeton({ identifiant: 'enquete', expireLe }, secretCookie(cle));
}

/** Le cookie presente ouvre-t-il encore le depouillement ? */
export function sessionOuverte(
  jeton: string | null | undefined,
  cle: string | undefined,
  instant: Date,
): boolean {
  if (!cle) return false;
  const verdict = verifierJeton(jeton, secretCookie(cle), instant);
  return verdict?.identifiant === 'enquete';
}
