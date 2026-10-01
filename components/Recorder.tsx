'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ENGINES, describeEngine, type EngineId, type EngineStatus } from '@/lib/transcription/types';
import { createEngine, isWebSpeechSupported } from '@/lib/transcription/engines';
import { guessFromText, SPEAKER_LABELS, type Speaker } from '@/lib/ai/speakers';
import type { TranscriptionEngine } from '@/lib/transcription/types';

/**
 * Capture de la consultation.
 *
 * Le geste central du produit tient en un bouton : on appuie, on parle, on
 * appuie pour arreter. Tout le reste — moteur, langue, locuteur — a une valeur
 * par defaut raisonnable et se replie dans les reglages.
 *
 * Le locuteur est propose automatiquement (voir lib/ai/speakers.ts) et reste
 * corrigeable d'un geste. Le mode manuel demeure disponible : quand la
 * detection se trompe souvent — plusieurs accompagnants, voix proches — il
 * vaut mieux basculer soi-meme que corriger apres coup.
 */

export interface Segment {
  text: string;
  speaker: Speaker;
  confidence?: number;
  startMs?: number;
  pitchHz?: number;
  /** true si le praticien a impose le locuteur. */
  speakerLocked?: boolean;
  /** Ce qui a motive la proposition automatique. */
  speakerReasons?: string[];
  /**
   * Phrase prononcee, quand `text` en est une traduction automatique.
   * Elle suit le tour jusqu'a l'ecran de validation et jusqu'au dossier.
   */
  sourceText?: string;
  sourceLanguage?: string;
}

const LANGUAGES = [
  { code: 'fr-FR', label: 'Francais' },
  { code: 'en-US', label: 'English' },
  { code: 'fr-CA', label: 'Francais (Canada)' },
  { code: 'ar-MA', label: 'Arabe' },
  { code: 'sw-KE', label: 'Kiswahili' },
  { code: 'pt-PT', label: 'Portugais' },
];

type Mode = 'auto' | 'manuel';

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
  const [engineId, setEngineId] = useState<EngineId>('webspeech');
  const [lang, setLang] = useState('fr-FR');
  const [mode, setMode] = useState<Mode>('auto');
  const [manualSpeaker, setManualSpeaker] = useState<Speaker>('patient');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<EngineStatus>({ state: 'idle' });
  const [interim, setInterim] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [lastDetected, setLastDetected] = useState<{ speaker: Speaker; confidence: number } | null>(null);

  const engineRef = useRef<TranscriptionEngine | null>(null);
  const modeRef = useRef(mode);
  const manualRef = useRef(manualSpeaker);
  const startedAtRef = useRef(0);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    manualRef.current = manualSpeaker;
  }, [manualSpeaker]);

  // Chrome/Edge seulement : ailleurs, Whisper devient le choix par defaut.
  useEffect(() => {
    if (!isWebSpeechSupported()) setEngineId('whisper-local');
  }, []);

  useEffect(() => {
    if (!listening) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [listening]);

  // Anime le halo du bouton : un retour visuel vaut mieux qu'un doute sur
  // « est-ce que ca enregistre ? » au milieu d'une consultation.
  useEffect(() => {
    if (!listening) {
      setLevel(0);
      return;
    }
    let frame = 0;
    const tick = () => {
      setLevel(0.35 + 0.3 * Math.abs(Math.sin(Date.now() / 260)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [listening]);

  useEffect(() => () => engineRef.current?.dispose(), []);

  const handleChunk = useCallback(
    (chunk: {
      text: string;
      isFinal: boolean;
      confidence?: number;
      startMs?: number;
      pitchHz?: number;
      sourceText?: string;
      sourceLanguage?: string;
    }) => {
      if (!chunk.isFinal) {
        setInterim(chunk.text);
        return;
      }
      setInterim('');

      if (modeRef.current === 'manuel') {
        onSegment({
          text: chunk.text,
          speaker: manualRef.current,
          confidence: chunk.confidence,
          startMs: chunk.startMs,
          pitchHz: chunk.pitchHz,
          sourceText: chunk.sourceText,
          sourceLanguage: chunk.sourceLanguage,
          speakerLocked: true,
        });
        return;
      }

      const guess = guessFromText(chunk.text);
      setLastDetected({ speaker: guess.speaker, confidence: guess.confidence });
      onSegment({
        text: chunk.text,
        // Un tour non identifie est etiquete « indetermine », jamais attribue
        // au hasard : le praticien le tranchera dans la transcription.
        speaker: guess.speaker,
        confidence: chunk.confidence,
        startMs: chunk.startMs,
        pitchHz: chunk.pitchHz,
        sourceText: chunk.sourceText,
        sourceLanguage: chunk.sourceLanguage,
        speakerLocked: false,
        speakerReasons: guess.reasons,
      });
    },
    [onSegment],
  );

  async function start() {
    setStatus({ state: 'loading' });
    try {
      engineRef.current?.dispose();
      const engine = await createEngine(engineId, lang);
      engineRef.current = engine;
      startedAtRef.current = Date.now();
      setElapsed(0);
      await engine.start({ onChunk: handleChunk, onStatus: setStatus });
      setListening(true);
    } catch (e) {
      setStatus({ state: 'error', message: e instanceof Error ? e.message : 'Demarrage impossible.' });
      setListening(false);
    }
  }

  async function stop() {
    await engineRef.current?.stop();
    setListening(false);
    setInterim('');
    setStatus({ state: 'idle' });
  }

  // Barre d'espace : bascule du locuteur en mode manuel, sans quitter le
  // patient des yeux. Inactive en mode automatique, ou elle n'a pas de sens.
  useEffect(() => {
    if (!listening || mode !== 'manuel') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setManualSpeaker((s) => (s === 'patient' ? 'clinician' : 'patient'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listening, mode]);

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const engine = describeEngine(engineId);
  const blocked = !consent || disabled;
  const loadingModel = status.state === 'loading';

  return (
    <div className="card-pad">
      {/* ------------------------------------------------------- consentement */}
      <label className="mb-5 flex cursor-pointer items-start gap-2.5 rounded-lg bg-brand-soft p-3 text-sm">
        <input
          type="checkbox"
          checked={consent}
          disabled={disabled}
          onChange={(e) => {
            if (!e.target.checked && listening) void stop();
            onConsentChange(e.target.checked);
          }}
          className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
        />
        <span>
          <strong>Consentement du patient recueilli</strong> — le patient a ete informe que l echange est transcrit
          pour alimenter son dossier medical, et a donne son accord.
        </span>
      </label>

      {/* --------------------------------------------------- le grand bouton */}
      <div className="flex flex-col items-center">
        <button
          onClick={() => (listening ? stop() : start())}
          disabled={blocked || loadingModel}
          aria-pressed={listening}
          aria-label={listening ? "Arreter l'enregistrement" : "Demarrer l'enregistrement"}
          className={`relative grid h-40 w-40 place-items-center rounded-full transition-all duration-200 sm:h-48 sm:w-48
            ${
              blocked || loadingModel
                ? 'cursor-not-allowed bg-line text-ink-soft'
                : listening
                  ? 'bg-danger text-white shadow-xl'
                  : 'bg-brand text-white shadow-lg hover:bg-brand-dark active:scale-95'
            }`}
          style={
            listening
              ? { boxShadow: `0 0 0 ${Math.round(level * 26)}px rgba(180, 35, 24, 0.14)` }
              : undefined
          }
        >
          {listening ? (
            <span className="flex flex-col items-center gap-2">
              <span aria-hidden className="block h-12 w-12 rounded-lg bg-white sm:h-14 sm:w-14" />
              <span className="font-mono text-lg font-bold tabular-nums">{mmss}</span>
            </span>
          ) : (
            <span className="flex flex-col items-center gap-2">
              <MicIcon className="h-16 w-16 sm:h-20 sm:w-20" />
              <span className="text-sm font-semibold uppercase tracking-wide">
                {loadingModel ? 'Chargement' : 'Enregistrer'}
              </span>
            </span>
          )}
        </button>

        <p className="mt-3 text-center text-sm font-medium">
          {blocked
            ? 'Recueillez le consentement pour demarrer'
            : listening
              ? 'Enregistrement en cours — appuyez pour arreter'
              : 'Appuyez pour demarrer la consultation'}
        </p>

        {loadingModel && status.progress !== undefined && (
          <div className="mt-3 w-full max-w-sm">
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{ width: `${Math.round(status.progress * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-center text-xs text-ink-soft">{status.message}</p>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------- mode locuteur */}
      <div className="mt-6 rounded-xl border border-line p-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Locuteur</span>
          <div className="inline-flex overflow-hidden rounded-lg border border-line">
            {(
              [
                ['auto', 'Detection automatique'],
                ['manuel', 'Je bascule moi-meme'],
              ] as [Mode, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setMode(value)}
                className={`px-3 py-2 text-sm transition ${
                  mode === value ? 'bg-brand text-white' : 'bg-white text-ink-soft hover:bg-paper'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'auto' && lastDetected && (
            <span
              className={`chip ${
                lastDetected.confidence >= 0.6 ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'
              }`}
            >
              dernier tour : {SPEAKER_LABELS[lastDetected.speaker]}
              {lastDetected.confidence > 0 && ` (${Math.round(lastDetected.confidence * 100)} %)`}
            </span>
          )}
        </div>

        {mode === 'auto' ? (
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            Le locuteur est deduit de la tournure des phrases — qui interroge, qui prescrit, qui se plaint — et de la
            hauteur de la voix. C est une proposition, pas une identification : relisez la transcription, chaque
            etiquette se corrige d un clic.
          </p>
        ) : (
          <div className="mt-2">
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
                  onClick={() => setManualSpeaker(value)}
                  className={`px-3 py-2 text-sm transition ${
                    manualSpeaker === value ? 'bg-brand text-white' : 'bg-white text-ink-soft hover:bg-paper'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {listening && (
              <p className="mt-1.5 text-xs text-ink-soft">
                La barre d espace bascule entre <strong>Patient</strong> et <strong>Medecin</strong>.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------- reglages */}
      <div className="mt-3">
        <button
          className="text-xs font-medium text-brand-dark hover:underline"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
        >
          {settingsOpen ? 'Masquer' : 'Afficher'} les reglages de transcription — {engine.label}
        </button>

        {settingsOpen && (
          <div className="mt-3 space-y-3 rounded-xl border border-line p-3">
            <div>
              <label className="label">Moteur de transcription</label>
              <div className="space-y-2">
                {ENGINES.map((e) => {
                  const unavailable = e.id === 'webspeech' && !isWebSpeechSupported();
                  return (
                    <label
                      key={e.id}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-sm transition ${
                        engineId === e.id ? 'border-brand bg-brand-soft' : 'border-line bg-white'
                      } ${unavailable ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <input
                        type="radio"
                        name="moteur"
                        className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
                        checked={engineId === e.id}
                        disabled={listening || unavailable}
                        onChange={() => setEngineId(e.id)}
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">
                          {e.label}
                          {e.offline && <span className="chip ml-2 bg-ok-soft text-ok">hors-ligne</span>}
                        </span>
                        <span className="block text-xs text-ink-soft">{e.summary}</span>
                        <span className="block text-xs text-ink-soft">{e.privacy}</span>
                        {e.download && <span className="block text-[11px] text-ink-soft">{e.download}</span>}
                        {unavailable && (
                          <span className="block text-[11px] text-warn">Indisponible sur ce navigateur.</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="label" htmlFor="langue">
                Langue de la consultation
              </label>
              <select
                id="langue"
                className="input w-auto"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                disabled={listening}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {interim && (
        <p className="mt-3 rounded-lg border border-dashed border-line bg-paper p-3 text-sm italic text-ink-soft">
          {interim}
        </p>
      )}

      {status.state === 'error' && status.message && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {status.message}
        </p>
      )}
      {status.state === 'listening' && status.message && status.message !== 'Ecoute en cours' && (
        <p className="mt-3 rounded-lg bg-paper p-2 text-xs text-ink-soft">{status.message}</p>
      )}
    </div>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className={className} aria-hidden>
      <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" stroke="none" />
      <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
      <path d="M12 18v4M8.5 22h7" strokeLinecap="round" />
    </svg>
  );
}
