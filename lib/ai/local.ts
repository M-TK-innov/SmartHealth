/**
 * Moteur d'extraction local, deterministe, 100% hors-ligne.
 *
 * Utilise automatiquement quand aucune cle API n'est configuree, quand le
 * reseau est coupe, ou quand l'appel au modele echoue. C'est le filet de
 * securite indispensable dans un centre de sante a connectivite intermittente :
 * la consultation n'est jamais perdue, elle est simplement moins bien codee.
 */

import {
  ClinicalExtraction,
  EMPTY_EXTRACTION,
  ExtractedAllergy,
  ExtractedDiagnosis,
  ExtractedMedication,
  ExtractedSymptom,
  ExtractedVital,
  ProposedMedication,
} from './schema';
import { ICD10, LABS, normalizeText, snomedForSymptom, VITALS } from '@/lib/terminology';
import { findDrug } from '@/lib/terminology/formulary';

interface Utterance {
  speaker: 'clinician' | 'patient' | 'companion' | 'unknown';
  raw: string;
  norm: string;
}

const SPEAKER_WORDS = 'medecin|docteur|clinicien|doctor|clinician|patient|accompagnant|companion|infirmier';

/**
 * Etiquette de locuteur en tete de ligne.
 * Deux formes acceptees : « [Medecin] ... » (produit par l application) et
 * « Medecin: ... » (frappe a la main ou colle depuis un autre outil).
 */
const SPEAKER_PREFIX = new RegExp(`^\\s*(?:\\[(${SPEAKER_WORDS})\\]|(${SPEAKER_WORDS}))\\s*[:\\-]?\\s+`, 'i');

function splitUtterances(transcript: string): Utterance[] {
  const out: Utterance[] = [];
  for (const line of transcript.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let speaker: Utterance['speaker'] = 'unknown';
    let text = line;
    const m = line.match(SPEAKER_PREFIX);
    if (m) {
      const tag = normalizeText(m[1] ?? m[2]);
      if (['medecin', 'docteur', 'clinicien', 'doctor', 'clinician', 'infirmier'].includes(tag)) speaker = 'clinician';
      else if (tag === 'patient') speaker = 'patient';
      else speaker = 'companion';
      text = line.slice(m[0].length);
    }
    // une ligne peut contenir plusieurs phrases : on garde la granularite phrase
    for (const sentence of text.split(/(?<=[.!?;])\s+/)) {
      const t = sentence.trim();
      if (t) out.push({ speaker, raw: t, norm: normalizeText(t) });
    }
  }
  return out;
}

const NEGATIONS = ['pas de', 'pas d', 'aucun', 'aucune', 'jamais', 'sans ', 'nie ', 'no ', 'not ', 'denies'];

/**
 * Detection de negation.
 *
 * En francais la negation encadre le verbe : « il NE tousse PAS », « elle N a
 * PAS la diarrhee ». Il faut donc regarder de part et d autre du terme, pas
 * seulement avant, sinon toute negation postposee passe pour une affirmation —
 * et un symptome nie devient un symptome present dans le dossier.
 */
function isNegated(sentence: string, term: string): boolean {
  const idx = sentence.indexOf(term);
  if (idx < 0) return false;
  const before = sentence.slice(Math.max(0, idx - 40), idx);
  const after = sentence.slice(idx + term.length, idx + term.length + 25);

  if (NEGATIONS.some((n) => before.includes(n))) return true;
  // « ne ... pas/plus/jamais » a cheval sur le terme
  if (/\bn[e']?\b/.test(before) && /^\s*\w*\s*(pas|plus|jamais)\b/.test(after)) return true;
  if (/\bn[e']?\b[^.]{0,25}\b(pas|plus|jamais)\b/.test(before)) return true;
  return false;
}

const WORD_NUMBERS: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  quinze: 15,
  vingt: 20,
  trente: 30,
};

/** « 3 » comme « trois » : la reconnaissance vocale transcrit les deux. */
function parseNumber(token: string): number | undefined {
  if (/^\d+$/.test(token)) return Number(token);
  return WORD_NUMBERS[token];
}

// ------------------------------------------------------------------ vitales

function extractVitals(utts: Utterance[]): ExtractedVital[] {
  const out: ExtractedVital[] = [];
  const push = (v: ExtractedVital) => {
    if (!out.some((o) => o.label === v.label)) out.push(v);
  };

  for (const u of utts) {
    const s = u.norm;

    // Tension : "13/8", "130/80", "tension 12 sur 8"
    const bp =
      s.match(/(?:tension|ta|pression)[^0-9]{0,20}(\d{2,3})\s*(?:\/|sur|slash)\s*(\d{1,3})/) ||
      s.match(/\b(\d{2,3})\s*(?:\/|sur)\s*(\d{1,3})\b(?=[^0-9]*(?:mmhg|cmhg|de tension)?)/);
    if (bp) {
      let sys = Number(bp[1]);
      let dia = Number(bp[2]);
      // notation en cmHg tres courante en Afrique francophone : 13/8 -> 130/80
      if (sys < 30) sys *= 10;
      if (dia < 20) dia *= 10;
      if (sys >= 50 && sys <= 300 && dia >= 20 && dia <= 200) {
        push({ label: 'Pression arterielle systolique', loincCode: '8480-6', value: sys, unit: 'mmHg', quote: u.raw, confidence: 0.85 });
        push({ label: 'Pression arterielle diastolique', loincCode: '8462-4', value: dia, unit: 'mmHg', quote: u.raw, confidence: 0.85 });
      }
    }

    // Temperature
    const temp = s.match(/(?:temperature|fievre|fait|a)\D{0,15}(\d{2}(?:[.,]\d)?)\s*(?:degres|°c|c\b)/) || s.match(/(\d{2}[.,]\d)\s*(?:degres|°c)/);
    if (temp) {
      const v = Number(temp[1].replace(',', '.'));
      if (v >= 30 && v <= 45) push({ label: 'Temperature corporelle', loincCode: '8310-5', value: v, unit: '°C', quote: u.raw, confidence: 0.85 });
    }

    // Poids
    const w = s.match(/(?:poids|pese|pesez|il fait|elle fait)\D{0,15}(\d{1,3}(?:[.,]\d)?)\s*(?:kg|kilos?)/) || s.match(/(\d{1,3}(?:[.,]\d)?)\s*(?:kg|kilos)\b/);
    if (w) {
      const v = Number(w[1].replace(',', '.'));
      if (v >= 0.5 && v <= 400) push({ label: 'Poids', loincCode: '29463-7', value: v, unit: 'kg', quote: u.raw, confidence: 0.8 });
    }

    // Taille
    const h = s.match(/(?:taille|mesure)\D{0,15}(\d{2,3})\s*(?:cm)/) || s.match(/(\d[.,]\d{2})\s*m\b/);
    if (h) {
      let v = Number(h[1].replace(',', '.'));
      if (v < 3) v = Math.round(v * 100);
      if (v >= 20 && v <= 250) push({ label: 'Taille', loincCode: '8302-2', value: v, unit: 'cm', quote: u.raw, confidence: 0.75 });
    }

    // Pouls / FC
    const hr = s.match(/(?:pouls|frequence cardiaque|fc|bpm)\D{0,15}(\d{2,3})/);
    if (hr) {
      const v = Number(hr[1]);
      if (v >= 20 && v <= 250) push({ label: 'Frequence cardiaque', loincCode: '8867-4', value: v, unit: '/min', quote: u.raw, confidence: 0.8 });
    }

    // Frequence respiratoire
    const rr = s.match(/(?:frequence respiratoire|fr)\D{0,15}(\d{1,2})/);
    if (rr) {
      const v = Number(rr[1]);
      if (v >= 5 && v <= 80) push({ label: 'Frequence respiratoire', loincCode: '9279-1', value: v, unit: '/min', quote: u.raw, confidence: 0.75 });
    }

    // SpO2
    const spo2 = s.match(/(?:saturation|spo2|sao2)\D{0,15}(\d{2,3})\s*%?/);
    if (spo2) {
      const v = Number(spo2[1]);
      if (v >= 40 && v <= 100) push({ label: 'Saturation en oxygene', loincCode: '2708-6', value: v, unit: '%', quote: u.raw, confidence: 0.85 });
    }

    // Glycemie
    const glu = s.match(/(?:glycemie|glucose|sucre)\D{0,20}(\d(?:[.,]\d{1,2})?)\s*(?:g\/?l)?/);
    if (glu) {
      const v = Number(glu[1].replace(',', '.'));
      if (v >= 0.1 && v <= 10) push({ label: 'Glycemie capillaire', loincCode: '2339-0', value: v, unit: 'g/L', quote: u.raw, confidence: 0.7 });
    }

    // Hemoglobine
    const hb = s.match(/(?:hemoglobine|hb)\D{0,15}(\d{1,2}(?:[.,]\d)?)/);
    if (hb) {
      const v = Number(hb[1].replace(',', '.'));
      if (v >= 1 && v <= 25) push({ label: 'Hemoglobine', loincCode: '718-7', value: v, unit: 'g/dL', quote: u.raw, confidence: 0.75 });
    }
  }
  return out;
}

// --------------------------------------------------------------- symptomes

const SYMPTOM_LEXICON: { label: string; terms: string[]; idiom?: boolean }[] = [
  { label: 'Fievre', terms: ['fievre', 'corps chaud', 'temperature elevee', 'chaud le corps', 'fever'] },
  { label: 'Cephalees', terms: ['mal de tete', 'maux de tete', 'cephalee', 'tete me fait mal', 'headache'] },
  { label: 'Toux', terms: ['toux', 'tousse', 'je tousse', 'cough'] },
  { label: 'Vomissements', terms: ['vomissement', 'vomi', 'vomit', 'rejette'] },
  { label: 'Nausees', terms: ['nausee', 'envie de vomir', 'coeur qui leve'] },
  { label: 'Diarrhee', terms: ['diarrhee', 'selles liquides', 'ventre coule', 'la courante'] },
  { label: 'Douleur abdominale', terms: ['mal au ventre', 'douleur abdominale', 'ventre me fait mal', 'douleur au ventre'] },
  { label: 'Asthenie', terms: ['fatigue', 'faiblesse', 'sans force', 'asthenie', 'epuise'] },
  { label: 'Frissons', terms: ['frisson', 'je tremble', 'chair de poule'] },
  { label: 'Courbatures', terms: ['courbature', 'douleurs musculaires', 'corps me fait mal'] },
  // NB : « pas d appetit » exprime la presence du symptome, pas son absence.
  // On ne liste donc que des tournures deja affirmatives.
  { label: 'Anorexie', idiom: true, terms: ['ne mange plus', 'ne mange pas', 'refuse de manger', 'refuse de teter', 'perte d appetit'] },
  { label: 'Vertiges', terms: ['vertige', 'tete qui tourne', 'etourdissement'] },
  { label: 'Dyspnee', terms: ['essouffle', 'difficulte a respirer', 'manque d air', 'dyspnee', 'respire mal'] },
  { label: 'Douleur thoracique', terms: ['douleur thoracique', 'mal a la poitrine', 'poitrine serree'] },
  { label: 'Brulures mictionnelles', terms: ['brulure en urinant', 'brulures mictionnelles', 'ca brule quand j urine'] },
  { label: 'Prurit', terms: ['demangeaison', 'ca me gratte', 'prurit'] },
  { label: 'Eruption cutanee', terms: ['boutons', 'eruption', 'plaques sur la peau', 'rougeurs'] },
  { label: 'Mal de gorge', terms: ['mal a la gorge', 'gorge irritee', 'gorge qui gratte'] },
  { label: 'Douleur lombaire', terms: ['mal au dos', 'douleur lombaire', 'reins me font mal'] },
  { label: 'Insomnie', terms: ['je ne dors pas', 'insomnie', 'sommeil difficile'] },
  { label: 'Convulsions', terms: ['convulsion', 'crise', 'tremblements generalises'] },
  { label: 'Sueurs nocturnes', terms: ['sueur nocturne', 'transpire la nuit'] },
  { label: 'Amaigrissement', terms: ['perdu du poids', 'amaigrissement', 'maigri'] },
];

function extractSymptoms(utts: Utterance[]): ExtractedSymptom[] {
  const found = new Map<string, ExtractedSymptom>();
  for (const u of utts) {
    // « Est-ce qu il tousse ? » interroge le symptome, ne l affirme pas.
    // Sans ce filtre, la question du medecin l emporterait sur le « non » du patient.
    if (/\?\s*$|^est-ce qu|^avez-vous|^as-tu|^a-t-il|^a-t-elle/.test(u.norm) || u.raw.trim().endsWith('?')) continue;
    for (const entry of SYMPTOM_LEXICON) {
      for (const term of entry.terms) {
        const t = normalizeText(term);
        if (!u.norm.includes(t)) continue;
        const negated = entry.idiom ? false : isNegated(u.norm, t);
        const prev = found.get(entry.label);
        // une affirmation prime sur une negation deja vue
        if (prev && !prev.negated) break;
        found.set(entry.label, {
          label: entry.label,
          snomedCode: snomedForSymptom(entry.label),
          negated,
          duration: extractDuration(u.norm) ?? undefined,
          severity: /severe|tres fort|insupportable|atroce/.test(u.norm) ? 'severe' : undefined,
          quote: u.raw,
          confidence: u.speaker === 'patient' ? 0.8 : 0.7,
        });
        break;
      }
    }
  }
  return [...found.values()];
}

function extractDuration(s: string): string | null {
  const m = s.match(/(?:depuis|ca fait|il y a)\s+(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s*(jours?|semaines?|mois|ans?|heures?)/);
  return m ? `${m[1]} ${m[2]}` : null;
}

// ------------------------------------------------------- allergies & traitements

/** Reponses vagues ou interrogatives : ce ne sont pas des substances. */
const NON_SUBSTANCES = /^(quelque chose|quoi|rien|ca|cela|un medicament|des medicaments|quelquechose)\b/;

function extractAllergies(utts: Utterance[]): ExtractedAllergy[] {
  const out: ExtractedAllergy[] = [];
  for (const u of utts) {
    // « Est-ce qu il est allergique a quelque chose ? » est une question, pas une allergie.
    if (/\?|est-ce qu/.test(u.raw.toLowerCase())) continue;
    const m = u.norm.match(/allergi\w*\s*(?:a|au|aux|a la|to)\s+([a-z0-9 '+-]{3,40})/);
    if (!m) continue;
    const substance = m[1].split(/\bet\b|,|\./)[0].trim();
    if (!substance || NON_SUBSTANCES.test(substance)) continue;
    const drug = findDrug(substance);
    out.push({
      substance: drug ? drug.dci : capitalize(substance),
      category: drug ? 'medication' : 'medication',
      criticality: /choc|anaphyl|oedeme|quincke|hospitalis/.test(u.norm) ? 'high' : 'low',
      reaction: /boutons|urticaire|eruption|demangeaison|choc|oedeme|gonfl/.exec(u.norm)?.[0],
      quote: u.raw,
      confidence: 0.8,
    });
  }
  return out;
}

function extractCurrentMedications(utts: Utterance[]): ExtractedMedication[] {
  const out: ExtractedMedication[] = [];
  const seen = new Set<string>();
  for (const u of utts) {
    if (!/(je prends|il prend|elle prend|sous traitement|traitement en cours|deja pris|j ai pris|actuellement sous)/.test(u.norm)) continue;
    for (const word of candidateDrugWords(u.norm)) {
      const drug = findDrug(word);
      if (drug && !seen.has(drug.dci)) {
        seen.add(drug.dci);
        out.push({ name: drug.dci, atcCode: drug.atc, ongoing: true, quote: u.raw, confidence: 0.7 });
      }
    }
  }
  return out;
}

function candidateDrugWords(s: string): string[] {
  return s
    .split(/[^a-z0-9+]+/)
    .filter((w) => w.length >= 4)
    .flatMap((w, i, arr) => (i < arr.length - 1 ? [w, `${w} ${arr[i + 1]}`] : [w]));
}

// -------------------------------------------------------------- diagnostics

/** Le clinicien pose un diagnostic (par opposition a une simple mention du mot). */
const ASSERTION =
  /(c est|il s agit d|vous avez|vous faites|je pense a|evoque|probablement|suspicion de|diagnostic de|on est sur|tableau de|c est bien)/;
/** Le mot est prononce mais dans une question, une hypothese ecartee ou un examen a faire. */
const NON_ASSERTION = /(est-ce que|verifier|eliminer|ecarter|pour voir si|au cas ou|\?)/;

function extractDiagnoses(utts: Utterance[], symptoms: ExtractedSymptom[]): ExtractedDiagnosis[] {
  const candidates: (ExtractedDiagnosis & { score: number })[] = [];
  const seen = new Set<string>();

  // 1. diagnostics prononces par le clinicien, hierarchises par force de l enonce
  for (const u of utts) {
    if (u.speaker !== 'clinician') continue;
    const asserted = ASSERTION.test(u.norm);
    const weakened = NON_ASSERTION.test(u.norm);
    const confirmed = /(confirme|test est positif|resultat positif|tdr positif|goutte epaisse positive)/.test(u.norm);

    for (const entry of ICD10) {
      if (!entry.keywords.some((k) => u.norm.includes(normalizeText(k)))) continue;
      if (seen.has(entry.code)) continue;
      seen.add(entry.code);

      // un diagnostic affirme prime sur un mot cite au detour d une phrase
      const score = (confirmed ? 3 : 0) + (asserted ? 2 : 0) - (weakened ? 1 : 0);
      candidates.push({
        label: entry.label,
        icd10Code: entry.code,
        certainty: confirmed ? 'confirmed' : asserted ? 'suspected' : 'differential',
        rationale: asserted
          ? 'Diagnostic enonce par le clinicien pendant la consultation.'
          : 'Terme releve dans le discours du clinicien, sans formulation diagnostique explicite.',
        quote: u.raw,
        confidence: confirmed ? 0.9 : asserted ? 0.75 : 0.45,
        score,
      });
    }
  }

  // 2. a defaut, coder le symptome dominant (on ne fabrique jamais un diagnostic)
  if (candidates.length === 0) {
    for (const s of symptoms.filter((x) => !x.negated).slice(0, 2)) {
      const entry = ICD10.find((e) => e.keywords.some((k) => normalizeText(s.label).includes(normalizeText(k))));
      if (!entry || seen.has(entry.code)) continue;
      seen.add(entry.code);
      candidates.push({
        label: entry.label,
        icd10Code: entry.code,
        certainty: 'differential',
        rationale: `Codage symptomatique automatique a partir de « ${s.label} » : aucun diagnostic n a ete enonce.`,
        quote: s.quote,
        confidence: 0.35,
        score: -1,
      });
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .map(({ score: _score, ...d }, i) => ({ ...d, rank: i + 1 }));
}

// ------------------------------------------------------------- ordonnance

const FREQ_WORDS: Record<string, number> = {
  'une fois': 1,
  'deux fois': 2,
  'trois fois': 3,
  'quatre fois': 4,
  'matin et soir': 2,
  'matin midi et soir': 3,
  'matin, midi et soir': 3,
};

const PRESCRIBING =
  /(je vous prescris|je te prescris|prescription|ordonnance|vous allez prendre|tu vas prendre|je mets|on va donner|je donne|prenez|prends|je prescris)/;
/** Une posologie suffit a reconnaitre une prescription : « Et du paracetamol 250 mg, trois fois par jour. » */
const POSOLOGY = /(\d+\s*(mg|g|ui|ml)|fois par jour|matin et soir|pendant\s+\S+\s*(jour|semaine))/;

function extractPrescription(utts: Utterance[]): ProposedMedication[] {
  const out: ProposedMedication[] = [];
  const seen = new Set<string>();
  let prescribingContext = false;

  for (const u of utts) {
    if (u.speaker !== 'clinician') {
      prescribingContext = false;
      continue;
    }

    // Le medecin enonce souvent l ordonnance sur plusieurs phrases d affilee :
    // « Je vous prescris X... Et du Y 250 mg, trois fois par jour. »
    if (PRESCRIBING.test(u.norm)) prescribingContext = true;
    const looksLikePosology = POSOLOGY.test(u.norm);
    if (!prescribingContext && !looksLikePosology) continue;

    let matchedHere = false;
    for (const word of candidateDrugWords(u.norm)) {
      const drug = findDrug(word);
      if (!drug || seen.has(drug.dci)) continue;
      if (!PRESCRIBING.test(u.norm) && !looksLikePosology) continue;
      seen.add(drug.dci);
      matchedHere = true;

      const strength = u.norm.match(/(\d{1,4})\s*(mg|g|ui|ml|milligrammes?|grammes?)\b/);
      const durationM = u.norm.match(/pendant\s+(\w+)\s*(jours?|semaines?|mois)/);
      let durationDays = durationM ? parseNumber(durationM[1]) : undefined;
      if (durationDays && /semaine/.test(durationM![2])) durationDays *= 7;
      if (durationDays && /mois/.test(durationM![2])) durationDays *= 30;

      let freqPerDay: number | undefined;
      let freqLabel: string | undefined;
      const numeric = u.norm.match(/(\w+)\s*fois par jour/);
      if (numeric) {
        freqPerDay = parseNumber(numeric[1]);
        if (freqPerDay) freqLabel = `${freqPerDay} fois par jour`;
      }
      if (freqPerDay === undefined) {
        for (const [k, v] of Object.entries(FREQ_WORDS)) {
          if (u.norm.includes(k)) {
            freqPerDay = v;
            freqLabel = k.includes('fois') ? `${v} fois par jour` : k;
            break;
          }
        }
      }

      const unit = strength ? (/milligramme/.test(strength[2]) ? 'mg' : /gramme/.test(strength[2]) ? 'g' : strength[2]) : null;

      out.push({
        dci: drug.dci,
        atcCode: drug.atc,
        form: drug.forms[0],
        strength: strength && unit ? `${strength[1]} ${unit === 'ui' ? 'UI' : unit}` : drug.strengths[0],
        dose: '1 unite de prise',
        route: drug.forms[0] === 'injectable' ? 'intramusculaire' : 'oral',
        frequency: freqLabel,
        frequencyPerDay: freqPerDay,
        durationDays,
        instructions: /apres le repas|apres les repas|pendant le repas|au cours des repas|aliment gras/.test(u.norm)
          ? 'A prendre au cours des repas'
          : undefined,
        rationale: 'Prononce par le clinicien pendant la consultation.',
        spokenByClinician: true,
        quote: u.raw,
        confidence: 0.7,
      });
    }

    // une phrase de conseil sans medicament clot le contexte de prescription
    if (!matchedHere && !PRESCRIBING.test(u.norm) && !looksLikePosology) prescribingContext = false;
  }
  return out;
}

function extractInvestigations(utts: Utterance[]) {
  const out: ClinicalExtraction['investigations'] = [];
  const seen = new Set<string>();
  for (const u of utts) {
    if (u.speaker === 'patient') continue;
    if (!/(on va faire|je demande|il faut faire|bilan|analyse|examen|test|radio|echo|prescris)/.test(u.norm)) continue;
    for (const lab of LABS) {
      if (!lab.keywords.some((k) => u.norm.includes(normalizeText(k)))) continue;
      if (seen.has(lab.loinc)) continue;
      seen.add(lab.loinc);
      out.push({
        label: lab.label,
        loincCode: lab.loinc,
        category: lab.category,
        priority: /urgent|tout de suite|immediatement/.test(u.norm) ? 'urgent' : 'routine',
        quote: u.raw,
        confidence: 0.75,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- identite

function extractIdentity(utts: Utterance[]): ClinicalExtraction['identity'] {
  const id: ClinicalExtraction['identity'] = {};
  for (const u of utts) {
    const name =
      u.raw.match(/je m'appelle\s+([A-ZÀ-Ÿ][\wÀ-ÿ'-]+(?:\s+[A-ZÀ-Ÿ][\wÀ-ÿ'-]+)?)/i) ||
      u.raw.match(/(?:monsieur|madame|mademoiselle|m\.|mme)\s+([A-ZÀ-Ÿ][\wÀ-ÿ'-]+(?:\s+[A-ZÀ-Ÿ][\wÀ-ÿ'-]+)?)/i);
    if (name && !id.familyName) {
      const parts = name[1].trim().split(/\s+/);
      if (parts.length > 1) {
        id.givenName = parts[0];
        id.familyName = parts.slice(1).join(' ');
      } else {
        id.familyName = parts[0];
      }
      id.quote = u.raw;
      id.confidence = 0.7;
    }

    const age = u.norm.match(/(\d{1,3})\s*(ans|an|mois)\b/);
    if (age && id.age === undefined) {
      id.age = Number(age[1]);
      id.ageUnit = age[2] === 'mois' ? 'months' : 'years';
    }

    const phone = u.raw.match(/(?:\+?\d[\d\s.-]{7,14}\d)/);
    if (phone && !id.phone && /(numero|telephone|joindre|contact)/.test(u.norm)) id.phone = phone[0].trim();

    if (/enceinte|grossesse|je suis enceinte/.test(u.norm) && !/pas enceinte/.test(u.norm)) {
      id.isPregnant = true;
      const sa = u.norm.match(/(\d{1,2})\s*(?:sa|semaines d amenorrhee|semaines de grossesse)/);
      if (sa) id.gestationWeeks = Number(sa[1]);
    }
    if (/madame|mademoiselle|elle est|enceinte/.test(u.norm) && !id.gender) id.gender = 'female';
    if (/monsieur|il est/.test(u.norm) && !id.gender) id.gender = 'male';
  }
  return id;
}

// ------------------------------------------------------------------- SOAP

function buildSoap(e: Omit<ClinicalExtraction, 'soap'>): ClinicalExtraction['soap'] {
  const present = e.symptoms.filter((s) => !s.negated);
  const absent = e.symptoms.filter((s) => s.negated);

  const subjective = [
    e.chiefComplaint ? `Motif : ${e.chiefComplaint}.` : '',
    present.length ? `Symptomes rapportes : ${present.map((s) => s.label.toLowerCase() + (s.duration ? ` (${s.duration})` : '')).join(', ')}.` : '',
    absent.length ? `Absence de : ${absent.map((s) => s.label.toLowerCase()).join(', ')}.` : '',
    e.currentMedications.length ? `Traitements en cours : ${e.currentMedications.map((m) => m.name).join(', ')}.` : '',
    e.allergies.length ? `Allergies : ${e.allergies.map((a) => a.substance).join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const objective = e.vitals.length
    ? e.vitals.map((v) => `${v.label} : ${v.value ?? v.valueText} ${v.unit ?? ''}`.trim()).join('\n')
    : 'Aucune constante enoncee pendant l echange.';

  const assessment = e.diagnoses.length
    ? e.diagnoses.map((d, i) => `${i + 1}. ${d.label}${d.icd10Code ? ` (CIM-10 ${d.icd10Code})` : ''} - ${translateCertainty(d.certainty)}`).join('\n')
    : 'Aucune hypothese diagnostique enoncee.';

  const plan = [
    e.investigations.length ? `Examens : ${e.investigations.map((i) => i.label).join(', ')}.` : '',
    e.proposedPrescription.length
      ? `Traitement propose : ${e.proposedPrescription.map((p) => `${p.dci} ${p.strength ?? ''}`.trim()).join(', ')}.`
      : '',
    e.advice.length ? `Conseils : ${e.advice.join(' ')}` : '',
    e.followUp?.inDays ? `Controle dans ${e.followUp.inDays} jours.` : '',
  ]
    .filter(Boolean)
    .join('\n') || 'Plan non documente.';

  return { subjective: subjective || 'Non documente.', objective, assessment, plan };
}

function translateCertainty(c: string): string {
  return { suspected: 'suspecte', confirmed: 'confirme', differential: 'diagnostic differentiel', 'ruled-out': 'ecarte' }[c] ?? c;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Premier diagnostic relevant d une maladie a declaration obligatoire, le cas echeant. */
function notifiableFrom(diagnoses: ExtractedDiagnosis[]): ClinicalExtraction['publicHealth'] {
  for (const d of diagnoses) {
    const entry = ICD10.find((e) => e.code === d.icd10Code);
    if (entry?.notifiable) return { notifiableDisease: entry.notifiable, icd10Code: entry.code };
  }
  return undefined;
}

// ------------------------------------------------------------------ export

export function extractLocally(transcript: string): ClinicalExtraction {
  const utts = splitUtterances(transcript);
  if (utts.length === 0) return { ...EMPTY_EXTRACTION, uncertainties: ['Transcription vide : rien a extraire.'] };

  const symptoms = extractSymptoms(utts);
  const vitals = extractVitals(utts);
  const allergies = extractAllergies(utts);
  const currentMedications = extractCurrentMedications(utts);
  const diagnoses = extractDiagnoses(utts, symptoms);
  const investigations = extractInvestigations(utts);
  const proposedPrescription = extractPrescription(utts);
  const identity = extractIdentity(utts);

  const patientLines = utts.filter((u) => u.speaker === 'patient').map((u) => u.raw);
  const chiefComplaint =
    patientLines[0]?.slice(0, 180) ||
    (symptoms.find((s) => !s.negated)?.label ?? '') ||
    utts[0]?.raw.slice(0, 180) ||
    '';

  const uncertainties: string[] = [
    'Extraction realisee par le moteur local hors-ligne (sans modele de langage) : la couverture est volontairement conservatrice.',
  ];
  if (!vitals.length) uncertainties.push('Aucune constante detectee : les enoncer a voix haute ou les saisir manuellement.');
  if (!diagnoses.length) uncertainties.push('Aucun diagnostic detecte : a saisir par le medecin.');
  if (!identity.familyName) uncertainties.push('Identite du patient non detectee dans l echange.');
  if (proposedPrescription.some((p) => !p.durationDays)) uncertainties.push('Duree de traitement manquante sur au moins une ligne d ordonnance.');

  const base: Omit<ClinicalExtraction, 'soap'> = {
    language: 'fr',
    identity,
    chiefComplaint,
    historyOfPresentIllness: patientLines.join(' ').slice(0, 1200),
    symptoms,
    vitals,
    allergies,
    currentMedications,
    history: [],
    physicalExam: utts
      .filter((u) => u.speaker === 'clinician' && /(auscult|palpation|examen|abdomen souple|gorge|tympan|conjonctives|je vois|j observe)/.test(u.norm))
      .map((u) => u.raw)
      .join(' '),
    diagnoses,
    investigations,
    proposedPrescription,
    advice: utts
      .filter((u) => u.speaker === 'clinician' && /(buvez|boire beaucoup|reposez|repos|moustiquaire|hygiene|revenez si|evitez)/.test(u.norm))
      .map((u) => u.raw)
      .slice(0, 6),
    redFlags: [],
    uncertainties,
    publicHealth: notifiableFrom(diagnoses),
  };

  return { ...base, soap: buildSoap(base) };
}
