'use client';

import { useCallback, useEffect, useState } from 'react';
import { ROLE_LABELS, canValidateRole, type Role } from '@/lib/auth/roles';

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: 'pending' | 'active' | 'suspended' | 'rejected';
  organization_id: string | null;
  license_number: string | null;
  phone: string | null;
  last_login_at: string | null;
  created_at: string;
  rejection_reason: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-warn-soft text-warn',
  active: 'bg-ok-soft text-ok',
  suspended: 'bg-danger-soft text-danger',
  rejected: 'bg-paper text-ink-soft',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'en attente',
  active: 'actif',
  suspended: 'suspendu',
  rejected: 'refuse',
};

export function UserManager({
  actorRole,
  organizations,
  scoped,
}: {
  actorRole: Role;
  organizations: { id: string; name: string }[];
  scoped: string | null;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState('pending');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [creating, setCreating] = useState(false);

  const orgName = (id: string | null) => organizations.find((o) => o.id === id)?.name ?? '—';

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/users${filter ? `?status=${filter}` : ''}`);
    const data = await res.json();
    if (res.ok) setUsers(data.users ?? []);
    else setMessage({ tone: 'error', text: data.error });
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(user: AdminUser, status: string) {
    let reason: string | undefined;
    if (status === 'rejected') {
      reason = window.prompt('Motif du refus (communique au demandeur) ?') ?? undefined;
      if (!reason?.trim()) return;
    }
    setBusy(user.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({ tone: 'ok', text: `${user.full_name} : compte ${STATUS_LABEL[status]}.` });
      load();
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setBusy(null);
    }
  }

  async function resetPassword(user: AdminUser) {
    if (!window.confirm(`Generer un nouveau mot de passe provisoire pour ${user.full_name} ?`)) return;
    setBusy(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetPassword: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({
        tone: 'ok',
        text: `Mot de passe provisoire de ${user.full_name} : ${data.temporaryPassword} — transmettez-le de vive voix, il ne sera plus affiche.`,
      });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {[
            ['pending', 'En attente'],
            ['active', 'Actifs'],
            ['suspended', 'Suspendus'],
            ['rejected', 'Refuses'],
            ['', 'Tous'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                filter === value ? 'bg-brand text-white' : 'bg-white text-ink-soft hover:bg-paper'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="btn-primary btn-sm ml-auto" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Fermer' : '+ Creer un compte'}
        </button>
      </div>

      {creating && (
        <CreateUser
          actorRole={actorRole}
          organizations={organizations}
          scoped={scoped}
          onDone={(text) => {
            setMessage({ tone: 'ok', text });
            setCreating(false);
            load();
          }}
        />
      )}

      {message && (
        <p
          className={`rounded-lg border p-3 text-sm ${
            message.tone === 'ok' ? 'border-ok bg-ok-soft text-ok' : 'border-danger bg-danger-soft text-danger'
          }`}
        >
          {message.text}
        </p>
      )}

      {users.length === 0 ? (
        <p className="card-pad text-sm text-ink-soft">Aucun compte dans cette vue.</p>
      ) : (
        <ul className="card divide-y divide-line">
          {users.map((u) => {
            const actionable = canValidateRole(actorRole, u.role);
            return (
              <li key={u.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {u.full_name}
                      <span className={`chip ml-2 ${STATUS_STYLE[u.status]}`}>{STATUS_LABEL[u.status]}</span>
                    </p>
                    <p className="text-xs text-ink-soft">
                      {u.email} · {ROLE_LABELS[u.role]} · {orgName(u.organization_id)}
                      {u.license_number ? ` · n° ${u.license_number}` : ''}
                    </p>
                    <p className="text-[11px] text-ink-soft">
                      demande du {u.created_at.slice(0, 10)}
                      {u.last_login_at ? ` · derniere connexion ${u.last_login_at.slice(0, 16)}` : ' · jamais connecte'}
                    </p>
                    {u.rejection_reason && (
                      <p className="mt-1 text-xs text-danger">Motif du refus : {u.rejection_reason}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {!actionable ? (
                      <span className="chip bg-paper text-ink-soft">hors de votre perimetre</span>
                    ) : (
                      <>
                        {u.status !== 'active' && (
                          <button className="btn-primary btn-sm" disabled={busy === u.id} onClick={() => act(u, 'active')}>
                            Valider
                          </button>
                        )}
                        {u.status === 'pending' && (
                          <button className="btn-ghost btn-sm" disabled={busy === u.id} onClick={() => act(u, 'rejected')}>
                            Refuser
                          </button>
                        )}
                        {u.status === 'active' && (
                          <button className="btn-ghost btn-sm" disabled={busy === u.id} onClick={() => act(u, 'suspended')}>
                            Suspendre
                          </button>
                        )}
                        <button className="btn-ghost btn-sm" disabled={busy === u.id} onClick={() => resetPassword(u)}>
                          Reinitialiser le mot de passe
                        </button>
                        <a className="btn-ghost btn-sm" href={`/admin/droits?compte=${u.id}`}>
                          Droits
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CreateUser({
  actorRole,
  organizations,
  scoped,
  onDone,
}: {
  actorRole: Role;
  organizations: { id: string; name: string }[];
  scoped: string | null;
  onDone: (message: string) => void;
}) {
  const creatable = (['medecin', 'hopital', 'ministere', 'admin', 'super_admin'] as Role[]).filter((r) =>
    canValidateRole(actorRole, r),
  );
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    role: creatable[0] ?? 'medecin',
    organizationId: scoped ?? '',
    phone: '',
    licenseNumber: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onDone(
        `Compte cree pour ${form.fullName}. Mot de passe provisoire : ${data.temporaryPassword} — transmettez-le de vive voix, il ne sera plus affiche.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card-pad grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <h3 className="section-title">Nouveau compte</h3>
        <p className="mt-1 text-xs text-ink-soft">
          Le mot de passe est genere par la plateforme et devra etre change a la premiere connexion.
        </p>
      </div>
      <div>
        <label className="label">Nom complet *</label>
        <input className="input" required value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
      </div>
      <div>
        <label className="label">Adresse e-mail *</label>
        <input className="input" type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} />
      </div>
      <div>
        <label className="label">Role</label>
        <select className="input" value={form.role} onChange={(e) => set('role', e.target.value)}>
          {creatable.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Organisation</label>
        <select
          className="input"
          value={form.organizationId}
          disabled={Boolean(scoped)}
          onChange={(e) => set('organizationId', e.target.value)}
        >
          <option value="">— aucune —</option>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Telephone</label>
        <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
      </div>
      <div>
        <label className="label">Numero d ordre</label>
        <input className="input" value={form.licenseNumber} onChange={(e) => set('licenseNumber', e.target.value)} />
      </div>
      {error && <p className="sm:col-span-2 rounded-lg bg-danger-soft p-2 text-sm text-danger">{error}</p>}
      <div className="sm:col-span-2">
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Creation...' : 'Creer le compte'}
        </button>
      </div>
    </form>
  );
}
