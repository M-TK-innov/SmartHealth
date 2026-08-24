/**
 * Contrat commun aux moteurs de transcription.
 *
 * Trois implementations partagent cette interface :
 *   - `webspeech` : reconnaissance du navigateur. Gratuite, instantanee,
 *     mais elle envoie l'audio aux serveurs de l'editeur du navigateur et
 *     n'existe pas sur tous les appareils.
 *   - `whisper-local` : Whisper (OpenAI, licence MIT) execute DANS le
 *     navigateur via transformers.js. Rien ne sort de l'appareil. Le modele
 *     est telecharge une fois puis mis en cache.
 *   - `whisper-serveur` : POST de l'audio vers un whisper.cpp ou
 *     faster-whisper heberge par l'etablissement.
 *
 * Le choix est clinique autant que technique : dans un cabinet, la
 * confidentialite peut interdire `webspeech`, et un poste ancien peut ne pas
 * tenir `whisper-local`. L'interface permet d'en changer sans toucher au
 * reste de l'application.
 */

export type EngineId = 'webspeech' | 'whisper-local' | 'whisper-serveur';

export interface TranscriptionChunk {
  text: string;
  /** true quand le texte est definitif ; false pour un resultat provisoire. */
  isFinal: boolean;
  confidence?: number;
  /** Debut du tour de parole, en millisecondes depuis le debut de l'enregistrement. */
  startMs?: number;
  endMs?: number;
  /** Hauteur mediane de la voix sur ce tour, si le moteur peut la mesurer. */
  pitchHz?: number;
}

export interface EngineStatus {
  state: 'idle' | 'loading' | 'ready' | 'listening' | 'error';
  /** Progression du telechargement du modele, de 0 a 1. */
  progress?: number;
  message?: string;
}

export interface TranscriptionEngine {
  readonly id: EngineId;
  /** Prepare le moteur (telechargement du modele le cas echeant). */
  prepare(onStatus: (s: EngineStatus) => void): Promise<void>;
  start(handlers: { onChunk: (c: TranscriptionChunk) => void; onStatus: (s: EngineStatus) => void }): Promise<void>;
  stop(): Promise<void>;
  dispose(): void;
}

export interface EngineDescriptor {
  id: EngineId;
  label: string;
  /** Ce que le praticien doit savoir avant de choisir. */
  summary: string;
  privacy: string;
  /** Poids approximatif a telecharger la premiere fois. */
  download?: string;
  offline: boolean;
}

export const ENGINES: EngineDescriptor[] = [
  {
    id: 'webspeech',
    label: 'Reconnaissance du navigateur',
    summary: 'Immediate, aucun telechargement. Chrome et Edge uniquement.',
    privacy: "L'audio transite par les serveurs de l'editeur du navigateur.",
    offline: false,
  },
  {
    id: 'whisper-local',
    label: 'Whisper — sur l appareil',
    summary: 'Modele open source execute dans le navigateur. Meilleure qualite en francais.',
    privacy: "L'audio ne quitte jamais l'appareil.",
    download: '~85 Mo la premiere fois, puis mis en cache',
    offline: true,
  },
  {
    id: 'whisper-serveur',
    label: 'Whisper — serveur de l etablissement',
    summary: 'Envoie l audio a un whisper.cpp ou faster-whisper heberge localement.',
    privacy: "L'audio reste sur le reseau de l'etablissement.",
    offline: true,
  },
];

export function describeEngine(id: EngineId): EngineDescriptor {
  return ENGINES.find((e) => e.id === id) ?? ENGINES[0];
}
