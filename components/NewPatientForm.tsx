'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Creation d'un patient.
 *
 * Volontairement minimaliste : en consultation on n'a pas le temps de remplir
 * vingt champs. Prenom, nom et sexe suffisent — le reste du dossier se remplit
 * tout seul a partir de ce que l'IA entend pendant l'echange.
 */
export function NewPatientForm({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!compact);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    given_name: '',
    family_name: '',
    gender: 'unknown',
    birth_date: '',
    phone: '',
    city: '',
    preferred_language: 'fr',
    startConsultation: true,
  });

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          given_name: form.given_name,
          family_name: form.family_name,
          gender: form.gender,
          birth_date: form.birth_date || null,
          phone: form.phone || null,
          city: form.city || null,
          preferred_language: form.preferred_language,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (form.startConsultation) {
        const c = await fetch('/api/consultations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId: data.patient.id }),
        });
        const cd = await c.json();
        if (c.ok) {
          router.push(`/consultations/${cd.consultation.id}`);
          return;
        }
      }
      router.push(`/patients/${data.patient.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        + Nouveau patient
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card-pad space-y-3">
      <h2 className="section-title">Nouveau patient</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Prenom *</label>
          <input className="input" required value={form.given_name} onChange={(e) => set('given_name', e.target.value)} />
        </div>
        <div>
          <label className="label">Nom *</label>
          <input className="input" required value={form.family_name} onChange={(e) => set('family_name', e.target.value)} />
        </div>
        <div>
          <label className="label">Sexe</label>
          <select className="input" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="unknown">Non precise</option>
            <option value="female">Feminin</option>
            <option value="male">Masculin</option>
            <option value="other">Autre</option>
          </select>
        </div>
        <div>
          <label className="label">Date de naissance</label>
          <input type="date" className="input" value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} />
        </div>
        <div>
          <label className="label">Telephone</label>
          <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div>
          <label className="label">Ville / quartier</label>
          <input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">Langue preferee</label>
          <select
            className="input"
            value={form.preferred_language}
            onChange={(e) => set('preferred_language', e.target.value)}
          >
            {[
              ['fr', 'Francais'],
              ['en', 'Anglais'],
              ['fon', 'Fon'],
              ['yo', 'Yoruba'],
              ['bm', 'Bambara'],
              ['wo', 'Wolof'],
              ['ln', 'Lingala'],
              ['sw', 'Kiswahili'],
              ['ar', 'Arabe'],
              ['pt', 'Portugais'],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-brand"
          checked={form.startConsultation}
          onChange={(e) => set('startConsultation', e.target.checked)}
        />
        Ouvrir directement une consultation
      </label>

      {error && <p className="rounded-lg bg-danger-soft p-2 text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Creation...' : 'Creer le patient'}
        </button>
        {compact && (
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
            Annuler
          </button>
        )}
      </div>
      <p className="text-xs text-ink-soft">
        Un identifiant de dossier (MRN) est genere automatiquement. Les autres informations seront extraites de la
        consultation et soumises a votre validation.
      </p>
    </form>
  );
}
