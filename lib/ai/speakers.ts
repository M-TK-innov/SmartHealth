/**
 * Attribution automatique du locuteur : medecin, patient ou accompagnant.
 *
 * AVERTISSEMENT SUR CE QUE FAIT REELLEMENT CE MODULE
 * Ce n'est pas de la diarisation par biometrie vocale. Une vraie diarisation
 * compare des empreintes vocales (pyannote, WeSpeaker) et demande un modele
 * dedie. Ici on combine deux signaux beaucoup plus simples :
 *
 *   1. LINGUISTIQUE — qui pose les questions, qui prescrit, qui dit « docteur ».
 *      Dans une consultation, les roles conversationnels sont tres marques :
 *      c'est le signal le plus fiable, et il ne coute rien.
 *   2. ACOUSTIQUE — la hauteur moyenne de la voix (F0), mesuree cote client.
 *      Elle ne dit pas QUI parle, mais elle dit QUAND on change de personne.
 *      On s'en sert pour regrouper les tours de parole, pas pour identifier.
 *
 * Le resultat est une PROPOSITION assortie d'une confiance. Le praticien
 * corrige d'un geste, et sa correction fait autorite : elle n'est jamais
 * ecrasee par une re-analyse.
 */

import { normalizeText } from '../terminology/index.ts';

export type Speaker = 'clinician' | 'patient' | 'companion' | 'unknown';

export interface SpeakerHint {
  /** Hauteur moyenne de la voix sur le segment, en Hz (mesuree cote client). */
  pitchHz?: number;
  /** Locuteur choisi manuellement : fait autorite, aucune heuristique ne le contredit. */
  manual?: Speaker;
}

export interface SpeakerGuess {
  speaker: Speaker;
  confidence: number;
  /** Ce qui a motive la decision, affiche au praticien pour qu'il puisse juger. */
  reasons: string[];
}

// ------------------------------------------------------- indices linguistiques

interface Cue {
  pattern: RegExp;
  weight: number;
  label: string;
}

/** Tournures propres au soignant. */
const CLINICIAN_CUES: Cue[] = [
  { pattern: /\bje vous prescris\b|\bje te prescris\b|\bje prescris\b/, weight: 5, label: 'prescription' },
  { pattern: /\bordonnance\b|\bje vous mets\b|\bon va donner\b/, weight: 3, label: 'ordonnance' },
  { pattern: /\bje vais (vous )?examiner\b|\bdeshabillez-vous\b|\ballongez-vous\b|\brespirez\b/, weight: 4, label: 'examen' },
  { pattern: /\b(depuis quand|est-ce que vous|avez-vous|ressentez-vous|prenez-vous|souffrez-vous)\b/, weight: 4, label: 'question au patient' },
  { pattern: /\b(votre tension|votre temperature|votre poids|votre pouls) (est|se situe)\b/, weight: 4, label: 'annonce de constante' },
  { pattern: /\b(auscultation|palpation|tympans?|conjonctives?|abdomen souple|bruits du coeur)\b/, weight: 4, label: 'vocabulaire d examen' },
  { pattern: /\b(revenez|reconsultez|revenez me voir|controle dans)\b/, weight: 3, label: 'consigne de suivi' },
  { pattern: /\b(je pense a|il s agit d|le tableau evoque|suspicion de|diagnostic de)\b/, weight: 4, label: 'formulation diagnostique' },
  { pattern: /\b(on va faire|je demande|il faut faire) (un|une|des)\b/, weight: 3, label: 'demande d examen' },
  // Indices separes plutot qu'une seule alternation : deux formules d'accueil
  // dans la meme phrase doivent peser deux fois, pas une.
  { pattern: /\bbonjour (madame|monsieur|mademoiselle)\b/, weight: 3, label: 'salutation' },
  { pattern: /\b(asseyez-vous|installez-vous|entrez)\b/, weight: 3, label: 'invitation a s installer' },
  { pattern: /\bqu est-ce qui (vous )?amene\b/, weight: 5, label: 'ouverture de consultation' },
  { pattern: /\b(prenez|prends) (ce|cette|un|une|le|la)\b/, weight: 2, label: 'instruction' },
  { pattern: /\b(fois par jour|pendant \w+ jours?|au cours des repas|a jeun)\b/, weight: 2, label: 'posologie' },
  { pattern: /\b(je vais|on va) (l |le |la |vous )?(examiner|ausculter|peser|mesurer)\b/, weight: 4, label: 'annonce d examen' },
];

/** Tournures propres a la personne soignee. */
const PATIENT_CUES: Cue[] = [
  { pattern: /\bdocteur\b|\bdoc\b/, weight: 4, label: 'interpelle le medecin' },
  { pattern: /\bj ai mal\b|\bj ai de la\b|\bje souffre\b|\bje ressens\b/, weight: 5, label: 'plainte a la premiere personne' },
  { pattern: /\bje (tousse|vomis|saigne|dors mal|maigris)\b/, weight: 5, label: 'symptome a la premiere personne' },
  { pattern: /\bca me (fait mal|gratte|brule|gene)\b/, weight: 4, label: 'ressenti' },
  { pattern: /\bmon (ventre|dos|bras|pied|coeur|estomac|corps)\b|\bma (tete|gorge|jambe|poitrine)\b/, weight: 3, label: 'partie du corps possessive' },
  { pattern: /\bje prends\b|\bj ai pris\b|\bje suis sous\b/, weight: 3, label: 'traitement personnel' },
  { pattern: /\b(oui|non) docteur\b|^\s*(oui|non)\b/, weight: 2, label: 'reponse breve' },
  { pattern: /\bdepuis (trois|deux|quatre|cinq|\d+) (jours?|semaines?|mois)\b/, weight: 2, label: 'duree rapportee' },
  { pattern: /\bje ne (peux|arrive) pas\b/, weight: 3, label: 'limitation rapportee' },
];

/** Tournures de l'accompagnant : parle d'un tiers, pas de lui-meme. */
const COMPANION_CUES: Cue[] = [
  { pattern: /\bil (a|est|tousse|vomit|pleure|refuse|ne mange)\b/, weight: 3, label: 'parle a la troisieme personne' },
  { pattern: /\belle (a|est|tousse|vomit|pleure|refuse|ne mange)\b/, weight: 3, label: 'parle a la troisieme personne' },
  { pattern: /\bmon (fils|enfant|bebe|mari|pere|frere)\b|\bma (fille|femme|mere|soeur)\b/, weight: 5, label: 'designe un proche' },
  { pattern: /\ble petit\b|\bla petite\b|\ble bebe\b/, weight: 4, label: 'designe un enfant' },
];

/**
 * L'enonce est-il une question ?
 *
 * C'est le signal le plus discriminant d'une consultation : l'interrogatoire
 * appartient au soignant. On accepte le point d'interrogation, mais aussi les
 * tournures interrogatives sans ponctuation — la reconnaissance vocale ne
 * place presque jamais de « ? ».
 */
function isQuestion(text: string, raw: string): boolean {
  if (raw.trim().endsWith('?')) return true;
  return /(^|\b)(est-ce qu|qu est-ce|depuis quand|combien|pourquoi|comment|ou avez|quand avez|avez-vous|as-tu|a-t-il|a-t-elle|prenez-vous|ressentez-vous|souffrez-vous|y a-t-il)\b/.test(
    text,
  );
}

function scoreCues(text: string, cues: Cue[]): { score: number; labels: string[] } {
  let score = 0;
  const labels: string[] = [];
  for (const cue of cues) {
    if (cue.pattern.test(text)) {
      score += cue.weight;
      labels.push(cue.label);
    }
  }
  return { score, labels };
}

/**
 * Attribution linguistique d'un tour de parole isole.
 * Renvoie `unknown` quand rien ne tranche : mieux vaut demander au praticien
 * que d'attribuer au hasard une phrase qui finira dans un dossier medical.
 */
export function guessFromText(raw: string): SpeakerGuess {
  const text = normalizeText(raw);
  if (!text) return { speaker: 'unknown', confidence: 0, reasons: [] };

  const clinician = scoreCues(text, CLINICIAN_CUES);
  const patient = scoreCues(text, PATIENT_CUES);
  const companion = scoreCues(text, COMPANION_CUES);

  // Une question appartient a l'interrogatoire, donc au soignant. C'est la
  // regle la plus rentable en consultation, et celle qui manquait le plus :
  // « Est-ce qu il vomit ? » est le medecin qui interroge l'accompagnant, pas
  // l'accompagnant qui parle de son enfant.
  //
  // Exception : celui qui dit « docteur » s'adresse au medecin, donc n'est pas
  // le medecin. « Docteur, c'est grave ? » est une question du patient, et la
  // regle ne doit pas s'y appliquer.
  const addressesClinician = /\bdocteur\b|\bdoc\b/.test(text);

  if (isQuestion(text, raw) && !addressesClinician) {
    clinician.score += 5;
    clinician.labels.push('forme interrogative');

    // Le medecin interroge AUSSI a la troisieme personne quand il parle d'un
    // enfant. Les indices de tierce personne ne valent donc rien dans une
    // question : les neutraliser evite d'attribuer tout l'interrogatoire
    // pediatrique a l'accompagnant.
    companion.score = 0;
    companion.labels.length = 0;
    // Idem pour la reponse breve « oui / non », qui n'a pas de sens ici.
    patient.score = Math.max(0, patient.score - 2);
  }

  // « Docteur, il a le corps chaud » : la personne s'adresse au medecin ET
  // parle d'un tiers. C'est l'accompagnant, pas le patient — l'interpellation
  // seule ne suffit donc pas a conclure « patient ».
  if (addressesClinician && companion.score > 0) {
    companion.score += 4;
    companion.labels.push('interpelle le medecin au sujet d un tiers');
  }

  // L'accompagnant est un patient qui parle d'un tiers : on ne le retient que
  // s'il domine nettement, sinon toute mention « il a » basculerait a tort.
  const ranked: [Speaker, number, string[]][] = [
    ['clinician', clinician.score, clinician.labels],
    ['patient', patient.score, patient.labels],
    ['companion', companion.score, companion.labels],
  ].sort((a, b) => (b[1] as number) - (a[1] as number)) as [Speaker, number, string[]][];

  const [best, bestScore, bestLabels] = ranked[0];
  const secondScore = ranked[1][1];

  if (bestScore === 0) return { speaker: 'unknown', confidence: 0, reasons: [] };

  // L'ecart avec le second compte autant que le score absolu : deux indices
  // contradictoires valent moins qu'un seul indice franc.
  const margin = bestScore - secondScore;
  const confidence = Math.min(0.95, 0.35 + bestScore * 0.06 + margin * 0.06);

  return { speaker: best, confidence: Number(confidence.toFixed(2)), reasons: bestLabels };
}

// -------------------------------------------------------- indices acoustiques

/**
 * Regroupe des hauteurs de voix en deux ensembles.
 *
 * On coupe au PLUS GRAND ECART entre deux valeurs consecutives, et non a la
 * mediane : avec un nombre pair de mesures, la mediane tombe sur une valeur
 * qui appartient deja a l'un des deux groupes et le deforme. Chercher le trou
 * le plus large revient a demander « ou la conversation change-t-elle de
 * voix ? », ce qui est exactement la question posee.
 *
 * Deliberement rudimentaire : une seule dimension, deux classes. Deux voix de
 * tessiture proche ne seront pas separees — et ce module ne pretend pas le
 * faire.
 */
export function clusterByPitch(pitches: (number | undefined)[]): {
  low: number[];
  high: number[];
  threshold: number | null;
} {
  const values = pitches.filter((p): p is number => typeof p === 'number' && p > 50 && p < 500);
  if (values.length < 4) return { low: [], high: [], threshold: null };

  const sorted = [...values].sort((a, b) => a - b);

  let gap = 0;
  let cutAfter = -1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const delta = sorted[i + 1] - sorted[i];
    if (delta > gap) {
      gap = delta;
      cutAfter = i;
    }
  }

  // Sous 40 Hz d'ecart, rien ne dit qu'il y a deux personnes plutot qu'une
  // seule dont la voix module : on n'invente pas un second locuteur.
  if (gap < 40 || cutAfter < 0) return { low: [], high: [], threshold: null };

  const threshold = (sorted[cutAfter] + sorted[cutAfter + 1]) / 2;

  const low: number[] = [];
  const high: number[] = [];
  pitches.forEach((p, i) => {
    if (typeof p !== 'number' || p <= 50 || p >= 500) return;
    (p <= threshold ? low : high).push(i);
  });
  return { low, high, threshold };
}

// ------------------------------------------------------------- combinaison

export interface Utterance {
  text: string;
  hint?: SpeakerHint;
}

export interface AttributedUtterance extends SpeakerGuess {
  index: number;
  /** true si le praticien a fixe le locuteur : intouchable. */
  locked: boolean;
}

/**
 * Attribue un locuteur a chaque tour de parole d'une consultation.
 *
 * Deroule :
 *   1. les choix manuels sont poses et ne bougent plus ;
 *   2. chaque tour est classe sur ses indices linguistiques ;
 *   3. si des hauteurs de voix sont disponibles, on les regroupe en deux
 *      ensembles, on regarde lequel contient le plus de tours deja identifies
 *      comme soignants, et on propage cette etiquette aux tours restes
 *      indecis du meme groupe.
 *
 * L'etape 3 est ce qui rattrape les phrases neutres (« d'accord », « oui »)
 * qu'aucun indice linguistique ne permet de classer.
 */
export function attributeSpeakers(utterances: Utterance[]): AttributedUtterance[] {
  const result: AttributedUtterance[] = utterances.map((u, index) => {
    if (u.hint?.manual) {
      return { index, speaker: u.hint.manual, confidence: 1, reasons: ['choix du praticien'], locked: true };
    }
    return { ...guessFromText(u.text), index, locked: false };
  });

  const clusters = clusterByPitch(utterances.map((u) => u.hint?.pitchHz));
  if (clusters.threshold === null) return result;

  const clinicianShare = (group: number[]) => {
    const decided = group.filter((i) => result[i].speaker !== 'unknown');
    if (decided.length === 0) return 0;
    return decided.filter((i) => result[i].speaker === 'clinician').length / decided.length;
  };

  const lowShare = clinicianShare(clusters.low);
  const highShare = clinicianShare(clusters.high);

  // Sans majorite claire d'un cote, la hauteur n'apporte rien d'exploitable.
  if (Math.abs(lowShare - highShare) < 0.3) return result;

  const clinicianGroup = lowShare > highShare ? clusters.low : clusters.high;
  const otherGroup = lowShare > highShare ? clusters.high : clusters.low;

  for (const i of clinicianGroup) {
    if (result[i].locked || result[i].speaker !== 'unknown') continue;
    result[i] = {
      ...result[i],
      speaker: 'clinician',
      confidence: 0.5,
      reasons: ['hauteur de voix proche des tours du soignant'],
    };
  }
  for (const i of otherGroup) {
    if (result[i].locked || result[i].speaker !== 'unknown') continue;
    result[i] = {
      ...result[i],
      speaker: 'patient',
      confidence: 0.45,
      reasons: ['hauteur de voix distincte de celle du soignant'],
    };
  }

  return result;
}

/** Seuil au-dela duquel la proposition s'applique sans confirmation. */
export const AUTO_APPLY_THRESHOLD = 0.6;

export const SPEAKER_LABELS: Record<Speaker, string> = {
  clinician: 'Medecin',
  patient: 'Patient',
  companion: 'Accompagnant',
  unknown: 'Indetermine',
};
