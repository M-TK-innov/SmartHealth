'use client';

import { PitchTracker } from '@/lib/audio/pitch';
import type { EngineId, EngineStatus, TranscriptionChunk, TranscriptionEngine } from './types';

/**
 * Moteurs de transcription autres que Whisper-sur-appareil.
 */

// --------------------------------------------------- reconnaissance navigateur

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

function speechRecognitionConstructor(): (new () => Recognition) | undefined {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

export function isWebSpeechSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(speechRecognitionConstructor());
}

/**
 * Reconnaissance vocale du navigateur.
 *
 * Elle ne donne pas acces au signal audio : on ouvre donc un flux micro en
 * parallele, uniquement pour mesurer la hauteur de voix qui alimente la
 * detection de locuteur. Cet audio n'est ni enregistre ni transmis.
 */
export class WebSpeechEngine implements TranscriptionEngine {
  readonly id = 'webspeech' as const;

  private recognition: Recognition | null = null;
  private wantListening = false;
  private startedAt = 0;

  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private tracker: PitchTracker | null = null;

  constructor(private readonly lang: string = 'fr-FR') {}

  async prepare(onStatus: (s: EngineStatus) => void): Promise<void> {
    if (!isWebSpeechSupported()) {
      onStatus({ state: 'error', message: 'Ce navigateur ne prend pas en charge la reconnaissance vocale.' });
      throw new Error('Web Speech indisponible');
    }
    onStatus({ state: 'ready' });
  }

  private async startPitchTracking() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext();
      this.tracker = new PitchTracker(this.audioContext.sampleRate);
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);
      this.processor.onaudioprocess = (e) => this.tracker?.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      const mute = this.audioContext.createGain();
      mute.gain.value = 0;
      source.connect(this.processor);
      this.processor.connect(mute);
      mute.connect(this.audioContext.destination);
    } catch {
      // La mesure de hauteur est un bonus : son echec ne doit pas empecher
      // de transcrire, seulement priver la detection d'un indice.
      this.tracker = null;
    }
  }

  async start(handlers: {
    onChunk: (c: TranscriptionChunk) => void;
    onStatus: (s: EngineStatus) => void;
  }): Promise<void> {
    await this.prepare(handlers.onStatus);
    await this.startPitchTracking();

    const Ctor = speechRecognitionConstructor()!;
    const rec = new Ctor();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    this.startedAt = Date.now();

    rec.onresult = (e) => {
      let pending = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const alt = res[0];
        if (res.isFinal) {
          const text = alt.transcript.trim();
          if (text) {
            handlers.onChunk({
              text,
              isFinal: true,
              confidence: alt.confidence || undefined,
              startMs: Date.now() - this.startedAt,
              pitchHz: this.tracker?.takeMedian() ?? undefined,
            });
          }
        } else {
          pending += alt.transcript;
        }
      }
      if (pending) handlers.onChunk({ text: pending, isFinal: false });
    };

    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed') {
        this.wantListening = false;
        handlers.onStatus({ state: 'error', message: 'Acces au microphone refuse.' });
      } else {
        handlers.onStatus({ state: 'error', message: `Erreur de reconnaissance : ${e.error}` });
      }
    };

    // Le navigateur coupe la session apres un silence : on relance tant que
    // le praticien n'a pas arrete lui-meme.
    rec.onend = () => {
      if (this.wantListening) {
        try {
          rec.start();
        } catch {
          handlers.onStatus({ state: 'idle' });
        }
      } else {
        handlers.onStatus({ state: 'idle' });
      }
    };

    this.recognition = rec;
    this.wantListening = true;
    rec.start();
    handlers.onStatus({ state: 'listening', message: 'Ecoute en cours' });
  }

  async stop(): Promise<void> {
    this.wantListening = false;
    this.recognition?.stop();
    this.processor?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.audioContext?.close().catch(() => undefined);
    this.processor = null;
    this.stream = null;
    this.audioContext = null;
  }

  dispose(): void {
    this.wantListening = false;
    this.recognition?.abort();
    void this.stop();
  }
}

// ------------------------------------------------------------ Whisper serveur

/**
 * Whisper heberge par l'etablissement.
 *
 * Meme decoupage aux silences que la version sur appareil, mais l'extrait part
 * vers un endpoint interne (whisper.cpp `/inference` ou faster-whisper). Utile
 * quand les postes sont trop modestes pour faire tourner le modele mais qu'un
 * petit serveur existe dans la structure.
 */
export class WhisperServerEngine implements TranscriptionEngine {
  readonly id = 'whisper-serveur' as const;

  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private tracker: PitchTracker | null = null;
  private buffer: Float32Array[] = [];
  private bufferLength = 0;
  private speechMs = 0;
  private silenceMs = 0;
  private startedAt = 0;
  private segmentStartMs = 0;

  constructor(private readonly language: string = 'fr') {}

  async prepare(onStatus: (s: EngineStatus) => void): Promise<void> {
    const res = await fetch('/api/transcription', { method: 'GET' });
    const info = await res.json();
    if (!info.configured) {
      onStatus({
        state: 'error',
        message:
          "Aucun serveur Whisper configure. Renseignez WHISPER_ENDPOINT dans l'environnement du serveur.",
      });
      throw new Error('WHISPER_ENDPOINT absent');
    }
    onStatus({ state: 'ready', message: `Serveur de transcription : ${info.endpoint}` });
  }

  async start(handlers: {
    onChunk: (c: TranscriptionChunk) => void;
    onStatus: (s: EngineStatus) => void;
  }): Promise<void> {
    await this.prepare(handlers.onStatus);

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.tracker = new PitchTracker(this.audioContext.sampleRate);
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.startedAt = Date.now();

    const frameMs = (4096 / this.audioContext.sampleRate) * 1000;

    this.processor.onaudioprocess = (event) => {
      const frame = new Float32Array(event.inputBuffer.getChannelData(0));
      let sum = 0;
      for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
      const rms = Math.sqrt(sum / frame.length);

      if (rms >= 0.008) {
        if (this.speechMs === 0) this.segmentStartMs = Date.now() - this.startedAt;
        this.buffer.push(frame);
        this.bufferLength += frame.length;
        this.speechMs += frameMs;
        this.silenceMs = 0;
        this.tracker?.push(frame);
      } else if (this.speechMs > 0) {
        this.buffer.push(frame);
        this.bufferLength += frame.length;
        this.silenceMs += frameMs;
      }

      if ((this.silenceMs >= 700 && this.speechMs >= 400) || this.speechMs >= 20000) {
        void this.send(handlers.onChunk, handlers.onStatus);
      }
    };

    const mute = this.audioContext.createGain();
    mute.gain.value = 0;
    source.connect(this.processor);
    this.processor.connect(mute);
    mute.connect(this.audioContext.destination);

    handlers.onStatus({ state: 'listening', message: 'Ecoute en cours — transcription sur le serveur local.' });
  }

  private async send(onChunk: (c: TranscriptionChunk) => void, onStatus: (s: EngineStatus) => void) {
    const samples = new Float32Array(this.bufferLength);
    let offset = 0;
    for (const f of this.buffer) {
      samples.set(f, offset);
      offset += f.length;
    }
    const startMs = this.segmentStartMs;
    const endMs = Date.now() - this.startedAt;
    const pitchHz = this.tracker?.takeMedian() ?? undefined;

    this.buffer = [];
    this.bufferLength = 0;
    this.speechMs = 0;
    this.silenceMs = 0;

    try {
      const wav = encodeWav(samples, this.audioContext?.sampleRate ?? 16000);
      const form = new FormData();
      form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'extrait.wav');
      form.append('language', this.language);

      const res = await fetch('/api/transcription', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const text = String(data.text ?? '').trim();
      if (text) onChunk({ text, isFinal: true, startMs, endMs, pitchHz });
    } catch (e) {
      onStatus({
        state: 'error',
        message: `Extrait non transcrit : ${e instanceof Error ? e.message : 'serveur injoignable'}`,
      });
    }
  }

  async stop(): Promise<void> {
    this.processor?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.audioContext?.close().catch(() => undefined);
    this.processor = null;
    this.stream = null;
    this.audioContext = null;
  }

  dispose(): void {
    void this.stop();
  }
}

/** PCM flottant vers WAV 16 bits : le format que tous les Whisper acceptent. */
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

export async function createEngine(id: EngineId, language: string): Promise<TranscriptionEngine> {
  if (id === 'whisper-local') {
    const { WhisperLocalEngine } = await import('./whisper');
    return new WhisperLocalEngine(language === 'fr-FR' ? 'french' : 'english');
  }
  if (id === 'whisper-serveur') return new WhisperServerEngine(language.slice(0, 2));
  return new WebSpeechEngine(language);
}
