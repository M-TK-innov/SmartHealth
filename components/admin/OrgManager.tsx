'use client';

import { useCallback, useEffect, useState } from 'react';
import { ORG_TYPE_LABELS, type OrgType } from '@/lib/auth/roles';

interface Org {
  id: string;
  type: OrgType;
  name: string;
  code: string | null;
  region: string | null;
  status: 'pending' | 'active' | 'suspended' | 'rejected';
  created_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-warn-soft text-warn',
  active: 'bg-ok-soft text-ok',
  suspended: 'bg-danger-soft text-danger',
  rejected: 'bg-paper text-ink-soft',
};

export function OrgManager({ canWrite }: { canWrite: boolean }) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState({ name: '', type: 'health-center', code: '', region: '' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/organizations');
    const data = await res.json();
    if (res.ok) setOrgs(data.organizations ?? []);
    else setMessage({ tone: 'error', text: data.error });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setStatus(org: Org, status: string) {
    setBusy(org.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/organizations/${org.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({ tone: 'ok', text: `${org.name} : ${status}.` });
      load();
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setBusy(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy('create');
    try {
      const res = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({ tone: 'ok', text: `${form.name} creee et activee.` });
      setForm({ name: '', type: 'health-center', code: '', region: '' });
      setCreating(false);
      load();
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setBusy(null);
    }
  }

  const pending = orgs.filter((o) => o.status === 'pending');

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <button className="btn-primary btn-sm" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Fermer' : '+ Nouvelle organisation'}
          </button>
        </div>
      )}

      {creating && (
        <form onSubmit={create} className="card-pad grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Nom *</label>
            <input className="input" required value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="health-center">Centre de sante</option>
              <option value="hospital">Hopital</option>
              <option value="ministry">Ministere</option>
            </select>
          </div>
          <div>
            <label className="label">Code officiel</label>
            <input className="input" value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Departement / region</label>
            <input className="input" value={form.region}
              onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <button className="btn-primary" disabled={busy === 'create'}>Creer</button>
          </div>
        </form>
      )}

      {message && (
        <p className={`rounded-lg border p-3 text-sm ${
          message.tone === 'ok' ? 'border-ok bg-ok-soft text-ok' : 'border-danger bg-danger-soft text-danger'
        }`}>{message.text}</p>
      )}

      {pending.length > 0 && (
        <p className="rounded-lg border border-warn bg-warn-soft p-3 text-sm">
          <strong>{pending.length}</strong> organisation(s) en attente de validation. Tant qu une organisation n est
          pas active, aucun medecin ne peut s y rattacher.
        </p>
      )}

      <ul className="card divide-y divide-line">
        {orgs.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {o.name}
                <span className={`chip ml-2 ${STATUS_STYLE[o.status]}`}>{o.status}</span>
              </p>
              <p className="text-xs text-ink-soft">
                {ORG_TYPE_LABELS[o.type]}
                {o.code ? ` · code ${o.code}` : ''}
                {o.region ? ` · ${o.region}` : ''}
              </p>
              <p className="text-[11px] text-ink-soft">créée le {o.created_at.slice(0, 10)} · {o.id}</p>
            </div>
            {canWrite && (
              <div className="flex flex-wrap gap-1.5">
                {o.status !== 'active' && (
                  <button className="btn-primary btn-sm" disabled={busy === o.id} onClick={() => setStatus(o, 'active')}>
                    Activer
                  </button>
                )}
                {o.status === 'active' && (
                  <button className="btn-ghost btn-sm" disabled={busy === o.id} onClick={() => setStatus(o, 'suspended')}>
                    Suspendre
                  </button>
                )}
                {o.status === 'pending' && (
                  <button className="btn-ghost btn-sm" disabled={busy === o.id} onClick={() => setStatus(o, 'rejected')}>
                    Refuser
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {orgs.length === 0 && <p className="card-pad text-sm text-ink-soft">Aucune organisation.</p>}
    </div>
  );
}
