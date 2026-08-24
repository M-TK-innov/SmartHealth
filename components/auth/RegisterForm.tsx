'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, SELF_REGISTRABLE_ROLES, type Role } from '@/lib/auth/roles';

interface PublicOrg {
  id: string;
  name: string;
  type: string;
  region: string | null;
}

export function RegisterForm({ minLength }: { minLength: number }) {
  const [role, setRole] = useState<Role>('medecin');
  const [orgs, setOrgs] = useState<PublicOrg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirm: '',
    phone: '',
    licenseNumber: '',
    qualification: 'Medecin generaliste',
    organizationId: '',
    organizationName: '',
    organizationType: 'health-center',
    organizationCode: '',
    region: '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch('/api/organizations')
      .then((r) => r.json())
      .then((d) => setOrgs(d.organizations ?? []))
      .catch(() => setOrgs([]));
  }, []);

  const joinsExisting = role === 'medecin';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDone(data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Inscription impossible.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-ok bg-ok-soft p-5">
        <h2 className="text-base font-bold text-ok">Demande enregistree</h2>
        <p className="mt-2 text-sm">{done}</p>
        <Link href="/connexion" className="btn-primary mt-4">
          Aller a la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <fieldset>
        <legend className="label">Vous vous inscrivez en tant que</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {SELF_REGISTRABLE_ROLES.map((r) => (
            <button
              type="button"
              key={r}
              onClick={() => setRole(r)}
              aria-pressed={role === r}
              className={`rounded-lg border p-3 text-left transition ${
                role === r ? 'border-brand bg-brand-soft' : 'border-line bg-white hover:bg-paper'
              }`}
            >
              <span className="block text-sm font-semibold">{ROLE_LABELS[r]}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">{ROLE_DESCRIPTIONS[role]}</p>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="fullName">
            Nom complet *
          </label>
          <input
            id="fullName"
            className="input"
            required
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            placeholder="Ama Sossou"
          />
        </div>

        <div>
          <label className="label" htmlFor="regEmail">
            Adresse e-mail professionnelle *
          </label>
          <input
            id="regEmail"
            type="email"
            className="input"
            autoComplete="username"
            required
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="phone">
            Telephone
          </label>
          <input id="phone" className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>

        <div>
          <label className="label" htmlFor="pwd">
            Mot de passe * ({minLength} caracteres minimum)
          </label>
          <input
            id="pwd"
            type="password"
            className="input"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="confirm">
            Confirmer le mot de passe *
          </label>
          <input
            id="confirm"
            type="password"
            className="input"
            autoComplete="new-password"
            required
            value={form.confirm}
            onChange={(e) => set('confirm', e.target.value)}
          />
        </div>
      </div>

      {joinsExisting ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="org">
              Etablissement dans lequel vous exercez *
            </label>
            <select
              id="org"
              className="input"
              required
              value={form.organizationId}
              onChange={(e) => set('organizationId', e.target.value)}
            >
              <option value="">— Selectionnez —</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.region ? ` (${o.region})` : ''}
                </option>
              ))}
            </select>
            {orgs.length === 0 && (
              <p className="mt-1 text-xs text-warn">
                Aucun etablissement actif n est encore enregistre. Votre etablissement doit s inscrire avant vous.
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="licence">
              Numero d ordre
            </label>
            <input
              id="licence"
              className="input"
              value={form.licenseNumber}
              onChange={(e) => set('licenseNumber', e.target.value)}
              placeholder="CNOM-BJ-0000"
            />
          </div>
          <div>
            <label className="label" htmlFor="qualif">
              Qualification
            </label>
            <input
              id="qualif"
              className="input"
              value={form.qualification}
              onChange={(e) => set('qualification', e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="orgName">
              Nom de l organisation *
            </label>
            <input
              id="orgName"
              className="input"
              required
              value={form.organizationName}
              onChange={(e) => set('organizationName', e.target.value)}
              placeholder={role === 'ministere' ? 'Ministere de la Sante' : 'Centre de Sante de Cotonou'}
            />
          </div>
          {role !== 'ministere' && (
            <div>
              <label className="label" htmlFor="orgType">
                Type
              </label>
              <select
                id="orgType"
                className="input"
                value={form.organizationType}
                onChange={(e) => set('organizationType', e.target.value)}
              >
                <option value="health-center">Centre de sante</option>
                <option value="hospital">Hopital</option>
              </select>
            </div>
          )}
          <div>
            <label className="label" htmlFor="orgCode">
              Code officiel
            </label>
            <input
              id="orgCode"
              className="input"
              value={form.organizationCode}
              onChange={(e) => set('organizationCode', e.target.value)}
              placeholder="code SNIS"
            />
          </div>
          <div>
            <label className="label" htmlFor="region">
              Departement / region
            </label>
            <input id="region" className="input" value={form.region} onChange={(e) => set('region', e.target.value)} />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-danger bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'Envoi...' : 'Envoyer la demande'}
      </button>

      <p className="text-xs leading-relaxed text-ink-soft">
        Votre compte n est pas actif immediatement : il doit etre valide par un administrateur du niveau superieur.
        Un medecin est valide par son etablissement, un etablissement et un ministere par un administrateur de la
        plateforme.
      </p>
    </form>
  );
}
