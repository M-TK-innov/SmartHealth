'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LONGUEUR_PIN, deviner } from '@/lib/patient/identite';

type Mode = 'connexion' | 'activation';
type Type = 'telephone' | 'npi';

/**
 * Entree dans l'espace patient.
 *
 * TROIS CHOIX D'ERGONOMIE QUI SONT DES CHOIX DE SURETE
 *
 * 1. Le TYPE d'identifiant est demande, jamais devine. Un numero beninois et
 *    un NPI font dix chiffres tous les deux ; se tromper, c'est chercher le
 *    dossier de quelqu'un d'autre. Quand la saisie leve l'ambiguite toute
 *    seule, on le signale sans rien imposer.
 *
 * 2. Le code s'affiche a la demande. Sur un telephone partage, taper six
 *    chiffres a l'aveugle fait echouer, et trois echecs verrouillent le
 *    compte. Mieux vaut un bouton « afficher » qu'un blocage.
 *
 * 3. Les champs numeriques ouvrent le pave numerique du telephone. Sans
 *    cela, l'utilisateur cherche les chiffres dans un clavier de lettres.
 */
export function FormuleAcces({ suite }: { suite?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('connexion');
  const [type, setType] = useState<Type>('telephone');
  const [identifiant, setIdentifiant] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [voirPin, setVoirPin] = useState(false);
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const suppose = deviner(identifiant);
  const ambigu = suppose === 'ambigu' && identifiant.trim().length > 0;

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');
    setEnvoi(true);
    try {
      const url = mode === 'connexion' ? '/api/espace/connexion' : '/api/espace/activation';
      const corps = mode === 'connexion' ? { type, identifiant, pin } : { type, identifiant, code, pin };
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const reponse = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErreur(reponse.error ?? 'Connexion impossible.');
        setEnvoi(false);
        return;
      }
      router.push(suite && suite.startsWith('/espace') ? suite : '/espace');
      router.refresh();
    } catch {
      setErreur("Le serveur n'a pas repondu. Verifiez votre connexion.");
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre} className="space-y-5" noValidate>
      <div className="flex gap-2" role="tablist">
        {(['connexion', 'activation'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setErreur('');
            }}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
              mode === m ? 'border-brand bg-brand text-white' : 'border-line text-ink-soft'
            }`}
          >
            {m === 'connexion' ? 'Me connecter' : 'Premiere fois'}
          </button>
        ))}
      </div>

      <fieldset>
        <legend className="label mb-2">Je me reconnais par</legend>
        <div className="flex gap-2">
          {(['telephone', 'npi'] as Type[]).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={type === t}
              onClick={() => setType(t)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                type === t ? 'border-brand font-semibold text-brand' : 'border-line text-ink-soft'
              }`}
            >
              {t === 'telephone' ? 'Mon telephone' : 'Mon NPI'}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="identifiant">
          {type === 'telephone' ? 'Numero de telephone' : 'Numero NPI'}
        </label>
        <input
          id="identifiant"
          className="input text-lg"
          inputMode="numeric"
          autoComplete={type === 'telephone' ? 'tel' : 'off'}
          placeholder={type === 'telephone' ? '01 97 07 39 00' : '10 chiffres'}
          value={identifiant}
          onChange={(e) => setIdentifiant(e.target.value)}
          required
        />
        {ambigu && (
          <p className="mt-1 text-[11px] text-ink-soft">
            Dix chiffres : cela peut etre un telephone ou un NPI. Verifiez le bouton choisi
            au-dessus.
          </p>
        )}
      </div>

      {mode === 'activation' && (
        <div>
          <label className="label" htmlFor="code">
            Code remis a l accueil
          </label>
          <input
            id="code"
            className="input text-lg uppercase tracking-widest"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            placeholder="8 caracteres"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <p className="mt-1 text-[11px] text-ink-soft">
            Il vous a ete donne par l agent qui vous a enregistre. Il est valable deux jours.
          </p>
        </div>
      )}

      <div>
        <label className="label" htmlFor="pin">
          {mode === 'connexion' ? 'Mon code secret' : `Choisissez un code a ${LONGUEUR_PIN} chiffres`}
        </label>
        <div className="relative">
          <input
            id="pin"
            className="input pr-20 text-lg tracking-[0.4em]"
            type={voirPin ? 'text' : 'password'}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={LONGUEUR_PIN}
            autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            required
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-ink-soft"
            onClick={() => setVoirPin((v) => !v)}
          >
            {voirPin ? 'Masquer' : 'Afficher'}
          </button>
        </div>
        {mode === 'activation' && (
          <p className="mt-1 text-[11px] text-ink-soft">
            Evitez une suite simple. Ce code ouvre votre dossier medical.
          </p>
        )}
      </div>

      {erreur && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {erreur}
        </p>
      )}

      <button className="btn-primary w-full text-base" disabled={envoi}>
        {envoi ? 'Un instant...' : mode === 'connexion' ? 'Me connecter' : 'Activer mon acces'}
      </button>

      <p className="text-center text-xs leading-relaxed text-ink-soft">
        Vous n avez pas de code ? Demandez-le a l accueil de votre centre de sante. Il ne peut pas
        etre envoye par telephone : l agent doit vous voir pour verifier que le dossier est bien le
        votre.
      </p>
    </form>
  );
}
