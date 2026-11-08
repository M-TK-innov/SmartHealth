'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Prise de rendez-vous, cote accueil.
 *
 * LE PATIENT SE CHERCHE, IL NE SE TAPE PAS. Un champ libre ou l'on saisirait
 * un numero de dossier produirait des rendez-vous rattaches a des dossiers
 * qui n'existent pas, decouverts le jour venu. On cherche, on choisit, et
 * l'identifiant ne transite jamais par le clavier.
 *
 * LE REFUS EST AFFICHE EN TOUTES LETTRES. Les regles refusent pour des
 * raisons qui appellent chacune un geste different : le creneau est pris — et
 * le message dit lequel —, la date est passee, la duree est hors bornes. Un
 * formulaire qui se contenterait de ne rien faire ferait appeler
 * l'informatique, la ou le motif fait choisir un autre horaire.
 */

interface PatientTrouve {
  id: string;
  given_name: string;
  family_name: string;
  mrn: string | null;
  birth_date: string | null;
}

export function PoserRendezVous({
  praticiens,
  praticienParDefaut,
  jour,
}: {
  praticiens: { id: string; given_name: string; family_name: string }[];
  praticienParDefaut: string | null;
  jour: string;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);

  const [recherche, setRecherche] = useState('');
  const [trouves, setTrouves] = useState<PatientTrouve[]>([]);
  const [patient, setPatient] = useState<PatientTrouve | null>(null);

  const [praticien, setPraticien] = useState(praticienParDefaut ?? praticiens[0]?.id ?? '');
  const [mode, setMode] = useState<'presentiel' | 'distance'>('presentiel');
  const [date, setDate] = useState(jour);
  const [heure, setHeure] = useState('09:00');
  const [duree, setDuree] = useState(20);
  const [motif, setMotif] = useState('');

  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const [pose, setPose] = useState<string | null>(null);

  // La recherche attend que la frappe se calme. Sans cela, chaque lettre
  // declenche une requete, et les reponses arrivent dans le desordre : on
  // affiche alors le resultat d'une recherche qu'on ne fait plus.
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (minuteur.current) clearTimeout(minuteur.current);
    const q = recherche.trim();
    if (q.length < 2) {
      setTrouves([]);
      return;
    }
    minuteur.current = setTimeout(async () => {
      const r = await fetch(`/api/patients?q=${encodeURIComponent(q)}`)
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      setTrouves((r?.patients ?? []).slice(0, 6));
    }, 250);
    return () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    };
  }, [recherche]);

  async function poser() {
    if (!patient) {
      setRefus('Choisissez un dossier patient.');
      return;
    }
    setEnvoi(true);
    setRefus(null);
    setPose(null);

    const r = await fetch('/api/rendez-vous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: patient.id,
        practitionerId: praticien,
        mode,
        motif: motif.trim() || null,
        // Le serveur attend un horodatage, pas deux champs separes.
        debut: `${date} ${heure}:00`,
        dureeMin: duree,
      }),
    }).catch(() => null);
    setEnvoi(false);

    if (!r || !r.ok) {
      const m = r ? await r.json().catch(() => null) : null;
      setRefus(m?.error ?? 'Le rendez-vous n a pas pu etre pose.');
      return;
    }

    setPose(`${patient.given_name} ${patient.family_name} — ${date} a ${heure}`);
    setPatient(null);
    setRecherche('');
    setMotif('');
    router.refresh();
  }

  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className="btn-primary btn-sm mt-3">
        Poser un rendez-vous
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
      <p className="text-sm font-semibold">Poser un rendez-vous</p>

      <label className="mt-3 block text-xs text-ink-soft">
        Patient
        <input
          type="search"
          value={patient ? `${patient.given_name} ${patient.family_name}` : recherche}
          onChange={(e) => {
            setPatient(null);
            setRecherche(e.target.value);
          }}
          placeholder="Nom, numero de dossier, telephone"
          className="input mt-1 block w-full"
        />
      </label>

      {!patient && trouves.length > 0 && (
        <ul className="mt-1 divide-y divide-line rounded-lg border border-line bg-white">
          {trouves.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setPatient(p);
                  setTrouves([]);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-paper"
              >
                <b>
                  {p.given_name} {p.family_name}
                </b>
                <span className="ml-2 text-xs text-ink-soft">
                  {p.mrn ?? 'sans numero'}
                  {p.birth_date ? ` · ne le ${p.birth_date}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs text-ink-soft">
          Praticien
          <select
            value={praticien}
            onChange={(e) => setPraticien(e.target.value)}
            className="input mt-1 block w-full"
          >
            {praticiens.map((p) => (
              <option key={p.id} value={p.id}>
                {p.given_name} {p.family_name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-ink-soft">
          Lieu
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'presentiel' | 'distance')}
            className="input mt-1 block w-full"
          >
            <option value="presentiel">Sur place</option>
            <option value="distance">A distance</option>
          </select>
        </label>

        <label className="text-xs text-ink-soft">
          Jour
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input mt-1 block w-full"
          />
        </label>

        <label className="text-xs text-ink-soft">
          Heure
          <input
            type="time"
            value={heure}
            onChange={(e) => setHeure(e.target.value)}
            className="input mt-1 block w-full"
          />
        </label>

        <label className="text-xs text-ink-soft">
          Duree (minutes)
          <input
            type="number"
            min={5}
            max={240}
            step={5}
            value={duree}
            onChange={(e) => setDuree(Number(e.target.value))}
            className="input mt-1 block w-full"
          />
        </label>

        <label className="text-xs text-ink-soft">
          Motif
          <input
            type="text"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Facultatif"
            className="input mt-1 block w-full"
          />
        </label>
      </div>

      {mode === 'distance' && (
        <p className="mt-2 rounded-lg bg-white p-2 text-xs leading-relaxed text-ink-soft">
          Le patient devra donner son accord depuis son espace avant que la salle ne s ouvre.
          Prevenez-le : sans cet accord, la consultation ne pourra pas commencer.
        </p>
      )}

      {refus && (
        <p className="mt-2 rounded-lg bg-danger-soft p-2 text-xs leading-relaxed text-danger">
          {refus}
        </p>
      )}
      {pose && (
        <p className="mt-2 rounded-lg bg-brand-soft p-2 text-xs leading-relaxed text-brand">
          Rendez-vous pose : {pose}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={poser} disabled={envoi} className="btn-primary btn-sm">
          {envoi ? 'Enregistrement...' : 'Poser le rendez-vous'}
        </button>
        <button type="button" onClick={() => setOuvert(false)} className="btn-ghost btn-sm">
          Fermer
        </button>
      </div>
    </div>
  );
}
