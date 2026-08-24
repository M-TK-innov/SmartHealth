import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SCHEMA_SQL } from './schema';

/**
 * Acces SQLite via le module natif `node:sqlite` (Node >= 22.5).
 * Aucune dependance native a compiler : l'application s'installe sur un poste
 * hors-ligne ou sur un mini-serveur de dispensaire sans chaine de build C++.
 *
 * L'emplacement de la base suit la plateforme :
 *   - serveur web / developpement : ./data/parledocteur.db
 *   - application desktop         : dossier de donnees utilisateur, transmis
 *                                   par le processus principal Electron.
 * Dans les deux cas PARLEDOCTEUR_DB a la priorite.
 */

const DB_PATH = process.env.PARLEDOCTEUR_DB || path.join(process.cwd(), 'data', 'parledocteur.db');

type GlobalWithDb = typeof globalThis & { __parledocteurDb?: DatabaseSync };
const g = globalThis as GlobalWithDb;

function open(): DatabaseSync {
  const dir = path.dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const database = new DatabaseSync(DB_PATH);
  database.exec(SCHEMA_SQL);
  migrate(database);
  return database;
}

/**
 * Migrations additives.
 *
 * `CREATE TABLE IF NOT EXISTS` ne touche pas une table deja creee : une base
 * installee avant l'ajout d'une colonne ne l'aurait jamais. On ajoute donc
 * explicitement les colonnes manquantes. Uniquement des ajouts : on ne
 * supprime ni ne renomme rien dans une base de dossiers medicaux.
 */
function migrate(database: DatabaseSync) {
  const columns = (table: string): string[] => {
    try {
      return (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    } catch {
      return [];
    }
  };

  const additions: [table: string, column: string, definition: string][] = [
    ['patient', 'organization_id', 'TEXT'],
    ['consultation', 'organization_id', 'TEXT'],
  ];

  for (const [table, column, definition] of additions) {
    const existing = columns(table);
    if (existing.length && !existing.includes(column)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}

export const databasePath = () => DB_PATH;

export function db(): DatabaseSync {
  if (!g.__parledocteurDb) g.__parledocteurDb = open();
  return g.__parledocteurDb;
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
