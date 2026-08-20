/**
 * Contrat d'extraction clinique.
 *
 * C'est la structure que l'IA doit produire a partir de la transcription brute
 * de la consultation. Chaque element porte une citation verbatim (`quote`) qui
 * permet au medecin de remonter a la phrase source : aucune donnee ne rentre
 * dans le dossier medical sans justification tracable.
 */

export interface Cited {
  /** Extrait verbatim de la transcription qui justifie cette donnee. */
  quote?: string;
  /** 0..1 - confiance de l'extraction. */
  confidence?: number;
}

export interface ExtractedIdentity extends Cited {
  givenName?: string;
  familyName?: string;
  age?: number;
  ageUnit?: 'years' | 'months' | 'days';
  gender?: 'male' | 'female' | 'other' | 'unknown';
  phone?: string;
  address?: string;
  occupation?: string;
  insuranceId?: string;
  isPregnant?: boolean;
  gestationWeeks?: number;
}

export interface ExtractedSymptom extends Cited {
  label: string;
  snomedCode?: string;
  bodySite?: string;
  duration?: string;
  severity?: 'mild' | 'moderate' | 'severe' | 'unknown';
  onset?: string;
  /** true = le patient nie ce symptome (important pour le diagnostic differentiel). */
  negated?: boolean;
}

export interface ExtractedVital extends Cited {
  label: string;
  loincCode?: string;
  value?: number;
  valueText?: string;
  unit?: string;
}

export interface ExtractedHistory extends Cited {
  label: string;
  icd10Code?: string;
  type: 'medical' | 'surgical' | 'family' | 'obstetric' | 'immunisation';
  onset?: string;
  status?: 'active' | 'resolved' | 'remission';
}

export interface ExtractedAllergy extends Cited {
  substance: string;
  category?: 'medication' | 'food' | 'environment' | 'biologic';
  reaction?: string;
  criticality?: 'low' | 'high' | 'unable-to-assess';
}

export interface ExtractedMedication extends Cited {
  name: string;
  atcCode?: string;
  dose?: string;
  ongoing?: boolean;
}

export interface ExtractedDiagnosis extends Cited {
  label: string;
  icd10Code?: string;
  snomedCode?: string;
  certainty: 'suspected' | 'confirmed' | 'differential' | 'ruled-out';
  rank?: number;
  rationale?: string;
}

export interface ExtractedInvestigation extends Cited {
  label: string;
  loincCode?: string;
  category?: 'laboratory' | 'imaging' | 'referral';
  priority?: 'routine' | 'urgent' | 'stat';
  reason?: string;
}

export interface ProposedMedication extends Cited {
  dci: string;
  atcCode?: string;
  form?: string;
  strength?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  frequencyPerDay?: number;
  durationDays?: number;
  quantity?: string;
  instructions?: string;
  rationale?: string;
  /** true si le medecin a explicitement prononce ce traitement pendant la consultation. */
  spokenByClinician?: boolean;
}

export interface SoapNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface ClinicalExtraction {
  language: string;
  identity: ExtractedIdentity;
  chiefComplaint: string;
  historyOfPresentIllness: string;
  symptoms: ExtractedSymptom[];
  vitals: ExtractedVital[];
  allergies: ExtractedAllergy[];
  currentMedications: ExtractedMedication[];
  history: ExtractedHistory[];
  socialHistory?: { tobacco?: string; alcohol?: string; other?: string };
  physicalExam: string;
  diagnoses: ExtractedDiagnosis[];
  investigations: ExtractedInvestigation[];
  proposedPrescription: ProposedMedication[];
  advice: string[];
  redFlags: string[];
  followUp?: { inDays?: number; instructions?: string };
  referral?: { speciality: string; urgency?: string; reason?: string };
  /** Maladie a declaration obligatoire / programme de sante publique (paludisme, TB, VIH...). */
  publicHealth?: { notifiableDisease?: string; programme?: string; icd10Code?: string };
  /** Points que l'IA n'a pas pu trancher : le medecin doit les completer. */
  uncertainties: string[];
  soap: SoapNote;
}

export const EMPTY_EXTRACTION: ClinicalExtraction = {
  language: 'fr',
  identity: {},
  chiefComplaint: '',
  historyOfPresentIllness: '',
  symptoms: [],
  vitals: [],
  allergies: [],
  currentMedications: [],
  history: [],
  physicalExam: '',
  diagnoses: [],
  investigations: [],
  proposedPrescription: [],
  advice: [],
  redFlags: [],
  uncertainties: [],
  soap: { subjective: '', objective: '', assessment: '', plan: '' },
};

/** Normalise une sortie IA potentiellement incomplete vers une extraction valide. */
export function normalizeExtraction(raw: unknown): ClinicalExtraction {
  const r = (raw ?? {}) as Partial<ClinicalExtraction>;
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  return {
    language: str(r.language) || 'fr',
    identity: (r.identity && typeof r.identity === 'object' ? r.identity : {}) as ExtractedIdentity,
    chiefComplaint: str(r.chiefComplaint),
    historyOfPresentIllness: str(r.historyOfPresentIllness),
    symptoms: arr<ExtractedSymptom>(r.symptoms).filter((s) => s && s.label),
    vitals: arr<ExtractedVital>(r.vitals).filter((v) => v && v.label),
    allergies: arr<ExtractedAllergy>(r.allergies).filter((a) => a && a.substance),
    currentMedications: arr<ExtractedMedication>(r.currentMedications).filter((m) => m && m.name),
    history: arr<ExtractedHistory>(r.history).filter((h) => h && h.label),
    socialHistory: r.socialHistory,
    physicalExam: str(r.physicalExam),
    diagnoses: arr<ExtractedDiagnosis>(r.diagnoses).filter((d) => d && d.label),
    investigations: arr<ExtractedInvestigation>(r.investigations).filter((i) => i && i.label),
    proposedPrescription: arr<ProposedMedication>(r.proposedPrescription).filter((p) => p && p.dci),
    advice: arr<string>(r.advice).filter(Boolean),
    redFlags: arr<string>(r.redFlags).filter(Boolean),
    followUp: r.followUp,
    referral: r.referral,
    publicHealth: r.publicHealth,
    uncertainties: arr<string>(r.uncertainties).filter(Boolean),
    soap: {
      subjective: str(r.soap?.subjective),
      objective: str(r.soap?.objective),
      assessment: str(r.soap?.assessment),
      plan: str(r.soap?.plan),
    },
  };
}

/**
 * JSON Schema passe a l'outil Anthropic (`tool_use`) : force le modele a
 * repondre dans exactement cette forme, sans post-parsing fragile.
 */
export const EXTRACTION_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    language: { type: 'string', description: 'Code BCP-47 de la langue dominante (fr, en, fon, yo...)' },
    identity: {
      type: 'object',
      description: "Elements d'identite entendus. Ne rien inventer.",
      properties: {
        givenName: { type: 'string' },
        familyName: { type: 'string' },
        age: { type: 'number' },
        ageUnit: { type: 'string', enum: ['years', 'months', 'days'] },
        gender: { type: 'string', enum: ['male', 'female', 'other', 'unknown'] },
        phone: { type: 'string' },
        address: { type: 'string' },
        occupation: { type: 'string' },
        insuranceId: { type: 'string' },
        isPregnant: { type: 'boolean' },
        gestationWeeks: { type: 'number' },
        quote: { type: 'string' },
        confidence: { type: 'number' },
      },
    },
    chiefComplaint: { type: 'string', description: 'Motif de consultation en une phrase' },
    historyOfPresentIllness: { type: 'string', description: "Histoire de la maladie actuelle, redigee" },
    symptoms: {
      type: 'array',
      items: {
        type: 'object',
        required: ['label'],
        properties: {
          label: { type: 'string' },
          snomedCode: { type: 'string' },
          bodySite: { type: 'string' },
          duration: { type: 'string' },
          severity: { type: 'string', enum: ['mild', 'moderate', 'severe', 'unknown'] },
          onset: { type: 'string' },
          negated: { type: 'boolean', description: 'true si le patient nie ce symptome' },
          quote: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
    vitals: {
      type: 'array',
      description: 'Constantes citees a voix haute (TA, temperature, poids, FC, SpO2, glycemie...)',
      items: {
        type: 'object',
        required: ['label'],
        properties: {
          label: { type: 'string' },
          loincCode: { type: 'string' },
          value: { type: 'number' },
          valueText: { type: 'string' },
          unit: { type: 'string' },
          quote: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
    allergies: {
      type: 'array',
      items: {
        type: 'object',
        required: ['substance'],
        properties: {
          substance: { type: 'string' },
          category: { type: 'string', enum: ['medication', 'food', 'environment', 'biologic'] },
          reaction: { type: 'string' },
          criticality: { type: 'string', enum: ['low', 'high', 'unable-to-assess'] },
          quote: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
    currentMedications: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          atcCode: { type: 'string' },
          dose: { type: 'string' },
          ongoing: { type: 'boolean' },
          quote: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
    history: {
      type: 'array',
      description: 'Antecedents personnels, chirurgicaux, familiaux, obstetricaux, vaccinaux',
      items: {
        type: 'object',
        required: ['label', 'type'],
        properties: {
          label: { type: 'string' },
          icd10Code: { type: 'string' },
          type: { type: 'string', enum: ['medical', 'surgical', 'family', 'obstetric', 'immunisation'] },
          onset: { type: 'string' },
          status: { type: 'string', enum: ['active', 'resolved', 'remission'] },
          quote: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
    socialHistory: {
      type: 'object',
      properties: { tobacco: { type: 'string' }, alcohol: { type: 'string' }, other: { type: 'string' } },
    },
    physicalExam: { type: 'string', description: "Examen physique tel que decrit a voix haute par le medecin" },
    diagnoses: {
      type: 'array',
      description: 'Hypotheses diagnostiques, la plus probable en rank 1',
      items: {
        type: 'object',
        required: ['label', 'certainty'],
        properties: {
          label: { type: 'string' },
          icd10Code: { type: 'string', description: 'Code CIM-10 (ex: B54, J06.9, I10)' },
          snomedCode: { type: 'string' },
          certainty: { type: 'string', enum: ['suspected', 'confirmed', 'differential', 'ruled-out'] },
          rank: { type: 'number' },
          rationale: { type: 'string' },
          quote: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
    investigations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['label'],
        properties: {
          label: { type: 'string' },
          loincCode: { type: 'string' },
          category: { type: 'string', enum: ['laboratory', 'imaging', 'referral'] },
          priority: { type: 'string', enum: ['routine', 'urgent', 'stat'] },
          reason: { type: 'string' },
          quote: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
    proposedPrescription: {
      type: 'array',
      description:
        "Projet d'ordonnance. Privilegier ce que le medecin a effectivement dit. Aucune valeur legale avant validation.",
      items: {
        type: 'object',
        required: ['dci'],
        properties: {
          dci: { type: 'string', description: 'Denomination commune internationale' },
          atcCode: { type: 'string' },
          form: { type: 'string' },
          strength: { type: 'string' },
          dose: { type: 'string' },
          route: { type: 'string' },
          frequency: { type: 'string' },
          frequencyPerDay: { type: 'number' },
          durationDays: { type: 'number' },
          quantity: { type: 'string' },
          instructions: { type: 'string' },
          rationale: { type: 'string' },
          spokenByClinician: { type: 'boolean' },
          quote: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
    advice: { type: 'array', items: { type: 'string' }, description: 'Conseils donnes au patient' },
    redFlags: { type: 'array', items: { type: 'string' }, description: 'Signes de gravite / motifs de reconsultation urgente' },
    followUp: { type: 'object', properties: { inDays: { type: 'number' }, instructions: { type: 'string' } } },
    referral: {
      type: 'object',
      properties: { speciality: { type: 'string' }, urgency: { type: 'string' }, reason: { type: 'string' } },
    },
    publicHealth: {
      type: 'object',
      description: 'Maladie a declaration obligatoire ou programme national concerne',
      properties: { notifiableDisease: { type: 'string' }, programme: { type: 'string' }, icd10Code: { type: 'string' } },
    },
    uncertainties: {
      type: 'array',
      items: { type: 'string' },
      description: "Informations manquantes ou ambigues que le medecin doit trancher",
    },
    soap: {
      type: 'object',
      required: ['subjective', 'objective', 'assessment', 'plan'],
      properties: {
        subjective: { type: 'string' },
        objective: { type: 'string' },
        assessment: { type: 'string' },
        plan: { type: 'string' },
      },
    },
  },
  required: [
    'language',
    'identity',
    'chiefComplaint',
    'symptoms',
    'vitals',
    'diagnoses',
    'proposedPrescription',
    'uncertainties',
    'soap',
  ],
} as const;
