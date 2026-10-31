import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SCHEMA_SQL } from './schema';
import { appliquerMigrations } from './migrations';
import { DONNEES_DEMO } from './demo/donnees';
import { resoudre } from './demo/horodatage';
import {
  FICHIER_ANCIEN,
  FICHIER_COURANT,
  choisirBase,
  messageHeritage,
  reglage,
} from './heritage';

/**
 * Acces SQLite via le module natif `node:sqlite` (Node >= 22.5).
 * Aucune dependance native a compiler : l'application s'installe sur un poste
 * hors-ligne ou sur un mini-serveur de dispensaire sans chaine de build C++.
 *
 * L'emplacement de la base suit la plateforme :
 *   - serveur web / developpement : ./data/smarthealth.db
 *   - application desktop         : dossier de donnees utilisateur, transmis
 *                                   par le processus principal Electron.
 * Dans les deux cas la variable d'environnement a la priorite — sous son
 * nom courant ou sous celui qu'elle portait avant le renommage du produit
 * (voir lib/heritage.ts).
 */

const dossierDonnees = path.join(process.cwd(), 'data');

/**
 * Chemin de la base.
 *
 * Sans variable d'environnement, on cherche d'abord le fichier au nom
 * courant, puis celui que portait la base avant le renommage. Ouvrir
 * directement le nouveau nom laisserait une base pleine sur le disque et
 * en creerait une vide a cote : l'application demarrerait sans erreur et
 * sans aucun patient.
 */
const choix = reglage('DB', process.env)
  ? { chemin: reglage('DB', process.env)!, heritee: false }
  : choisirBase(
      path.join(dossierDonnees, `${FICHIER_COURANT}.db`),
      path.join(dossierDonnees, `${FICHIER_ANCIEN}.db`),
      existsSync,
    );

const DB_PATH = choix.chemin;

/**
 * Mode demonstration.
 *
 * La base vit EN MEMOIRE et est semee a chaque demarrage. C'est le seul
 * mode qui tienne sur une plateforme sans disque persistant — Vercel et
 * assimiles — ou un fichier ecrit par une requete a disparu a la suivante.
 *
 * Ce que cela implique, et qui doit etre dit a l'ecran plutot que decouvert
 * par un visiteur : ce qu'on saisit disparait au recyclage de l'instance,
 * et deux visiteurs servis par deux instances ne voient pas les memes
 * modifications. Une demonstration, donc, et pas un deploiement.
 */
export const MODE_DEMO = reglage('DEMO', process.env) === '1';

type GlobalWithDb = typeof globalThis & { __smarthealthDb?: DatabaseSync };
const g = globalThis as GlobalWithDb;

function open(): DatabaseSync {
  if (MODE_DEMO) return ouvrirDemo();

  const dir = path.dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Une base reprise sous son ancien nom se DIT. Un operateur qui ne sait
  // pas quel fichier sert ne saura pas lequel sauvegarder.
  if (choix.heritee) console.warn(messageHeritage(DB_PATH));

  const database = new DatabaseSync(DB_PATH);
  database.exec(SCHEMA_SQL);
  appliquerMigrations(database);
  return database;
}

function ouvrirDemo(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec(SCHEMA_SQL);
  appliquerMigrations(database);

  // Le vidage est trie par nom de table, donc un enfant y precede parfois
  // son parent. On suspend le controle des cles le temps du chargement —
  // puis on le RETABLIT et on VERIFIE. Suspendre sans verifier
  // reviendrait a parier que le vidage est coherent ; ici on le constate,
  // et un vidage casse se signale au demarrage plutot que des semaines
  // plus tard sur un ecran vide.
  database.exec('PRAGMA foreign_keys = OFF');
  try {
    // Les horodatages du vidage sont des jetons relatifs : resolus ici, la
    // demonstration est toujours « aujourd'hui », quel que soit le jour ou
    // on l'ouvre.
    database.exec(resoudre(DONNEES_DEMO));
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }

  const orphelins = database.prepare('PRAGMA foreign_key_check').all();
  if (orphelins.length > 0) {
    const tables = [...new Set(orphelins.map((o) => String((o as { table: string }).table)))];
    throw new Error(
      `Jeu de demonstration incoherent : ${orphelins.length} ligne(s) orpheline(s) sur ${tables.join(', ')}. ` +
        'Regenerer avec « npm run demo:dump ».',
    );
  }

  return database;
}

export const databasePath = () => (MODE_DEMO ? ':memory: (demonstration)' : DB_PATH);

export function db(): DatabaseSync {
  if (!g.__smarthealthDb) g.__smarthealthDb = open();
  return g.__smarthealthDb;
}

// ------------------------------------------------------------------ helpers

export type Row = Record<string, unknown>;

/** Valeurs acceptees par node:sqlite (pas de boolean ni d'undefined). */
type Bindable = string | number | bigint | null | Uint8Array;

function bind(v: unknown): Bindable {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'string') return v;
  if (v instanceof Uint8Array) return v;
  return JSON.stringify(v);
}

/**
 * `node:sqlite` renvoie des objets a prototype nul. React refuse de les
 * serialiser vers un composant client ("Only plain objects... can be passed").
 * On normalise donc ici, une fois pour toutes, plutot que dans chaque page.
 */
function plain<T>(row: unknown): T {
  return { ...(row as object) } as T;
}

export function all<T = Row>(sql: string, params: unknown[] = []): T[] {
  return (db().prepare(sql).all(...params.map(bind)) as unknown[]).map((r) => plain<T>(r));
}

export function get<T = Row>(sql: string, params: unknown[] = []): T | undefined {
  const row = db().prepare(sql).get(...params.map(bind));
  return row === undefined ? undefined : plain<T>(row);
}

export function run(sql: string, params: unknown[] = []) {
  return db().prepare(sql).run(...params.map(bind));
}

/** INSERT genere a partir d'un objet : les cles undefined sont ignorees. */
export function insert(table: string, data: Record<string, unknown>): string {
  const record = { ...data };
  if (!record.id) record.id = randomUUID();
  const keys = Object.keys(record).filter((k) => record[k] !== undefined);
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
  run(sql, keys.map((k) => record[k]));
  return String(record.id);
}

/** UPDATE partiel : seules les cles fournies (non undefined) sont ecrites. */
export function update(table: string, id: string, data: Record<string, unknown>): void {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  if (keys.length === 0) return;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
  run(sql, [...keys.map((k) => data[k]), id]);
}

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec('BEGIN');
  try {
    const out = fn();
    d.exec('COMMIT');
    return out;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export const uid = () => randomUUID();
export const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// -------------------------------------------------------------------- audit

export function audit(entry: {
  action: string;
  entity: string;
  entityId?: string;
  patientId?: string;
  actorId?: string;
  actorLabel?: string;
  detail?: string | Record<string, unknown>;
}) {
  insert('audit_log', {
    at: nowIso(),
    actor_id: entry.actorId ?? null,
    actor_label: entry.actorLabel ?? null,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    patient_id: entry.patientId ?? null,
    detail: typeof entry.detail === 'string' ? entry.detail : entry.detail ? JSON.stringify(entry.detail) : null,
  });
}
