'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Prerequis } from './Prerequis';

interface NetworkAddress {
  url: string;
  label: string;
  local: boolean;
}

interface Done {
  email: string;
  password: string;
  fullName: string;
  facilityName: string;
  addresses: NetworkAddress[];
}

export function BootstrapWizard({
  minLength,
  initialAddresses,
}: {
  minLength: number;
  initialAddresses: NetworkAddress[];
}) {
  const [done, setDone] = useState<Done | null>(null);

  return done ? <Confirmation data={done} /> : <SetupForm minLength={minLength} addresses={initialAddresses} onDone={setDone} />;
}

// ---------------------------------------------------------------- etape 1

function SetupForm({
  minLength,
  addresses,
  onDone,
}: {
  minLength: number;
  addresses: NetworkAddress[];
  onDone: (d: Done) => void;
}) {
  const [form, setForm] = useState({
    facilityName: '',
    facilityType: 'health-center',
    facilityCode: '',
    region: '',
    fullName: '',
    email: '',
    password: '',
    confirm: '',
  });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      onDone({
        email: form.email.trim().toLowerCase(),
        // Conserve uniquement en memoire de la page, pour l'ecran de
        // confirmation. Le serveur ne le renvoie jamais.
        password: form.password,
        fullName: form.fullName.trim(),
        facilityName: form.facilityName.trim(),
        addresses: data.addresses ?? addresses,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Amorcage impossible.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {/*
        Le diagnostic du poste vient AVANT le formulaire, pas apres. Un
        responsable qui decouvre au bout de vingt minutes de saisie que le
        disque est plein a perdu vingt minutes — et la confiance dans l outil.
      */}
      <Prerequis />

      <section>
        <h2 className="section-title mb-2">1. Votre structure</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="facilityName">
              Nom de la structure *
            </label>
            <input
              id="facilityName"
              className="input"
              required
              autoFocus
              value={form.facilityName}
              onChange={(e) => set('facilityName', e.target.value)}
              placeholder="Centre de Sante de Cotonou"
            />
            <p className="mt-1 text-[11px] text-ink-soft">
              Apparait sur les comptes rendus, les ordonnances et les exports vers les systemes tiers.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="facilityType">
              Type
            </label>
            <select
              id="facilityType"
              className="input"
              value={form.facilityType}
              onChange={(e) => set('facilityType', e.target.value)}
            >
              <option value="health-center">Centre de sante</option>
              <option value="hospital">Hopital</option>
              <option value="ministry">Ministere</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="facilityCode">
              Code officiel
            </label>
            <input
              id="facilityCode"
              className="input"
              value={form.facilityCode}
              onChange={(e) => set('facilityCode', e.target.value)}
              placeholder="code SNIS"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="region">
              Departement / region
            </label>
            <input id="region" className="input" value={form.region} onChange={(e) => set('region', e.target.value)} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="section-title mb-2">2. Votre compte responsable</h2>
        <p className="mb-3 text-xs leading-relaxed text-ink-soft">
          Ce compte sera <strong>super-administrateur</strong> : il cree ensuite tous les autres depuis la console.
          C&apos;est le seul compte que vous creez ici.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="fullName">
              Votre nom complet *
            </label>
            <input
              id="fullName"
              className="input"
              required
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="bootEmail">
              Adresse e-mail *
            </label>
            <input
              id="bootEmail"
              type="email"
              className="input"
              autoComplete="username"
              required
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
            <p className="mt-1 text-[11px] text-ink-soft">C&apos;est avec elle que vous vous connecterez.</p>
          </div>
          <div>
            <label className="label" htmlFor="bootPwd">
              Mot de passe * ({minLength} caracteres minimum)
            </label>
            <div className="relative">
              <input
                id="bootPwd"
                type={show ? 'text' : 'password'}
                className="input pr-20"
                autoComplete="new-password"
                required
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-ink-soft hover:text-brand-dark"
              >
                {show ? 'Masquer' : 'Afficher'}
              </button>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="bootConfirm">
              Confirmation *
            </label>
            <input
              id="bootConfirm"
              type={show ? 'text' : 'password'}
              className="input"
              autoComplete="new-password"
              required
              value={form.confirm}
              onChange={(e) => set('confirm', e.target.value)}
            />
          </div>
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-lg border border-danger bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'Creation en cours...' : 'Creer le compte et demarrer'}
      </button>

      <p className="text-xs leading-relaxed text-ink-soft">
        Aucun mot de passe ne peut etre recupere par e-mail : l&apos;application ne connait pas votre messagerie et
        ne sort pas de votre reseau. Notez celui-ci avant de continuer.
      </p>
    </form>
  );
}

// ---------------------------------------------------------------- etape 2

function Confirmation({ data }: { data: Done }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const remote = data.addresses.filter((a) => !a.local);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-ok bg-ok-soft p-4">
        <h2 className="text-base font-bold text-ok">Installation prete</h2>
        <p className="mt-1 text-sm">
          <strong>{data.facilityName}</strong> est enregistree et votre compte super-administrateur est actif. Vous
          etes deja connecte.
        </p>
      </div>

      {/* ---------------------------------------------------- identifiants */}
      <section className="card-pad">
        <h3 className="section-title mb-1">Vos identifiants</h3>
        <p className="mb-3 text-xs leading-relaxed text-ink-soft">
          Notez-les maintenant. Cet ecran ne reviendra pas, et <strong>aucune reinitialisation par e-mail
          n&apos;existe</strong> : un compte donne acces a des dossiers medicaux.
        </p>

        <dl className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <dt className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-soft">Adresse</dt>
            <dd className="font-mono">{data.email}</dd>
            <button className="btn-ghost btn-sm" onClick={() => copy(data.email, 'email')}>
              {copied === 'email' ? 'Copie' : 'Copier'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <dt className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Mot de passe
            </dt>
            <dd className="font-mono">{show ? data.password : '•'.repeat(Math.min(data.password.length, 16))}</dd>
            <button className="btn-ghost btn-sm" onClick={() => setShow((v) => !v)}>
              {show ? 'Masquer' : 'Afficher'}
            </button>
            <button className="btn-ghost btn-sm" onClick={() => copy(data.password, 'pwd')}>
              {copied === 'pwd' ? 'Copie' : 'Copier'}
            </button>
          </div>
        </dl>
      </section>

      {/* -------------------------------------------------------- adresses */}
      <section className="card-pad">
        <h3 className="section-title mb-1">Ou joindre l&apos;application</h3>
        <p className="mb-3 text-xs leading-relaxed text-ink-soft">
          Depuis ce poste, et depuis les autres appareils de la structure connectes au meme reseau.
        </p>

        <ul className="space-y-2">
          {data.addresses.map((a) => (
            <li key={a.url} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2.5">
              <span className={`chip ${a.local ? 'bg-brand-soft text-brand-dark' : 'bg-paper text-ink-soft'}`}>
                {a.local ? 'ce poste' : a.label}
              </span>
              <code className="text-sm">{a.url}</code>
              <button className="btn-ghost btn-sm ml-auto" onClick={() => copy(a.url, a.url)}>
                {copied === a.url ? 'Copie' : 'Copier'}
              </button>
            </li>
          ))}
        </ul>

        {remote.length === 0 && (
          <p className="mt-3 rounded-lg border border-line bg-paper p-3 text-xs leading-relaxed text-ink-soft">
            Aucune adresse reseau detectee : ce poste n&apos;est relie a aucun reseau, ou seulement par une interface
            sans bail. L&apos;application reste utilisable ici meme.
          </p>
        )}
      </section>

      {/* --------------------------------------------- avertissement micro */}
      {remote.length > 0 && (
        <section className="rounded-xl border border-warn bg-warn-soft p-4">
          <h3 className="text-sm font-bold text-warn">Le microphone ne marchera pas sur ces adresses</h3>
          <p className="mt-1 text-xs leading-relaxed">
            Les navigateurs reservent l&apos;acces au micro aux sites <code>https://</code> et a{' '}
            <code>localhost</code>. Sur une adresse <code>http://192.168…</code>, la dictee sera refusee — c&apos;est
            une regle du navigateur, pas un defaut de l&apos;application. La saisie manuelle de la transcription
            reste possible.
          </p>
          <p className="mt-2 text-xs leading-relaxed">
            Pour dicter depuis les tablettes, placez le serveur derriere HTTPS. La marche a suivre est dans{' '}
            <code>docs/installation/05-mise-en-production.md</code>.
          </p>
        </section>
      )}

      {/* ---------------------------------------------------- suite */}
      <section className="card-pad">
        <h3 className="section-title mb-2">Ensuite</h3>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>
            Creez les comptes de vos medecins depuis <strong>Administration → Comptes</strong>. Le mot de passe est
            genere et affiche une seule fois.
          </li>
          <li>
            Verifiez la <strong>politique d&apos;acces</strong> (duree de session, verrouillage, inscription libre)
            dans Administration → Acces et sessions.
          </li>
          <li>
            Mettez en place une <strong>sauvegarde</strong> : Administration → Base et serveurs.
          </li>
        </ol>
      </section>

      <button
        className="btn-primary w-full"
        onClick={() => {
          router.push('/');
          router.refresh();
        }}
      >
        Entrer dans l&apos;application
      </button>
    </div>
  );
}
