'use client';

import { useCallback, useEffect, useState } from 'react';
import { ROLE_LABELS, type Role } from '@/lib/auth/roles';

interface Policy {
  password_min_length: number;
  password_require_mixed: number;
  session_hours: number;
  max_failed_attempts: number;
  lockout_minutes: number;
  allow_self_registration: number;
  require_admin_validation: number;
  updated_at: string;
}

interface Session {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: Role;
  created_at: string;
  expires_at: string;
  last_seen_at: string | null;
  ip: string | null;
  user_agent: string | null;
}

export function AccessPanel({ canManagePolicy }: { canManagePolicy: boolean }) {
  return (
    <div className="space-y-5">
      {canManagePolicy && <PolicyForm />}
      <SessionList />
    </div>
  );
}

function PolicyForm() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/policy')
      .then((r) => r.json())
      .then((d) => setPolicy(d.policy ?? null))
      .catch(() => undefined);
  }, []);

  async function save(patch: Partial<Policy>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/policy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPolicy(data.policy);
      setMessage({ tone: 'ok', text: "Politique d acces mise a jour." });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setBusy(false);
    }
  }

  if (!policy) return <p className="card-pad text-sm text-ink-soft">Chargement de la politique...</p>;

  const numbers: [keyof Policy, string, string][] = [
    ['password_min_length', 'Longueur minimale du mot de passe', 'entre 8 et 64 caracteres'],
    ['session_hours', 'Duree de session (heures)', 'entre 1 et 24 — une garde ne devrait pas depasser une session'],
    ['max_failed_attempts', 'Tentatives avant verrouillage', 'entre 3 et 20'],
    ['lockout_minutes', 'Duree du verrouillage (minutes)', 'entre 1 et 1440'],
  ];

  const switches: [keyof Policy, string, string][] = [
    ['password_require_mixed', 'Exiger majuscule, minuscule et chiffre', 'refuse les mots de passe trop simples'],
    ['allow_self_registration', 'Autoriser l inscription libre', 'sinon les comptes sont crees par un administrateur'],
    [
      'require_admin_validation',
      'Exiger une validation administrateur',
      'a desactiver uniquement sur une instance de demonstration',
    ],
  ];

  return (
    <section className="card-pad">
      <h2 className="section-title mb-1">Politique d acces</h2>
      <p className="mb-4 text-xs text-ink-soft">
        Derniere modification : {policy.updated_at}. Ces reglages s appliquent immediatement a toute la plateforme.
      </p>

      {message && (
        <p
          className={`mb-3 rounded-lg border p-3 text-sm ${
            message.tone === 'ok' ? 'border-ok bg-ok-soft text-ok' : 'border-danger bg-danger-soft text-danger'
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {numbers.map(([key, label, hint]) => (
          <div key={key}>
            <label className="label">{label}</label>
            <input
              type="number"
              className="input"
              defaultValue={policy[key] as number}
              disabled={busy}
              onBlur={(e) => {
                const value = Number(e.target.value);
                if (value !== policy[key]) save({ [key]: value } as Partial<Policy>);
              }}
            />
            <p className="mt-0.5 text-[11px] text-ink-soft">{hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {switches.map(([key, label, hint]) => (
          <label key={key} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
              checked={policy[key] === 1}
              disabled={busy}
              onChange={(e) => save({ [key]: e.target.checked ? 1 : 0 } as Partial<Policy>)}
            />
            <span>
              <strong>{label}</strong>
              <span className="block text-[11px] text-ink-soft">{hint}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

function SessionList() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/sessions');
    const data = await res.json();
    if (res.ok) {
      setSessions(data.sessions ?? []);
      setCurrentUserId(data.currentUserId ?? '');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(s: Session) {
    if (!window.confirm(`Fermer la session de ${s.full_name} ? La personne sera deconnectee immediatement.`)) return;
    setBusy(s.id);
    await fetch(`/api/admin/sessions/${s.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'revoquee depuis la console' }),
    });
    setBusy(null);
    load();
  }

  return (
    <section className="card">
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <div>
          <h2 className="section-title">Sessions actives ({sessions.length})</h2>
          <p className="text-[11px] text-ink-soft">Poste perdu, depart d un agent, incident : fermez la session ici.</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={load}>
          Rafraichir
        </button>
      </header>

      {sessions.length === 0 ? (
        <p className="p-5 text-sm text-ink-soft">Aucune session active.</p>
      ) : (
        <ul className="divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {s.full_name}
                  {s.user_id === currentUserId && <span className="chip ml-2 bg-brand-soft text-brand-dark">vous</span>}
                </p>
                <p className="text-xs text-ink-soft">
                  {s.email} · {ROLE_LABELS[s.role]} · {s.ip ?? 'IP inconnue'}
                </p>
                <p className="text-[11px] text-ink-soft">
                  ouverte {s.created_at} · expire {s.expires_at}
                  {s.last_seen_at ? ` · vue ${s.last_seen_at}` : ''}
                </p>
              </div>
              <button className="btn-ghost btn-sm" disabled={busy === s.id} onClick={() => revoke(s)}>
                Fermer la session
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
