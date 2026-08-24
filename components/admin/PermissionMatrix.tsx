'use client';

import { useCallback, useEffect, useState } from 'react';
import { PERMISSIONS, PERMISSION_GROUPS, ROLES, ROLE_LABELS, type Permission, type Role } from '@/lib/auth/roles';

/**
 * Deux niveaux de reglage, dans l'ordre ou ils s'appliquent :
 *   - la matrice role -> permissions, qui vaut pour tous les comptes du role ;
 *   - la derogation individuelle, qui la corrige pour un compte precis.
 */
export function PermissionMatrix({ initialUserId }: { initialUserId?: string }) {
  const [matrix, setMatrix] = useState<Record<string, Permission[]>>({});
  const [role, setRole] = useState<Role>('medecin');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/roles');
    const data = await res.json();
    if (res.ok) setMatrix(data.matrix ?? {});
    else setMessage({ tone: 'error', text: data.error });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const current = new Set(matrix[role] ?? []);
  const locked = role === 'super_admin';

  async function toggle(permission: Permission) {
    if (locked) return;
    const next = new Set(current);
    if (next.has(permission)) next.delete(permission);
    else next.add(permission);

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, permissions: [...next] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMatrix((m) => ({ ...m, [role]: data.permissions }));
      setMessage({ tone: 'ok', text: `Droits du role « ${ROLE_LABELS[role]} » mis a jour.` });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="card-pad">
        <h2 className="section-title mb-3">Droits par role</h2>
        <div className="mb-3 flex flex-wrap gap-1">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                role === r ? 'bg-brand text-white' : 'bg-white text-ink-soft hover:bg-paper'
              }`}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>

        {locked && (
          <p className="mb-3 rounded-lg border border-warn bg-warn-soft p-3 text-sm">
            Les droits du super-administrateur sont figes. Sans ce verrou, une case decochee par erreur pourrait
            rendre la plateforme definitivement inadministrable.
          </p>
        )}

        {message && (
          <p
            className={`mb-3 rounded-lg border p-3 text-sm ${
              message.tone === 'ok' ? 'border-ok bg-ok-soft text-ok' : 'border-danger bg-danger-soft text-danger'
            }`}
          >
            {message.text}
          </p>
        )}

        <div className="space-y-4">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.label}>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">{group.label}</h3>
              <ul className="grid gap-1.5 md:grid-cols-2">
                {group.permissions.map((p) => (
                  <li key={p}>
                    <label
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm transition ${
                        current.has(p) ? 'border-brand bg-brand-soft' : 'border-line bg-white'
                      } ${locked ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
                        checked={current.has(p)}
                        disabled={locked || busy}
                        onChange={() => toggle(p)}
                      />
                      <span>
                        {PERMISSIONS[p]}
                        <code className="ml-1 text-[10px] text-ink-soft">{p}</code>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <UserOverrides initialUserId={initialUserId} />
    </div>
  );
}

// ------------------------------------------------------- derogations

function UserOverrides({ initialUserId }: { initialUserId?: string }) {
  const [userId, setUserId] = useState(initialUserId ?? '');
  const [data, setData] = useState<{
    role: Role;
    fromRole: Permission[];
    overrides: { permission: Permission; granted: number; reason: string | null }[];
    effective: Permission[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setError(null);
    const res = await fetch(`/api/admin/users/${id}/permissions`);
    const body = await res.json();
    if (res.ok) setData(body);
    else {
      setData(null);
      setError(body.error);
    }
  }, []);

  useEffect(() => {
    if (initialUserId) load(initialUserId);
  }, [initialUserId, load]);

  async function change(permission: Permission, granted: boolean | null) {
    setBusy(true);
    setError(null);
    try {
      const reason =
        granted === null ? undefined : (window.prompt('Motif de la derogation (trace au journal) ?') ?? undefined);
      const res = await fetch(`/api/admin/users/${userId}/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission, granted, reason }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      load(userId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  const overrideOf = (p: Permission) => data?.overrides.find((o) => o.permission === p);

  return (
    <section className="card-pad">
      <h2 className="section-title mb-1">Derogation individuelle</h2>
      <p className="mb-3 text-xs text-ink-soft">
        Accorde ou retire un droit a un compte precis, par-dessus la matrice de son role. Chaque derogation est
        horodatee et motivee dans le journal d audit.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          className="input sm:w-96"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="Identifiant du compte (depuis la liste des comptes)"
        />
        <button className="btn-ghost" onClick={() => load(userId)} disabled={!userId}>
          Charger
        </button>
      </div>

      {error && <p className="rounded-lg border border-danger bg-danger-soft p-3 text-sm text-danger">{error}</p>}

      {data && (
        <>
          <p className="mb-2 text-sm">
            Role : <strong>{ROLE_LABELS[data.role]}</strong> — {data.effective.length} droit(s) effectif(s)
          </p>
          <ul className="grid gap-1.5 md:grid-cols-2">
            {(Object.keys(PERMISSIONS) as Permission[]).map((p) => {
              const fromRole = data.fromRole.includes(p);
              const override = overrideOf(p);
              const effective = data.effective.includes(p);
              return (
                <li key={p} className="flex items-start gap-2 rounded-lg border border-line p-2 text-sm">
                  <span aria-hidden className={effective ? 'text-ok' : 'text-ink-soft'}>
                    {effective ? '✓' : '·'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p>
                      {PERMISSIONS[p]} <code className="text-[10px] text-ink-soft">{p}</code>
                    </p>
                    <p className="text-[11px] text-ink-soft">
                      {override
                        ? `derogation : ${override.granted ? 'accorde' : 'retire'}${override.reason ? ` — ${override.reason}` : ''}`
                        : fromRole
                          ? 'herite du role'
                          : 'non attribue'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button className="btn-ghost btn-sm" disabled={busy} onClick={() => change(p, true)}>
                      +
                    </button>
                    <button className="btn-ghost btn-sm" disabled={busy} onClick={() => change(p, false)}>
                      −
                    </button>
                    {override && (
                      <button className="btn-ghost btn-sm" disabled={busy} onClick={() => change(p, null)}>
                        ↺
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
