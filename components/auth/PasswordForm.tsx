'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function PasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setMessage({ tone: 'error', text: 'Les deux nouveaux mots de passe ne correspondent pas.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({ tone: 'ok', text: data.message });
      setCurrent('');
      setNext('');
      setConfirm('');
      router.refresh();
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
      <div>
        <label className="label" htmlFor="cur">Mot de passe actuel</label>
        <input id="cur" type="password" className="input" autoComplete="current-password" required
          value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="new">Nouveau mot de passe</label>
        <input id="new" type="password" className="input" autoComplete="new-password" required
          value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="cfm">Confirmation</label>
        <input id="cfm" type="password" className="input" autoComplete="new-password" required
          value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>

      {message && (
        <p className={`sm:col-span-3 rounded-lg border p-3 text-sm ${
          message.tone === 'ok' ? 'border-ok bg-ok-soft text-ok' : 'border-danger bg-danger-soft text-danger'
        }`}>
          {message.text}
        </p>
      )}

      <div className="sm:col-span-3">
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Modification...' : 'Changer le mot de passe'}
        </button>
        <p className="mt-2 text-xs text-ink-soft">
          Vos autres sessions seront fermees. Cet appareil reste connecte.
        </p>
      </div>
    </form>
  );
}
