import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Hachage des mots de passe.
 *
 * scrypt du module `node:crypto` : fonction de derivation lente et couteuse en
 * memoire, recommandee par l'OWASP et disponible sans dependance externe —
 * l'application doit rester installable sur un poste hors-ligne.
 *
 * Un sel aleatoire par compte empeche les tables precalculees, et la
 * comparaison en temps constant evite de fuiter le hash par mesure du temps
 * de reponse.
 */

const KEY_LENGTH = 64;
// cout memoire ~64 Mo : dissuasif pour une attaque hors-ligne, imperceptible
// a la connexion. Volontairement modere pour rester tenable sur un mini-PC.
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };

export interface PasswordHash {
  hash: string;
  salt: string;
  algo: string;
}

export function hashPassword(password: string): PasswordHash {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password.normalize('NFKC'), salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return { hash: derived.toString('hex'), salt, algo: 'scrypt' };
}

export function verifyPassword(password: string, stored: PasswordHash): boolean {
  if (!stored?.hash || !stored?.salt) return false;
  if (stored.algo && stored.algo !== 'scrypt') return false;
  try {
    const derived = scryptSync(password.normalize('NFKC'), stored.salt, KEY_LENGTH, SCRYPT_OPTIONS);
    const expected = Buffer.from(stored.hash, 'hex');
    if (expected.length !== derived.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ robustesse

export interface PasswordPolicy {
  minLength: number;
  requireMixed: boolean;
}

/** Mots de passe trop previsibles pour etre acceptes, meme s'ils sont longs. */
const FORBIDDEN = [
  'motdepasse',
  'password',
  'azerty',
  'qwerty',
  '123456',
  'parledocteur',
  'medecin',
  'docteur',
  'admin',
];

export function checkPasswordStrength(password: string, policy: PasswordPolicy): string[] {
  const problems: string[] = [];
  const value = password ?? '';

  if (value.length < policy.minLength) {
    problems.push(`Le mot de passe doit compter au moins ${policy.minLength} caracteres.`);
  }
  if (policy.requireMixed) {
    if (!/[a-z]/.test(value)) problems.push('Ajoutez au moins une minuscule.');
    if (!/[A-Z]/.test(value)) problems.push('Ajoutez au moins une majuscule.');
    if (!/[0-9]/.test(value)) problems.push('Ajoutez au moins un chiffre.');
  }
  const lower = value.toLowerCase();
  if (FORBIDDEN.some((f) => lower.includes(f))) {
    problems.push('Ce mot de passe contient un terme trop previsible.');
  }
  return problems;
}

/** Mot de passe provisoire lisible, remis a un compte cree par un administrateur. */
export function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(14);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  // garantit la presence des trois classes exigees par la politique par defaut
  return `${out.slice(0, 6)}-${out.slice(6, 10)}-${out.slice(10)}9Aa`;
}
