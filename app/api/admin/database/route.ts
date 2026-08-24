import { NextResponse } from 'next/server';
import { statSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { body } from '@/lib/api';
import { all, audit, databasePath, db, get } from '@/lib/db';
import { apiRequire, guarded } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const TABLES = [
  'organization',
  'user_account',
  'user_session',
  'practitioner',
  'patient',
  'consultation',
  'transcript_segment',
  'observation',
  'diagnosis',
  'problem',
  'allergy',
  'medication_statement',
  'service_request',
  'prescription',
  'prescription_item',
  'interop_export',
  'audit_log',
];

const sizeOf = (file: string) => (existsSync(file) ? statSync(file).size : 0);

function backupDirectory() {
  return path.join(path.dirname(databasePath()), 'sauvegardes');
}

export function GET() {
  return guarded(async () => {
    await apiRequire('database:manage');
    const file = databasePath();

    const counts = TABLES.map((t) => {
      try {
        return { table: t, rows: get<{ n: number }>(`SELECT COUNT(*) n FROM ${t}`)?.n ?? 0 };
      } catch {
        return { table: t, rows: -1 };
      }
    });

    const pragma = (sql: string) => {
      try {
        const row = get<Record<string, unknown>>(sql);
        return row ? Object.values(row)[0] : null;
      } catch {
        return null;
      }
    };

    const dir = backupDirectory();
    const backups = existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => f.endsWith('.db'))
          .map((f) => ({ name: f, size: sizeOf(path.join(dir, f)) }))
          .sort((a, b) => b.name.localeCompare(a.name))
          .slice(0, 20)
      : [];

    return NextResponse.json({
      file,
      size: sizeOf(file),
      walSize: sizeOf(`${file}-wal`),
      journalMode: pragma('PRAGMA journal_mode'),
      pageSize: pragma('PRAGMA page_size'),
      pageCount: pragma('PRAGMA page_count'),
      freelist: pragma('PRAGMA freelist_count'),
      foreignKeys: pragma('PRAGMA foreign_keys'),
      userVersion: pragma('PRAGMA user_version'),
      counts,
      backups,
      backupDirectory: dir,
      engine: 'node:sqlite (SQLite embarque)',
    });
  });
}

/**
 * Operations de maintenance.
 *
 * Aucune n'est destructive : verification d'integrite, compactage, statistiques
 * et sauvegarde. La suppression de donnees de sante ne passe pas par une API —
 * elle releve d'une procedure d'archivage legal, pas d'un bouton.
 */
export function POST(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('database:manage');
    const { action } = await body<{ action?: string }>(req);
    const database = db();

    try {
      switch (action) {
        case 'integrity': {
          const rows = all<Record<string, unknown>>('PRAGMA integrity_check');
          const results = rows.map((r) => String(Object.values(r)[0]));
          const ok = results.length === 1 && results[0] === 'ok';
          audit({
            action: 'read',
            entity: 'database',
            actorId: ctx.user.id,
            actorLabel: ctx.user.full_name,
            detail: { action, ok },
          });
          return NextResponse.json({
            ok,
            results,
            message: ok ? 'Aucune anomalie detectee.' : 'Anomalies detectees, voir le detail.',
          });
        }

        case 'vacuum': {
          const before = sizeOf(databasePath());
          database.exec('VACUUM');
          const after = sizeOf(databasePath());
          audit({
            action: 'update',
            entity: 'database',
            actorId: ctx.user.id,
            actorLabel: ctx.user.full_name,
            detail: { action, before, after },
          });
          return NextResponse.json({
            ok: true,
            before,
            after,
            message: `Base compactee : ${(before / 1024).toFixed(0)} Ko -> ${(after / 1024).toFixed(0)} Ko.`,
          });
        }

        case 'analyze': {
          database.exec('ANALYZE');
          return NextResponse.json({ ok: true, message: 'Statistiques de planification recalculees.' });
        }

        case 'backup': {
          const dir = backupDirectory();
          mkdirSync(dir, { recursive: true });
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const target = path.join(dir, `parledocteur-${stamp}.db`);
          // VACUUM INTO produit une copie coherente sans arreter le serveur.
          database.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
          audit({
            action: 'export',
            entity: 'database',
            actorId: ctx.user.id,
            actorLabel: ctx.user.full_name,
            detail: { action, target },
          });
          return NextResponse.json({
            ok: true,
            file: target,
            size: sizeOf(target),
            message: 'Sauvegarde ecrite. Copiez-la hors de ce poste : elle contient des donnees de sante.',
          });
        }

        default:
          return NextResponse.json(
            { error: 'Action inconnue. Attendu : integrity, vacuum, analyze ou backup.' },
            { status: 400 },
          );
      }
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Operation impossible.' }, { status: 500 });
    }
  });
}
