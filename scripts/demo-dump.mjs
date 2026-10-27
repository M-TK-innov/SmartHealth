/**
 * Produit le jeu de demonstration embarque.
 *
 *   npm run demo:dump
 *
 * Seme une base temporaire avec le jeu de donnees habituel, puis la vide
 * dans un module TypeScript que l'application peut charger en memoire.
 *
 * POURQUOI UN MODULE ET NON UN FICHIER .sql : sur une plateforme sans
 * disque — Vercel — seuls les fichiers que le bundler a traces arrivent
 * jusqu'a la fonction. Un module importe est trace par construction ; un
 * fichier lu au chemin peut manquer a l'execution, et la demonstration
 * s'ouvrirait sur une base vide sans que rien ne l'explique.
 *
 * POURQUOI DES HORODATAGES RELATIFS : un vidage fige les dates. Trois
 * semaines plus tard, la demonstration montrerait un patient qui attend
 * depuis 31 680 minutes. Chaque date devient donc un jeton resolu au
 * chargement — voir lib/demo/horodatage.ts.
 */

import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enJeton } from '../lib/demo/horodatage.ts';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dossier = mkdtempSync(path.join(os.tmpdir(), 'pd-demo-'));
const basePath = path.join(dossier, 'demo.db');

/**
 * Tables jamais vidées.
 *
 * Les sessions ouvertes n'ont aucun sens dans une demonstration : elles
 * donneraient a chaque visiteur la session de celui qui a produit le
 * vidage. Le journal d'audit non plus — il se remplira de lui-meme, et
 * c'est plus parlant.
 */
const EXCLUES = new Set(['user_session', 'sqlite_sequence']);

console.log('Semis de la base de demonstration...');
execFileSync(
  process.execPath,
  ['--experimental-strip-types', path.join(racine, 'scripts', 'seed.mjs'), '--reset'],
  { env: { ...process.env, SMARTHEALTH_DB: basePath }, stdio: 'pipe' },
);

const db = new DatabaseSync(basePath, { readOnly: true });
const reference = new Date();

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
  .all()
  .map((r) => r.name)
  .filter((n) => !n.startsWith('sqlite_') && !EXCLUES.has(n));

const lignes = [];
let total = 0;

for (const table of tables) {
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) continue;

  lignes.push(`-- ${table} (${rows.length})`);
  for (const row of rows) {
    const colonnes = Object.keys(row);
    const valeurs = colonnes.map((c) => litteral(row[c], c));
    lignes.push(`INSERT INTO ${table} (${colonnes.join(', ')}) VALUES (${valeurs.join(', ')});`);
    total += 1;
  }
  lignes.push('');
}

db.close();
rmSync(dossier, { recursive: true, force: true });

/** Une valeur SQL, avec les dates transformees en jetons relatifs. */
function litteral(v, colonne) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (v instanceof Uint8Array) return `X'${Buffer.from(v).toString('hex')}'`;
  const texte = enJeton(String(v), reference, colonne);
  return `'${texte.replace(/'/g, "''")}'`;
}

const sql = lignes.join('\n');

// Le SQL part dans un litteral de gabarit : on neutralise donc le
// backslash, le backtick et la sequence ${, sans quoi une note clinique
// contenant l'un d'eux casserait le module genere.
const echappe = sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const module = `/**
 * Jeu de demonstration — FICHIER GENERE, ne pas modifier a la main.
 *
 *   npm run demo:dump
 *
 * Produit par scripts/demo-dump.mjs a partir de scripts/seed.mjs, qui
 * reste la seule source de verite. Les horodatages sont des jetons
 * relatifs resolus au chargement : voir lib/demo/horodatage.ts.
 *
 * ${total} lignes, ${tables.length} tables.
 */

export const DONNEES_DEMO = \`
${echappe}
\`;
`;

mkdirSync(path.join(racine, 'lib', 'demo'), { recursive: true });
const sortie = path.join(racine, 'lib', 'demo', 'donnees.ts');
writeFileSync(sortie, module, 'utf8');

const jetons = (sql.match(/\{\{[TD][+-]\d+\}\}/g) ?? []).length;
console.log(`Ecrit : ${path.relative(racine, sortie)}`);
console.log(`  ${total} lignes sur ${tables.length} tables`);
console.log(`  ${jetons} horodatages rendus relatifs`);
console.log(`  ${Math.round(sql.length / 1024)} Ko de SQL`);
