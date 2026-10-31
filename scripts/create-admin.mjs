/**
 * Cree le premier super-administrateur d'une installation.
 *
 *   node scripts/create-admin.mjs --email admin@hopital.bj --nom "Prenom Nom"
 *   node scripts/create-admin.mjs --email ... --nom ... --motdepasse "..."
 *
 * A utiliser sur une base vierge en production, la ou `npm run seed` n'a pas
 * sa place : le seed installe des comptes de demonstration avec un mot de
 * passe connu, ce script cree un compte unique avec un mot de passe genere et
 * affiche une seule fois.
 *
 * Tous les autres comptes se creent ensuite depuis la console.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { FICHIER_ANCIEN, FICHIER_COURANT, choisirBase, reglage } from '../lib/heritage.ts';
import { SCHEMA_SQL } from '../lib/schema.ts';
import { hashPassword, checkPasswordStrength, generateTemporaryPassword } from '../lib/auth/password.ts';
import { DEFAULT_ROLE_PERMISSIONS, ROLES } from '../lib/auth/roles.ts';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const email = arg('email')?.trim().toLowerCase();
const fullName = arg('nom')?.trim();
let password = arg('motdepasse');

if (!email || !fullName) {
  console.error('Usage : node scripts/create-admin.mjs --email <adresse> --nom "<Prenom Nom>" [--motdepasse <...>]');
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error('Adresse e-mail invalide.');
  process.exit(1);
}

/**
 * Meme resolution que l'application, et pour la meme raison : un script
 * qui calcule son chemin dans son coin seme ou purge une AUTRE base que
 * celle que le serveur ouvre. On l'a vu — une base de demonstration
 * creee a cote de la vraie, que le serveur a aussitot preferee parce
 * qu'elle portait le nom courant.
 */
const DB_PATH =
  reglage('DB', process.env) ??
  choisirBase(
    path.join(process.cwd(), 'data', `${FICHIER_COURANT}.db`),
    path.join(process.cwd(), 'data', `${FICHIER_ANCIEN}.db`),
    existsSync,
  ).chemin;
mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(SCHEMA_SQL);

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

const existing = db.prepare('SELECT id FROM user_account WHERE lower(email) = ?').get(email);
if (existing) {
  console.error(`Un compte existe deja avec ${email}.`);
  process.exit(1);
}

// Politique et matrice de droits, si la base est vierge.
db.prepare('INSERT OR IGNORE INTO access_policy (id, updated_at) VALUES (1, ?)').run(now());
for (const role of ROLES) {
  for (const permission of DEFAULT_ROLE_PERMISSIONS[role]) {
    db.prepare('INSERT OR IGNORE INTO role_permission (role, permission) VALUES (?, ?)').run(role, permission);
  }
}

// Organisation « plateforme », a laquelle se rattachent les comptes d'administration.
let platform = db.prepare("SELECT id FROM organization WHERE type = 'platform'").get();
if (!platform) {
  const id = randomUUID();
  db.prepare(
    'INSERT INTO organization (id, type, name, code, country, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, 'platform', 'SmartHealth', 'PD-PLATFORM', process.env.FACILITY_COUNTRY || 'BJ', 'active', now(), now());
  platform = { id };
}

const generated = !password;
if (generated) password = generateTemporaryPassword();

const policy = db.prepare('SELECT * FROM access_policy WHERE id = 1').get();
const problems = checkPasswordStrength(password, {
  minLength: policy.password_min_length,
  requireMixed: policy.password_require_mixed === 1,
});
if (problems.length) {
  console.error('Mot de passe refuse : ' + problems.join(' '));
  process.exit(1);
}

const { hash, salt, algo } = hashPassword(password);
const userId = randomUUID();
db.prepare(
  `INSERT INTO user_account
     (id, email, password_hash, password_salt, password_algo, password_changed_at, full_name,
      role, organization_id, status, must_change_password, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, 'super_admin', ?, 'active', ?, ?, ?)`,
).run(userId, email, hash, salt, algo, now(), fullName, platform.id, generated ? 1 : 0, now(), now());

db.prepare(
  'INSERT INTO audit_log (id, at, actor_label, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
).run(randomUUID(), now(), 'create-admin', 'create', 'user_account', userId, `super-administrateur ${email}`);

console.log('Super-administrateur cree.');
console.log(`  base    : ${DB_PATH}`);
console.log(`  adresse : ${email}`);
if (generated) {
  console.log(`  mot de passe provisoire : ${password}`);
  console.log('  Il devra etre change a la premiere connexion. Cette ligne ne sera plus affichee.');
}
