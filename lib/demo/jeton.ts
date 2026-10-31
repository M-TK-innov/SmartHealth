import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Jeton de session signe, pour la DEMONSTRATION EN LIGNE uniquement.
 *
 * POURQUOI IL EXISTE
 *
 * En ligne, la base de demonstration vit en memoire : c'est le seul mode qui
 * tienne sur une plateforme sans disque. Or chaque route y est servie par une
 * fonction distincte, avec sa propre memoire. La session ecrite en base par
 * `/api/auth/login` n'existe donc dans aucune autre fonction : on se connecte,
 * et la page suivante renvoie a l'ecran de connexion. Deterministe, et
 * impossible a corriger en gardant une session portee par une ligne de base.
 *
 * Ici, le cookie se suffit a lui-meme : il porte l'identite et une signature.
 * Aucune lecture de session n'est necessaire — le compte, lui, existe a
 * l'identique dans chaque instance, puisque le jeu de demonstration est seme
 * au demarrage.
 *
 * CE QUE CELA COUTE, ET POURQUOI C'EST ACCEPTABLE ICI SEULEMENT
 *
 * Une session qui ne s'appuie sur aucune ligne ne peut plus etre REVOQUEE
 * cote serveur : couper l'acces d'un compte compromis avant l'expiration du
 * jeton devient impossible. Sur des dossiers reels, ce serait disqualifiant.
 * Sur des donnees fictives remises a zero, c'est un compromis assume.
 *
 * C'est pourquoi l'appelant doit verrouiller ce chemin au mode demonstration.
 * Le module, lui, n'en sait rien : il signe et il verifie. Un module pur ne
 * decide pas des politiques, il les rend verifiables.
 *
 * FORME DU JETON
 *
 *   <charge utile base64url>.<signature base64url>
 *
 * La charge utile est `<identifiant>|<expiration ISO>`. Elle est lisible par
 * quiconque, et c'est voulu : rien d'y cacher, tout a y verifier.
 */

const SEPARATEUR = '.';
const SEPARATEUR_CHARGE = '|';

function signature(charge: string, secret: string): string {
  return createHmac('sha256', secret).update(charge).digest('base64url');
}

/** Encode une chaine en base64url, sans remplissage. */
function encoder(valeur: string): string {
  return Buffer.from(valeur, 'utf8').toString('base64url');
}

function decoder(valeur: string): string | null {
  try {
    return Buffer.from(valeur, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Signe un jeton.
 *
 * Refuse un secret vide : un HMAC sans secret est une signature que n'importe
 * qui peut recalculer, et le refus vaut mieux qu'une securite de facade.
 */
export function signerJeton(
  args: { identifiant: string; expireLe: string },
  secret: string,
): string {
  if (!secret) throw new Error('Secret de signature absent.');
  if (!args.identifiant) throw new Error('Identifiant absent.');
  if (args.identifiant.includes(SEPARATEUR_CHARGE)) {
    // Sans cela, un identifiant contenant le separateur deplacerait la
    // frontiere avec l'expiration : on lirait une date comme une identite.
    throw new Error('Identifiant invalide.');
  }
  const charge = `${args.identifiant}${SEPARATEUR_CHARGE}${args.expireLe}`;
  return `${encoder(charge)}${SEPARATEUR}${signature(charge, secret)}`;
}

/**
 * Verifie un jeton et rend l'identifiant qu'il porte, ou `null`.
 *
 * L'instant est un PARAMETRE : la peremption se teste comme elle s'execute.
 */
export function verifierJeton(
  jeton: string | null | undefined,
  secret: string,
  instant: Date,
): { identifiant: string; expireLe: string } | null {
  if (!jeton || !secret) return null;

  const morceaux = jeton.split(SEPARATEUR);
  if (morceaux.length !== 2) return null;

  const [chargeEncodee, fournie] = morceaux;
  const charge = decoder(chargeEncodee);
  if (!charge) return null;

  const attendue = signature(charge, secret);

  // Comparaison a duree constante : une comparaison ordinaire s'arrete au
  // premier octet different, et ce temps de reponse se mesure.
  const a = Buffer.from(fournie, 'utf8');
  const b = Buffer.from(attendue, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const separation = charge.indexOf(SEPARATEUR_CHARGE);
  if (separation <= 0) return null;

  const identifiant = charge.slice(0, separation);
  const expireLe = charge.slice(separation + 1);

  const fin = new Date(expireLe);
  if (!Number.isFinite(fin.getTime())) return null;
  if (fin.getTime() <= instant.getTime()) return null;

  return { identifiant, expireLe };
}
