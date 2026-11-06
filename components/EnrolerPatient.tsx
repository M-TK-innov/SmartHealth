'use client';

import { useState } from 'react';
import { LONGUEUR_CODE } from '@/lib/patient/identite';

type Type = 'telephone' | 'npi';

interface Resultat {
  code: string;
  expireLe: string;
  heures: number;
  nouveauCompte: boolean;
}

/**
 * Ouverture de l'acces d'un patient a son dossier, depuis le guichet.
 *
 * POURQUOI CET ECRAN EXISTE AU LIEU D'UN ENVOI PAR SMS
 *
 * C'est le seul moment ou l'identite est verifiee par un humain qui a la
 * personne devant lui. Un code envoye a un numero declare au telephone
 * ouvrirait le dossier a celui qui a donne le numero, pas a celui dont c'est
 * le dossier.
 *
 * TROIS DETAILS QUI DECIDENT SI CELA MARCHE AU COMPTOIR
 *
 * 1. Le code s'affiche GRAND et groupe par quatre. Il sera lu a voix haute,
 *    recopie sur un bout de papier, puis tape sur un clavier de telephone.
 *    Son alphabet exclut deja les caracteres qui se confondent.
 *
 * 2. On previent AVANT, pas apres, qu'il ne sera plus reaffiche. Un agent qui
 *    ferme l'ecran sans l'avoir note doit en emettre un autre.
 *
 * 3. Emettre un nouveau code invalide le precedent, et l'ecran le dit. Sans
 *    cela, un patient revenu avec un vieux papier se heurte a un refus que
 *    personne ne sait expliquer.
 */
export function EnrolerPatient({ patientId }: { patientId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<Type>('telephone');
  const [identifiant, setIdentifiant] = useState('');
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  async function emettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');
    setEnvoi(true);
    try {
      const r = await fetch(`/api/patients/${patientId}/enroler`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, identifiant }),
      });
      const corps = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErreur(corps.error ?? 'Emission impossible.');
        setEnvoi(false);
        return;
      }
      setResultat(corps as Resultat);
    } catch {
      setErreur("Le serveur n'a pas repondu.");
    }
    setEnvoi(false);
  }

  function recommencer() {
    setResultat(null);
    setIdentifiant('');
    setErreur('');
  }

  if (!ouvert) {
    return (
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOuvert(true)}>
        Donner l acces a son dossier
      </button>
    );
  }

  if (resultat) {
    const groupe = resultat.code.replace(
      new RegExp(`(.{${Math.ceil(LONGUEUR_CODE / 2)}})`),
      '$1 ',
    );
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-soft">
          {resultat.nouveauCompte
            ? 'Acces cree. Remettez ce code au patient :'
            : 'Ce patient avait deja un acces. Son dossier y est rattache, et voici un nouveau code :'}
        </p>

        <p className="rounded-xl border-2 border-brand bg-brand-soft px-4 py-5 text-center font-mono text-3xl font-bold tracking-[0.2em] text-brand">
          {groupe}
        </p>

        <ul className="space-y-1 text-xs leading-relaxed text-ink-soft">
          <li>
            Valable <b>{resultat.heures} heures</b>, jusqu au {resultat.expireLe.slice(0, 16)}.
          </li>
          <li>
            <b>Il ne sera plus affiche.</b> Notez-le ou dictez-le maintenant.
          </li>
          <li>Il ne sert qu une fois, et tout code anterieur vient d etre annule.</li>
          <li>
            Le patient l utilisera sur <b>/espace</b>, onglet « Premiere fois ».
          </li>
        </ul>

        <div className="flex gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={recommencer}>
            Emettre pour un autre numero
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setOuvert(false)}>
            Fermer
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={emettre} className="space-y-3">
      <p className="text-xs leading-relaxed text-ink-soft">
        Verifiez une piece d identite avant d emettre. Ce code ouvre le dossier medical.
      </p>

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
            {t === 'telephone' ? 'Telephone' : 'NPI'}
          </button>
        ))}
      </div>

      <input
        className="input"
        inputMode="numeric"
        placeholder={type === 'telephone' ? '01 97 07 39 00' : '10 chiffres'}
        value={identifiant}
        onChange={(e) => setIdentifiant(e.target.value)}
        required
        aria-label={type === 'telephone' ? 'Numero de telephone' : 'Numero NPI'}
      />

      {erreur && (
        <p role="alert" className="rounded-lg bg-danger-soft p-2 text-sm text-danger">
          {erreur}
        </p>
      )}

      <div className="flex gap-2">
        <button className="btn-primary btn-sm" disabled={envoi || !identifiant.trim()}>
          {envoi ? 'Un instant...' : 'Emettre le code'}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOuvert(false)}>
          Annuler
        </button>
      </div>
    </form>
  );
}
