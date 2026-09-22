/**
 * Reconnaissance des mots-cles cliniques apres transcription.
 *
 * Un moteur de reconnaissance vocale, si bon soit-il, n'a jamais entendu
 * « artemether-lumefantrine » aussi souvent que « arrete me ter ». Deux leviers
 * corrigent cela, et ce fichier porte le second :
 *
 *   1. le BIAISAGE, en amont : on donne au moteur la liste des termes attendus
 *      (`initial_prompt` cote whisper.cpp / faster-whisper / Griot) ;
 *   2. la NORMALISATION, en aval : on rapproche les quasi-manques du terme
 *      canonique du formulaire, ici.
 *
 * La regle de prudence est la meme que pour l'attribution du locuteur : en cas
 * d'ambiguite, on ne corrige pas. Une posologie corrigee vers le mauvais
 * principe actif est pire qu'une posologie mal orthographiee, parce que la
 * premiere est plausible et passera la relecture.
 *
 * Ce module est volontairement SANS IMPORT : c'est de la logique pure, donc
 * directement executable par `node --test`, comme `lib/ai/speakers.ts`.
 * Le lexique lui-meme est assemble dans `clinical-lexicon.ts`.
 */

export interface LexiconTerm {
  /** Forme affichee, telle qu'elle doit apparaitre dans la transcription. */
  canonical: string;
  /** Variantes acceptees telles quelles (marques, abreviations, synonymes). */
  variants?: string[];
  /**
   * Poids dans le prompt de biaisage. Les moteurs tronquent ce prompt
   * (Whisper : ~224 jetons), donc l'ordre compte : le paludisme passe avant
   * l'hypertension, l'epidemiologie locale avant le reste.
   */
  weight?: number;
}

export interface KeywordCorrection {
  /** Texte tel que le moteur l'a rendu. */
  from: string;
  /** Terme canonique retenu. */
  to: string;
  /** Distance d'edition entre les deux formes normalisees. */
  distance: number;
  /** Position du remplacement dans le texte d'origine. */
  index: number;
}

export interface NormalizationResult {
  text: string;
  corrections: KeywordCorrection[];
}

export interface LexiconIndex {
  /** Forme normalisee -> forme canonique. Contient variantes et canoniques. */
  exact: Map<string, string>;
  /** Formes normalisees candidates a la correction approchee, avec leur longueur. */
  fuzzy: { form: string; canonical: string; len: number; words: number }[];
  /** Nombre maximal de mots d'un terme du lexique (borne la fenetre glissante). */
  maxWords: number;
}

/** Minuscules, sans accents, sans ponctuation de bord : la forme de comparaison. */
export function normalizeForm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'")
    // Le « + » des associations devient une espace : « Artemether + Lumefantrine »
    // se compare alors a « artemether lumefantrine », tel qu'on le prononce.
    .replace(/[^a-z0-9'\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Distance de Levenshtein bornee : des qu'une ligne entiere depasse `max`, on
 * abandonne. Sur un lexique de quelques centaines d'entrees comparees a chaque
 * fenetre de la transcription, cette borne evite de calculer des distances
 * dont on sait deja qu'elles seront rejetees.
 */
export function boundedDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    const swap = prev;
    prev = cur;
    cur = swap;
  }
  return prev[b.length];
}

/**
 * Tolerance selon la longueur du terme. Volontairement stricte :
 * en dessous de cinq caracteres, on ne corrige jamais — « toux » et « tous »
 * sont a une substitution l'un de l'autre, et se trompent de sens.
 */
export function allowedDistance(len: number): number {
  if (len < 5) return 0;
  if (len <= 7) return 1;
  return 2;
}

export function buildIndex(terms: LexiconTerm[]): LexiconIndex {
  const exact = new Map<string, string>();
  const fuzzy: LexiconIndex['fuzzy'] = [];
  let maxWords = 1;

  for (const t of terms) {
    const forms = [t.canonical, ...(t.variants ?? [])];
    for (const f of forms) {
      const form = normalizeForm(f);
      if (!form) continue;
      if (!exact.has(form)) exact.set(form, t.canonical);
      const words = form.split(' ').length;
      if (words > maxWords) maxWords = words;
      // Une abreviation courte ne doit jamais servir de cible approchee :
      // « sp », « al », « tb » attireraient la moitie de la consultation.
      if (form.length >= 5) fuzzy.push({ form, canonical: t.canonical, len: form.length, words });
    }
  }
  return { exact, fuzzy, maxWords };
}

interface Token {
  raw: string;
  form: string;
  start: number;
  end: number;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /[\p{L}\p{N}][\p{L}\p{N}'’+-]*/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ raw: m[0], form: normalizeForm(m[0]), start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/** Restitue la casse initiale du fragment remplace (debut de phrase, nom propre). */
function applyCase(original: string, replacement: string): string {
  if (!original || !replacement) return replacement;
  const first = original[0];
  if (first === first.toUpperCase() && first !== first.toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Rapproche les quasi-manques du terme canonique.
 *
 * Trois verrous, cumulatifs :
 *   - la distance doit tenir dans `allowedDistance` ET sous un quart de la
 *     longueur du terme, pour qu'un mot court ne derive pas ;
 *   - le meilleur candidat doit etre STRICTEMENT meilleur que le suivant :
 *     entre deux molecules aussi proches l'une que l'autre, on ne tranche pas ;
 *   - un fragment contenant un chiffre n'est jamais corrige : c'est une
 *     posologie, un dosage ou une tension, et le lexique n'a rien a y dire.
 *
 * Les fenetres longues sont essayees en premier : « artemether lumefantrine »
 * doit gagner contre « artemether » seul.
 */
export function normalizeKeywords(text: string, index: LexiconIndex): NormalizationResult {
  if (!text) return { text: '', corrections: [] };

  const tokens = tokenize(text);
  const corrections: KeywordCorrection[] = [];
  const pieces: string[] = [];
  let cursor = 0;
  let i = 0;

  while (i < tokens.length) {
    let applied = false;

    for (let n = Math.min(index.maxWords, tokens.length - i); n >= 1 && !applied; n--) {
      const window = tokens.slice(i, i + n);
      const form = window.map((t) => t.form).filter(Boolean).join(' ');
      if (!form) continue;

      // Deja canonique : on n'y touche pas, mais on consomme la fenetre pour
      // qu'un sous-mot ne soit pas corrige a l'interieur d'un terme correct.
      if (index.exact.has(form)) {
        i += n;
        applied = true;
        break;
      }

      if (/\d/.test(form)) continue;
      const allowed = allowedDistance(form.length);
      if (allowed === 0) continue;

      let best: { canonical: string; dist: number } | null = null;
      let secondDist = Number.POSITIVE_INFINITY;

      for (const cand of index.fuzzy) {
        if (cand.words !== n) continue;
        if (Math.abs(cand.len - form.length) > allowed) continue;
        const d = boundedDistance(form, cand.form, allowed);
        if (d > allowed) continue;
        if (!best || d < best.dist) {
          // L'ancien meilleur ne devient un concurrent que s'il designe un
          // AUTRE terme : deux variantes du meme medicament ne s'opposent pas.
          if (best && best.canonical !== cand.canonical) secondDist = Math.min(secondDist, best.dist);
          best = { canonical: cand.canonical, dist: d };
        } else if (cand.canonical !== best.canonical && d < secondDist) {
          secondDist = d;
        }
      }

      if (!best || best.dist === 0) continue;
      if (best.dist > Math.floor(form.length / 4)) continue;
      if (secondDist <= best.dist) continue; // ex aequo : on s'abstient

      const start = window[0].start;
      const end = window[window.length - 1].end;
      const original = text.slice(start, end);
      const replacement = applyCase(original, best.canonical);

      pieces.push(text.slice(cursor, start), replacement);
      cursor = end;
      corrections.push({ from: original, to: replacement, distance: best.dist, index: start });
      i += n;
      applied = true;
    }

    if (!applied) i += 1;
  }

  pieces.push(text.slice(cursor));
  return { text: pieces.join(''), corrections };
}

/**
 * Liste de termes a souffler au moteur avant la transcription.
 *
 * Whisper tronque `initial_prompt` autour de 224 jetons : au-dela, ce sont les
 * premiers termes qui survivent. On trie donc par poids decroissant et on
 * coupe net, plutot que de laisser le moteur choisir ce qu'il garde.
 */
export function buildBiasPrompt(terms: LexiconTerm[], maxChars = 850): string {
  const sorted = [...terms].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const picked: string[] = [];
  let length = 0;
  for (const t of sorted) {
    const next = t.canonical;
    if (length + next.length + 2 > maxChars) break;
    picked.push(next);
    length += next.length + 2;
  }
  return `Consultation medicale en francais. Termes attendus : ${picked.join(', ')}.`;
}
