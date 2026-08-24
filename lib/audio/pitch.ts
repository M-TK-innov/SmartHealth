/**
 * Estimation de la hauteur fondamentale (F0) d'un extrait de voix.
 *
 * Sert d'indice de changement de locuteur, pas d'identification : deux
 * personnes de tessiture voisine ne seront pas separees, et ce module ne
 * pretend pas le faire. Il repond a une question plus modeste et beaucoup
 * plus fiable : « la voix qui parle maintenant est-elle plus grave ou plus
 * aigue que la precedente ? »
 *
 * Methode : autocorrelation normalisee sur la trame, avec seuil d'energie
 * pour ecarter le silence. Aucune dependance : cela tourne sur le telephone
 * d'un centre de sante sans rien telecharger.
 */

/** Plage utile de la voix parlee humaine, en hertz. */
const MIN_HZ = 70;
const MAX_HZ = 400;

/** En deca, la trame est du silence ou du bruit de fond : on ne mesure rien. */
const SILENCE_RMS = 0.01;

/**
 * F0 d'une trame unique par autocorrelation.
 * @returns la frequence en Hz, ou null si la trame est trop faible ou aperiodique.
 */
export function estimatePitch(frame: Float32Array, sampleRate: number): number | null {
  const size = frame.length;
  if (size < 512) return null;

  // Energie : une trame silencieuse n'a pas de hauteur.
  let sumSquares = 0;
  for (let i = 0; i < size; i++) sumSquares += frame[i] * frame[i];
  const rms = Math.sqrt(sumSquares / size);
  if (rms < SILENCE_RMS) return null;

  const minLag = Math.floor(sampleRate / MAX_HZ);
  const maxLag = Math.min(Math.floor(sampleRate / MIN_HZ), Math.floor(size / 2));
  if (maxLag <= minLag) return null;

  let bestLag = -1;
  let bestScore = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0;
    let energyA = 0;
    let energyB = 0;
    for (let i = 0; i < size - lag; i++) {
      correlation += frame[i] * frame[i + lag];
      energyA += frame[i] * frame[i];
      energyB += frame[i + lag] * frame[i + lag];
    }
    const denominator = Math.sqrt(energyA * energyB);
    if (denominator === 0) continue;
    const score = correlation / denominator;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  // Sous 0,5 de correlation normalisee, le signal n'est pas assez periodique
  // pour qu'on puisse parler de hauteur : c'est probablement une consonne.
  if (bestLag < 0 || bestScore < 0.5) return null;

  return sampleRate / bestLag;
}

/**
 * Hauteur representative d'un tour de parole complet.
 *
 * On decoupe en trames, on jette les trames sans hauteur, puis on prend la
 * MEDIANE et non la moyenne : une seule trame mal estimee (octave doublee,
 * bruit) suffirait a fausser une moyenne, alors qu'elle ne deplace pas une
 * mediane.
 */
export function medianPitch(samples: Float32Array, sampleRate: number): number | null {
  const frameSize = 2048;
  const hop = 1024;
  const pitches: number[] = [];

  for (let start = 0; start + frameSize <= samples.length; start += hop) {
    const f0 = estimatePitch(samples.subarray(start, start + frameSize), sampleRate);
    if (f0 !== null) pitches.push(f0);
  }

  // Moins de trois trames voisees : l'extrait est trop court ou trop bruite.
  if (pitches.length < 3) return null;

  pitches.sort((a, b) => a - b);
  return Math.round(pitches[Math.floor(pitches.length / 2)]);
}

/**
 * Accumulateur de hauteur en temps reel.
 *
 * Le composant d'enregistrement lui pousse les trames au fil de l'eau et lui
 * demande une mediane a chaque fin de tour de parole, sans jamais conserver
 * l'audio : seules des frequences sont gardees en memoire.
 */
export class PitchTracker {
  private pitches: number[] = [];

  constructor(private readonly sampleRate: number) {}

  push(frame: Float32Array): void {
    const f0 = estimatePitch(frame, this.sampleRate);
    if (f0 !== null) this.pitches.push(f0);
    // borne haute : au-dela on ne gagne plus en precision, on gagne en memoire perdue
    if (this.pitches.length > 400) this.pitches.splice(0, this.pitches.length - 400);
  }

  /** Mediane des trames accumulees, puis remise a zero pour le tour suivant. */
  takeMedian(): number | null {
    if (this.pitches.length < 3) {
      this.pitches = [];
      return null;
    }
    const sorted = [...this.pitches].sort((a, b) => a - b);
    const median = Math.round(sorted[Math.floor(sorted.length / 2)]);
    this.pitches = [];
    return median;
  }

  reset(): void {
    this.pitches = [];
  }
}
