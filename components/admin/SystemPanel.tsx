'use client';

import { useCallback, useEffect, useState } from 'react';

const octets = (n: number) => {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} o`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} Ko`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} Mo`;
  return `${(n / 1024 ** 3).toFixed(2)} Go`;
};

const duree = (s: number) => {
  const j = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return j > 0 ? `${j} j ${h} h` : h > 0 ? `${h} h ${m} min` : `${m} min`;
};

export function SystemPanel({ canManageServer }: { canManageServer: boolean }) {
  return (
    <div className="space-y-5">
      <DatabaseCard />
      {canManageServer && <ServerCard />}
    </div>
  );
}

// ---------------------------------------------------------------- base

interface DbInfo {
  file: string;
  size: number;
  walSize: number;
  journalMode: string;
  pageSize: number;
  pageCount: number;
  freelist: number;
  counts: { table: string; rows: number }[];
  backups: { name: string; size: number }[];
  backupDirectory: string;
  engine: string;
}

function DatabaseCard() {
  const [info, setInfo] = useState<DbInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/database');
    const data = await res.json();
    if (res.ok) setInfo(data);
    else setResult({ tone: 'error', text: data.error });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action: string, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(action);
    setResult(null);
    try {
      const res = await fetch('/api/admin/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult({
        tone: data.ok === false ? 'error' : 'ok',
        text: data.message + (data.results && data.ok === false ? ` (${data.results.join(' | ')})` : ''),
      });
      load();
    } catch (e) {
      setResult({ tone: 'error', text: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setBusy(null);
    }
  }

  if (!info) return <p className="card-pad text-sm text-ink-soft">Lecture de la base...</p>;

  return (
    <section className="card-pad">
      <h2 className="section-title mb-3">Base de donnees</h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Taille', octets(info.size)],
          ['Journal WAL', octets(info.walSize)],
          ['Mode journal', String(info.journalMode)],
          ['Pages libres', `${info.freelist} / ${info.pageCount}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line p-3">
            <div className="text-xs text-ink-soft">{label}</div>
            <div className="text-lg font-bold">{value}</div>
          </div>
        ))}
      </div>

      <p className="mt-2 break-all text-[11px] text-ink-soft">
        {info.engine} — <code>{info.file}</code>
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-ghost btn-sm" disabled={busy !== null} onClick={() => run('integrity')}>
          {busy === 'integrity' ? 'Verification...' : "Verifier l integrite"}
        </button>
        <button
          className="btn-ghost btn-sm"
          disabled={busy !== null}
          onClick={() => run('vacuum', 'Compacter la base ? L operation peut prendre quelques secondes.')}
        >
          {busy === 'vacuum' ? 'Compactage...' : 'Compacter (VACUUM)'}
        </button>
        <button className="btn-ghost btn-sm" disabled={busy !== null} onClick={() => run('analyze')}>
          Recalculer les statistiques
        </button>
        <button className="btn-primary btn-sm" disabled={busy !== null} onClick={() => run('backup')}>
          {busy === 'backup' ? 'Sauvegarde...' : 'Sauvegarder maintenant'}
        </button>
      </div>

      {result && (
        <p
          className={`mt-3 rounded-lg border p-3 text-sm ${
            result.tone === 'ok' ? 'border-ok bg-ok-soft text-ok' : 'border-danger bg-danger-soft text-danger'
          }`}
        >
          {result.text}
        </p>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">Contenu</h3>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {info.counts.map((c) => (
              <li key={c.table} className="flex justify-between border-b border-line py-0.5">
                <span className="truncate text-ink-soft">{c.table}</span>
                <strong>{c.rows < 0 ? '—' : c.rows}</strong>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
            Sauvegardes ({info.backups.length})
          </h3>
          {info.backups.length === 0 ? (
            <p className="text-sm text-ink-soft">Aucune sauvegarde.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {info.backups.map((b) => (
                <li key={b.name} className="flex justify-between border-b border-line py-0.5">
                  <span className="truncate">{b.name}</span>
                  <span className="text-ink-soft">{octets(b.size)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 break-all text-[11px] text-ink-soft">
            Ecrites dans <code>{info.backupDirectory}</code>. Une sauvegarde contient des donnees de sante :
            copiez-la sur un support chiffre et hors de ce poste.
          </p>
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------- serveurs

interface ServerInfo {
  application: Record<string, string | boolean | null>;
  runtime: Record<string, string | number>;
  memory: Record<string, number>;
  disk: { total: number; free: number } | null;
  activity: Record<string, number>;
  integrations: { key: string; label: string; configured: boolean; detail: string; critical: boolean }[];
}

function ServerCard() {
  const [info, setInfo] = useState<ServerInfo | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/server');
    if (res.ok) setInfo(await res.json());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (!info) return <p className="card-pad text-sm text-ink-soft">Lecture du serveur...</p>;

  return (
    <section className="card-pad">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="section-title">Serveurs et integrations</h2>
        <button className="btn-ghost btn-sm" onClick={load}>
          Rafraichir
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Environnement', String(info.application.environment)],
          ['Node', String(info.runtime.node)],
          ['Actif depuis', duree(Number(info.runtime.processUptimeSeconds))],
          ['Processeurs', String(info.runtime.cpus)],
          ['Memoire du processus', octets(info.memory.rss)],
          ['Memoire systeme libre', `${octets(info.memory.systemFree)} / ${octets(info.memory.systemTotal)}`],
          ['Disque libre', info.disk ? `${octets(info.disk.free)} / ${octets(info.disk.total)}` : '—'],
          ['Sessions actives', String(info.activity.activeSessions)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line p-3">
            <div className="text-xs text-ink-soft">{label}</div>
            <div className="text-base font-bold">{value}</div>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-ink-soft">
        {String(info.runtime.platform)} · {String(info.runtime.arch)} · pid {String(info.runtime.pid)}
        {info.application.desktop ? ' · serveur embarque (application desktop)' : ''}
      </p>

      <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-ink-soft">Integrations</h3>
      <ul className="space-y-1.5">
        {info.integrations.map((i) => (
          <li
            key={i.key}
            className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${
              i.critical ? 'border-danger bg-danger-soft' : 'border-line bg-white'
            }`}
          >
            <span aria-hidden className={i.configured ? 'text-ok' : 'text-ink-soft'}>
              {i.configured ? '●' : '○'}
            </span>
            <div>
              <p className="font-medium">{i.label}</p>
              <p className="text-xs text-ink-soft">
                <code className="text-[10px]">{i.key}</code> — {i.detail}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-ink-soft">
        Seule la presence d une cle est affichee, jamais sa valeur. Ces reglages se modifient dans le fichier
        d environnement du serveur, pas depuis l interface : un secret modifiable en ligne est un secret expose.
      </p>
    </section>
  );
}
