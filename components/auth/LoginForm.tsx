'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Un mot de passe provisoire doit etre remplace avant tout acces clinique.
      router.push(data.user?.mustChangePassword ? '/compte?motdepasse=1' : redirectTo);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion impossible.');
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <label className="label" htmlFor="email">
          Adresse e-mail professionnelle
        </label>
        <input
          id="email"
          type="email"
          className="input"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="prenom.nom@etablissement.bj"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Mot de passe
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            className="input pr-20"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-ink-soft hover:text-brand-dark"
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          >
            {showPassword ? 'Masquer' : 'Afficher'}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-danger bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'Connexion...' : 'Se connecter'}
      </button>

      <p className="text-xs leading-relaxed text-ink-soft">
        Mot de passe oublie ? Seul un administrateur de votre etablissement peut en generer un nouveau. Aucune
        reinitialisation par e-mail n est possible : un compte donne acces a des dossiers medicaux.
      </p>
    </form>
  );
}
