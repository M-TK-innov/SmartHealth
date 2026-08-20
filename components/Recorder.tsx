'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Capture de la consultation.
 *
 * La reconnaissance vocale utilise l'API Web Speech du navigateur : elle est
 * gratuite, ne demande aucune infrastructure et fonctionne en francais. C'est
 * volontairement une brique remplacable — `onSegment` est le seul contrat, on
 * peut donc brancher a la place un moteur local (Whisper) ou un service tiers
 * sans toucher au reste de l'application.
 *
 * Le navigateur ne sait pas separer les locuteurs : le praticien bascule
 * l'etiquette Medecin/Patient d'un clic ou avec la barre d'espace.
 */

type Speaker = 'clinician' | 'patient' | 'companion';

export interface Segment {
  text: string;
  speaker: Speaker;
  confidence?: number;
  startMs?: number;
}

interface SpeechAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechResult {
  isFinal: boolean;
  0: SpeechAlternative;
  length: number;
}
interface SpeechEvent {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

const LANGUAGES = [
  { code: 'fr-FR', label: 'Francais' },
  { code: 'en-US', label: 'English' },
  { code: 'fr-CA', label: 'Francais (Canada)' },
  { code: 'ar-MA', label: 'Arabe' },
  { code: 'sw-KE', label: 'Kiswahili' },
  { code: 'pt-PT', label: 'Portugais' },
];

export function Recorder({
  consent,
  onConsentChange,
  onSegment,
  disabled,
}: {
  consent: boolean;
  onConsentChange: (v: boolean) => void;
  onSegment: (s: Segment) => void;
  disabled?: boolean;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [speaker, setSpeaker] = useState<Speaker>('patient');
  const [lang, setLang] = useState('fr-FR');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const recognitionRef = useRef<Recognition | null>(null);
  const speakerRef = useRef<Speaker>(speaker);
  const wantListeningRef = useRef(false);
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    speakerRef.current = speaker;
  }, [speaker]);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    if (!listening) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [listening]);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);
    setInterim('');
  }, []);

  const start = useCallback(() => {
    setError(null);
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Ce navigateur ne prend pas en charge la reconnaissance vocale. Utilisez la saisie manuelle ci-dessous.");
      return;
    }

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let pending = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const alt = res[0];
        if (res.isFinal) {
          const text = alt.transcript.trim();
          if (text) {
            onSegment({
              text,
              speaker: speakerRef.current,
              confidence: alt.confidence || undefined,
              startMs: Date.now() - startedAtRef.current,
            });
          }
        } else {
          pending += alt.transcript;
        }
      }
      setInterim(pending);
    };

    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed') {
        setError("Acces au microphone refuse. Autorisez le micro dans les parametres du navigateur.");
        wantListeningRef.current = false;
        setListening(false);
      } else {
        setError(`Erreur de reconnaissance vocale : ${e.error}`);
      }
    };

    // le navigateur coupe la session apres un silence : on relance tant que le medecin enregistre
    rec.onend = () => {
      if (wantListeningRef.current) {
        try {
          rec.start();
        } catch {
          setListening(false);
        }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = rec;
    wantListeningRef.current = true;
    startedAtRef.current = startedAtRef.current || Date.now();
    try {
      rec.start();
      setListening(true);
    } catch {
      setError('Impossible de demarrer la capture audio.');
    }
  }, [lang, onSegment]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  // barre d'espace = bascule du locuteur, sans quitter le patient des yeux
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setSpeaker((s) => (s === 'patient' ? 'clinician' : 'patient'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listening]);

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <div className="card-pad">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="section-title">Capture de la consultation</h2>
        {listening && (
          <span className="chip bg-danger-soft text-danger">
            <span className="rec-dot inline-block h-2 w-2 rounded-full bg-danger" />
            Enregistrement {mmss}
          </span>
        )}
      </div>

      <label className="mb-3 flex cursor-pointer items-start gap-2.5 rounded-lg bg-brand-soft p-3 text-sm">
        <input
          type="checkbox"
          checked={consent}
          disabled={disabled}
          onChange={(e) => {
            if (!e.target.checked) stop();
            onConsentChange(e.target.checked);
          }}
          className="mt-0.5 h-4 w-4 accent-brand"
        />
        <span>
          <strong>Consentement du patient recueilli</strong> — le patient a ete informe que l echange est transcrit
          pour alimenter son dossier medical, et a donne son accord. Obligatoire avant tout enregistrement.
        </span>
      </label>

      {supported === false && (
        <p className="mb-3 rounded-lg bg-warn-soft p-3 text-sm text-warn">
          Reconnaissance vocale indisponible sur ce navigateur (Chrome et Edge la prennent en charge). La saisie
          manuelle de la transcription reste possible ci-dessous, avec le meme resultat en sortie.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!listening ? (
          <button className="btn-primary" onClick={start} disabled={!consent || disabled || supported === false}>
            Demarrer l ecoute
          </button>
        ) : (
          <button className="btn-danger" onClick={stop}>
            Arreter
          </button>
        )}

        <div className="inline-flex overflow-hidden rounded-lg border border-line">
          {(
            [
              ['patient', 'Patient'],
              ['clinician', 'Medecin'],
              ['companion', 'Accompagnant'],
            ] as [Speaker, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setSpeaker(value)}
              className={`px-3 py-2 text-sm transition ${
                speaker === value ? 'bg-brand text-white' : 'bg-white text-ink-soft hover:bg-paper'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select className="input w-auto" value={lang} onChange={(e) => setLang(e.target.value)} disabled={listening}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {listening && (
        <p className="mt-2 text-xs text-ink-soft">
          Astuce : la barre d espace bascule entre <strong>Patient</strong> et <strong>Medecin</strong> sans quitter le
          patient des yeux.
        </p>
      )}

      {interim && (
        <p className="mt-3 rounded-lg border border-dashed border-line bg-paper p-3 text-sm italic text-ink-soft">
          {interim}
        </p>
      )}

      {error && <p className="mt-3 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
