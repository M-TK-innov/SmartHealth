'use client';

import { PitchTracker, medianPitch } from '@/lib/audio/pitch';
import type { EngineStatus, TranscriptionChunk, TranscriptionEngine } from './types';

/**
 * Whisper execute dans le navigateur (transformers.js + ONNX Runtime Web).
 *
 * Whisper est publie par OpenAI sous licence MIT ; les poids utilises ici sont
 * la version quantifiee « small » multilingue de la communaute Xenova. Tout
 * s'execute sur l'appareil : aucun octet d'audio ne part sur le reseau, ce qui
 * est la seule configuration defendable pour une consultation dans beaucoup de
 * cadres reglementaires.
 *
 * DECOUPAGE PAR SILENCE
 * Whisper transcrit un bloc audio, il ne fonctionne pas en flux continu. On
 * decoupe donc la parole aux silences : chaque tour de parole devient un bloc
 * envoye au modele. C'est aussi ce decoupage qui donne l'unite de base de
 * l'attribution de locuteur — un silence marque le plus souvent un changement
 * de personne.
 */

const MODEL_ID = 'Xenova/whisper-small';

/**
 * L'installation sert-elle les poids du modele ?
 *
 * Une simple requete sur le fichier de configuration suffit : il pese quelques
 * centaines d'octets et sa presence garantit que le dossier a ete depose. On
 * ne teste pas les poids eux-memes, qui font des centaines de mega-octets.
 */
async function modeleServiLocalement(): Promise<boolean> {
  try {
    const res = await fetch(`/modeles/${MODEL_ID}/config.json`, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}
const SAMPLE_RATE = 16000;

/** Seuil d'energie sous lequel on considere qu'il n'y a plus de parole. */
const SILENCE_RMS = 0.008;
/** Duree de silence qui clot un tour de parole. */
const SILENCE_MS = 700;
/** En deca, l'extrait est trop court pour etre transcrit utilement. */
const MIN_SPEECH_MS = 400;
/** Au-dela, on decoupe meme sans silence : un monologue ne doit pas tout bloquer. */
const MAX_SEGMENT_MS = 20000;

type Pipeline = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<{ text: string } | { text: string }[]>;

export class WhisperLocalEngine implements TranscriptionEngine {
  readonly id = 'whisper-local' as const;

  private pipeline: Pipeline | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  private buffer: Float32Array[] = [];
  private bufferLength = 0;
  private silenceMs = 0;
  private speechMs = 0;
  private startedAt = 0;
  private segmentStartMs = 0;
  private tracker: PitchTracker | null = null;
  private transcribing = false;
  private queue: { samples: Float32Array; startMs: number; endMs: number; pitchHz: number | null }[] = [];

  constructor(private readonly language: string = 'french') {}

  async prepare(onStatus: (s: EngineStatus) => void): Promise<void> {
    if (this.pipeline) {
      onStatus({ state: 'ready' });
      return;
    }

    onStatus({ state: 'loading', progress: 0, message: 'Preparation du modele Whisper...' });

    // Import dynamique : la bibliotheque (plusieurs Mo) n'est chargee que si le
    // praticien choisit reellement ce moteur.
    const { pipeline, env } = await import('@huggingface/transformers');

    // Le modele est-il servi par cette installation ?
    //
    // C'est la difference entre un dispensaire qui dispose d'un moteur local et
    // un dispensaire qui n'en a aucun : sans les poids sur place, ce moteur —
    // le seul qui ne fasse rien sortir de l'appareil — exige une connexion au
    // premier usage, et reste donc indisponible la ou il sert le plus.
    const local = await modeleServiLocalement();

    if (local) {
      env.allowLocalModels = true;
      env.localModelPath = '/modeles/';
      // Coupe la sortie reseau : si un fichier manque, on veut un echec franc
      // plutot qu'un telechargement silencieux qui trahirait la promesse
      // « tout reste sur l'appareil » d'un poste declare hors ligne.
      env.allowRemoteModels = false;
    } else {
      env.allowLocalModels = false;
    }

    const asr = await pipeline('automatic-speech-recognition', MODEL_ID, {
      dtype: 'q8',
      progress_callback: (p: { status: string; progress?: number; file?: string }) => {
        if (p.status === 'progress' && typeof p.progress === 'number') {
          onStatus({
            state: 'loading',
            progress: p.progress / 100,
            message: local
              ? `Chargement du modele (${Math.round(p.progress)} %)`
              : `Telechargement du modele (${Math.round(p.progress)} %)`,
          });
        } else if (p.status === 'ready' || p.status === 'done') {
          onStatus({ state: 'loading', progress: 1, message: 'Preparation du modele...' });
        }
      },
    });

    this.pipeline = asr as unknown as Pipeline;
    onStatus({
      state: 'ready',
      message: local
        ? 'Modele pret, servi par cette installation. Tout reste sur cet appareil.'
        : 'Modele pret, telecharge puis mis en cache. Tout reste sur cet appareil.',
    });
  }

  async start(handlers: {
    onChunk: (c: TranscriptionChunk) => void;
    onStatus: (s: EngineStatus) => void;
  }): Promise<void> {
    await this.prepare(handlers.onStatus);

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.source = this.audioContext.createMediaStreamSource(this.stream);

    const frameSize = 4096;
    this.processor = this.audioContext.createScriptProcessor(frameSize, 1, 1);
    this.tracker = new PitchTracker(this.audioContext.sampleRate);
    this.startedAt = Date.now();
    this.segmentStartMs = 0;

    const frameMs = (frameSize / this.audioContext.sampleRate) * 1000;

    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const frame = new Float32Array(input);

      let sumSquares = 0;
      for (let i = 0; i < frame.length; i++) sumSquares += frame[i] * frame[i];
      const rms = Math.sqrt(sumSquares / frame.length);
      const speaking = rms >= SILENCE_RMS;

      if (speaking) {
        if (this.speechMs === 0) this.segmentStartMs = Date.now() - this.startedAt;
        this.buffer.push(frame);
        this.bufferLength += frame.length;
        this.speechMs += frameMs;
        this.silenceMs = 0;
        this.tracker?.push(frame);
      } else if (this.speechMs > 0) {
        // On garde un peu de silence : Whisper transcrit mieux avec la fin du mot.
        this.buffer.push(frame);
        this.bufferLength += frame.length;
        this.silenceMs += frameMs;
      }

      const shouldFlush =
        (this.silenceMs >= SILENCE_MS && this.speechMs >= MIN_SPEECH_MS) || this.speechMs >= MAX_SEGMENT_MS;

      if (shouldFlush) this.flushSegment(handlers.onChunk, handlers.onStatus);
    };

    this.source.connect(this.processor);
    // Un ScriptProcessor doit etre connecte a la destination pour tourner ; on
    // passe par un gain a zero pour ne pas renvoyer la voix dans les haut-parleurs.
    const mute = this.audioContext.createGain();
    mute.gain.value = 0;
    this.processor.connect(mute);
    mute.connect(this.audioContext.destination);

    handlers.onStatus({ state: 'listening', message: 'Ecoute en cours — traitement sur l appareil.' });
  }

  private flushSegment(onChunk: (c: TranscriptionChunk) => void, onStatus: (s: EngineStatus) => void) {
    const samples = new Float32Array(this.bufferLength);
    let offset = 0;
    for (const frame of this.buffer) {
      samples.set(frame, offset);
      offset += frame.length;
    }

    const endMs = Date.now() - this.startedAt;
    const startMs = this.segmentStartMs;
    const pitchHz = this.tracker?.takeMedian() ?? medianPitch(samples, this.audioContext?.sampleRate ?? SAMPLE_RATE);

    this.buffer = [];
    this.bufferLength = 0;
    this.speechMs = 0;
    this.silenceMs = 0;

    this.queue.push({ samples, startMs, endMs, pitchHz });
    void this.drainQueue(onChunk, onStatus);
  }

  /**
   * Transcription sequentielle.
   * Deux appels simultanes au modele sur un poste modeste le mettent a genoux :
   * on serialise, quitte a accumuler du retard pendant un echange rapide.
   */
  private async drainQueue(onChunk: (c: TranscriptionChunk) => void, onStatus: (s: EngineStatus) => void) {
    if (this.transcribing) return;
    this.transcribing = true;

    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!;
        if (!this.pipeline) break;

        if (this.queue.length > 0) {
          onStatus({ state: 'listening', message: `Transcription... ${this.queue.length} extrait(s) en attente` });
        }

        try {
          const output = await this.pipeline(job.samples, {
            language: this.language,
            task: 'transcribe',
            chunk_length_s: 30,
            stride_length_s: 5,
          });
          const text = (Array.isArray(output) ? output.map((o) => o.text).join(' ') : output.text).trim();

          // Whisper produit ces mentions sur du silence ou du bruit : ce ne sont
          // pas des paroles, elles n'ont rien a faire dans un dossier medical.
          if (text && !/^[\s.]*$/.test(text) && !/^\(?(musique|silence|sous-titr|bruit)/i.test(text)) {
            onChunk({
              text,
              isFinal: true,
              startMs: job.startMs,
              endMs: job.endMs,
              pitchHz: job.pitchHz ?? undefined,
            });
          }
        } catch (e) {
          onStatus({
            state: 'error',
            message: `Extrait non transcrit : ${e instanceof Error ? e.message : 'erreur du modele'}`,
          });
        }
      }
    } finally {
      this.transcribing = false;
      if (this.stream?.active) onStatus({ state: 'listening', message: 'Ecoute en cours' });
    }
  }

  async stop(): Promise<void> {
    // Le dernier tour de parole ne doit pas etre perdu a l'arret.
    if (this.speechMs >= MIN_SPEECH_MS) {
      this.flushSegment(
        () => undefined,
        () => undefined,
      );
    }

    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.audioContext?.close().catch(() => undefined);

    this.processor = null;
    this.source = null;
    this.stream = null;
    this.audioContext = null;
    this.tracker?.reset();
  }

  dispose(): void {
    void this.stop();
    // Le modele reste en memoire : le recharger a chaque consultation couterait
    // plusieurs secondes pour rien.
  }
}
