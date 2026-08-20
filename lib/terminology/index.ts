/**
 * Terminologies de reference (sous-ensembles embarques).
 *
 * L'application fonctionne hors-ligne : on embarque les jeux de valeurs
 * indispensables au codage d'une consultation de soins primaires.
 * LOINC pour les constantes, CIM-10 (OMS) pour les diagnostics,
 * SNOMED CT pour les symptomes, ATC pour les medicaments, UCUM pour les unites.
 */

export interface VitalDef {
  key: string;
  label: string;
  aliases: string[];
  loinc: string;
  unit: string;
  ucum: string;
  min?: number;
  max?: number;
  /** Bornes de normalite adulte, pour l'interpretation H/L. */
  normalLow?: number;
  normalHigh?: number;
}

export const VITALS: VitalDef[] = [
  {
    key: 'temperature',
    label: 'Temperature corporelle',
    aliases: ['temperature', 'temp', 'fievre a', 'body temperature'],
    loinc: '8310-5',
    unit: '°C',
    ucum: 'Cel',
    min: 30,
    max: 45,
    normalLow: 36,
    normalHigh: 37.5,
  },
  {
    key: 'systolic',
    label: 'Pression arterielle systolique',
    aliases: ['systolique', 'systolic', 'tension systolique'],
    loinc: '8480-6',
    unit: 'mmHg',
    ucum: 'mm[Hg]',
    min: 50,
    max: 300,
    normalLow: 90,
    normalHigh: 140,
  },
  {
    key: 'diastolic',
    label: 'Pression arterielle diastolique',
    aliases: ['diastolique', 'diastolic', 'tension diastolique'],
    loinc: '8462-4',
    unit: 'mmHg',
    ucum: 'mm[Hg]',
    min: 20,
    max: 200,
    normalLow: 60,
    normalHigh: 90,
  },
  {
    key: 'heart_rate',
    label: 'Frequence cardiaque',
    aliases: ['pouls', 'frequence cardiaque', 'heart rate', 'fc', 'bpm'],
    loinc: '8867-4',
    unit: '/min',
    ucum: '/min',
    min: 20,
    max: 250,
    normalLow: 60,
    normalHigh: 100,
  },
  {
    key: 'respiratory_rate',
    label: 'Frequence respiratoire',
    aliases: ['frequence respiratoire', 'respiratory rate', 'fr'],
    loinc: '9279-1',
    unit: '/min',
    ucum: '/min',
    min: 5,
    max: 80,
    normalLow: 12,
    normalHigh: 20,
  },
  {
    key: 'spo2',
    label: 'Saturation en oxygene',
    aliases: ['saturation', 'spo2', 'sao2', 'oxygen saturation'],
    loinc: '2708-6',
    unit: '%',
    ucum: '%',
    min: 40,
    max: 100,
    normalLow: 94,
    normalHigh: 100,
  },
  {
    key: 'weight',
    label: 'Poids',
    aliases: ['poids', 'weight', 'kilos', 'kg'],
    loinc: '29463-7',
    unit: 'kg',
    ucum: 'kg',
    min: 0.5,
    max: 400,
  },
  {
    key: 'height',
    label: 'Taille',
    aliases: ['taille', 'height'],
    loinc: '8302-2',
    unit: 'cm',
    ucum: 'cm',
    min: 20,
    max: 250,
  },
  {
    key: 'bmi',
    label: 'Indice de masse corporelle',
    aliases: ['imc', 'bmi', 'indice de masse corporelle'],
    loinc: '39156-5',
    unit: 'kg/m2',
    ucum: 'kg/m2',
    normalLow: 18.5,
    normalHigh: 25,
  },
  {
    key: 'glucose',
    label: 'Glycemie capillaire',
    aliases: ['glycemie', 'glucose', 'sucre dans le sang', 'blood sugar'],
    loinc: '2339-0',
    unit: 'g/L',
    ucum: 'g/L',
    min: 0.1,
    max: 10,
    normalLow: 0.7,
    normalHigh: 1.1,
  },
  {
    key: 'muac',
    label: 'Perimetre brachial (PB/MUAC)',
    aliases: ['perimetre brachial', 'muac', 'pb'],
    loinc: '56072-2',
    unit: 'cm',
    ucum: 'cm',
    min: 5,
    max: 45,
    normalLow: 12.5,
    normalHigh: 30,
  },
  {
    key: 'hemoglobin',
    label: 'Hemoglobine',
    aliases: ['hemoglobine', 'hb', 'hemoglobin', 'taux hemoglobine'],
    loinc: '718-7',
    unit: 'g/dL',
    ucum: 'g/dL',
    min: 1,
    max: 25,
    normalLow: 11,
    normalHigh: 16,
  },
  {
    key: 'pain',
    label: 'Echelle de douleur (EVA)',
    aliases: ['douleur sur', 'eva', 'echelle de douleur', 'pain score'],
    loinc: '72514-3',
    unit: '/10',
    ucum: '{score}',
    min: 0,
    max: 10,
  },
];

export function findVital(text: string): VitalDef | undefined {
  const t = normalizeText(text);
  return VITALS.find((v) => v.key === t || v.aliases.some((a) => t.includes(normalizeText(a))));
}

export function interpretVital(def: VitalDef, value: number): string | null {
  if (def.normalLow === undefined || def.normalHigh === undefined) return null;
  if (value < def.normalLow) return 'L';
  if (value > def.normalHigh) return 'H';
  return 'N';
}

// ---------------------------------------------------------------- CIM-10

export interface Icd10Entry {
  code: string;
  label: string;
  keywords: string[];
  /** Maladie a declaration obligatoire / programme national. */
  notifiable?: string;
}

/**
 * Sous-ensemble CIM-10 couvrant les motifs de consultation les plus frequents
 * en soins primaires, avec une emphase sur l'epidemiologie ouest-africaine.
 */
export const ICD10: Icd10Entry[] = [
  { code: 'B54', label: 'Paludisme, sans precision', keywords: ['paludisme', 'palu', 'malaria'], notifiable: 'Paludisme' },
  { code: 'B50.9', label: 'Paludisme a Plasmodium falciparum, sans precision', keywords: ['falciparum', 'paludisme grave'], notifiable: 'Paludisme' },
  { code: 'A09', label: 'Diarrhee et gastro-enterite d origine presumee infectieuse', keywords: ['diarrhee', 'gastro', 'gastro-enterite', 'selles liquides'] },
  { code: 'A01.0', label: 'Fievre typhoide', keywords: ['typhoide', 'typhoid', 'salmonella typhi'], notifiable: 'Fievre typhoide' },
  { code: 'A00', label: 'Cholera', keywords: ['cholera'], notifiable: 'Cholera' },
  { code: 'A15.3', label: 'Tuberculose pulmonaire confirmee', keywords: ['tuberculose', 'tb', 'bk positif'], notifiable: 'Tuberculose' },
  { code: 'B24', label: 'Maladie a VIH, sans precision', keywords: ['vih', 'hiv', 'sida'], notifiable: 'VIH' },
  { code: 'J06.9', label: 'Infection aigue des voies respiratoires superieures', keywords: ['rhume', 'rhino', 'ivrs', 'infection respiratoire haute', 'angine virale'] },
  { code: 'J18.9', label: 'Pneumopathie, micro-organisme non precise', keywords: ['pneumonie', 'pneumopathie', 'broncho-pneumonie'] },
  { code: 'J45', label: 'Asthme', keywords: ['asthme', 'asthma', 'sifflement'] },
  { code: 'J02.9', label: 'Pharyngite aigue', keywords: ['pharyngite', 'mal de gorge', 'angine'] },
  { code: 'I10', label: 'Hypertension essentielle (primitive)', keywords: ['hypertension', 'hta', 'tension elevee'] },
  { code: 'E11', label: 'Diabete sucre de type 2', keywords: ['diabete', 'diabetes', 'glycemie elevee', 'sucre'] },
  { code: 'D50.9', label: 'Anemie par carence en fer, sans precision', keywords: ['anemie', 'anemia', 'hemoglobine basse'] },
  { code: 'N39.0', label: 'Infection des voies urinaires, siege non precise', keywords: ['infection urinaire', 'cystite', 'brulures mictionnelles', 'iu'] },
  { code: 'K29.7', label: 'Gastrite, sans precision', keywords: ['gastrite', 'brulures estomac', 'epigastralgie'] },
  { code: 'K30', label: 'Dyspepsie', keywords: ['dyspepsie', 'digestion difficile'] },
  { code: 'B77', label: 'Ascaridiase', keywords: ['ascaris', 'vers intestinaux', 'parasitose', 'helminthiase'] },
  { code: 'B82.9', label: 'Parasitose intestinale, sans precision', keywords: ['parasitose intestinale', 'vers'] },
  { code: 'L03.9', label: 'Cellulite, sans precision', keywords: ['cellulite', 'abces cutane', 'infection cutanee'] },
  { code: 'L30.9', label: 'Dermatose, sans precision', keywords: ['dermatose', 'eruption', 'demangeaison', 'prurit'] },
  { code: 'M54.5', label: 'Lombalgie', keywords: ['lombalgie', 'mal de dos', 'douleur lombaire'] },
  { code: 'M79.1', label: 'Myalgie', keywords: ['myalgie', 'courbatures', 'douleurs musculaires'] },
  { code: 'R51', label: 'Cephalee', keywords: ['cephalee', 'mal de tete', 'migraine', 'headache'] },
  { code: 'R50.9', label: 'Fievre, sans precision', keywords: ['fievre', 'fever', 'temperature elevee', 'corps chaud'] },
  { code: 'R10.4', label: 'Douleurs abdominales, autres et non precisees', keywords: ['douleur abdominale', 'mal au ventre', 'ventre'] },
  { code: 'R11', label: 'Nausees et vomissements', keywords: ['vomissement', 'nausee', 'vomir'] },
  { code: 'R05', label: 'Toux', keywords: ['toux', 'cough'] },
  { code: 'R53', label: 'Malaise et fatigue', keywords: ['fatigue', 'asthenie', 'faiblesse'] },
  { code: 'O26.9', label: 'Affection liee a la grossesse, sans precision', keywords: ['grossesse', 'enceinte', 'gestation'] },
  { code: 'Z34', label: 'Surveillance d une grossesse normale', keywords: ['cpn', 'consultation prenatale', 'suivi grossesse'] },
  { code: 'Z00.1', label: 'Examen de routine de l enfant', keywords: ['visite enfant', 'pesee', 'suivi nourrisson'] },
  { code: 'E44', label: 'Malnutrition proteino-energetique moderee', keywords: ['malnutrition', 'denutrition', 'maigreur'] },
  { code: 'F41.9', label: 'Trouble anxieux, sans precision', keywords: ['anxiete', 'stress', 'angoisse'] },
  { code: 'F32.9', label: 'Episode depressif, sans precision', keywords: ['depression', 'tristesse', 'deprime'] },
  { code: 'H10.9', label: 'Conjonctivite, sans precision', keywords: ['conjonctivite', 'oeil rouge'] },
  { code: 'H66.9', label: 'Otite moyenne, sans precision', keywords: ['otite', 'mal oreille'] },
  { code: 'S00-T88', label: 'Traumatisme', keywords: ['traumatisme', 'blessure', 'accident', 'plaie'] },
];

export function suggestIcd10(label: string): Icd10Entry | undefined {
  const t = normalizeText(label);
  if (!t) return undefined;
  let best: { entry: Icd10Entry; score: number } | undefined;
  for (const entry of ICD10) {
    for (const kw of entry.keywords) {
      const k = normalizeText(kw);
      if (t.includes(k) || k.includes(t)) {
        const score = k.length;
        if (!best || score > best.score) best = { entry, score };
      }
    }
  }
  return best?.entry;
}

export function icd10Label(code: string): string | undefined {
  return ICD10.find((e) => e.code === code)?.label;
}

// ------------------------------------------------------------------ LOINC

export interface LabDef {
  label: string;
  loinc: string;
  keywords: string[];
  category: 'laboratory' | 'imaging';
}

export const LABS: LabDef[] = [
  { label: 'Goutte epaisse / TDR paludisme', loinc: '32700-7', keywords: ['goutte epaisse', 'tdr', 'test rapide palu', 'frottis'], category: 'laboratory' },
  { label: 'Numeration formule sanguine', loinc: '58410-2', keywords: ['nfs', 'hemogramme', 'numeration'], category: 'laboratory' },
  { label: 'Glycemie a jeun', loinc: '1558-6', keywords: ['glycemie a jeun', 'glycemie'], category: 'laboratory' },
  { label: 'Creatininemie', loinc: '2160-0', keywords: ['creatinine', 'fonction renale'], category: 'laboratory' },
  { label: 'Transaminases ALAT', loinc: '1742-6', keywords: ['alat', 'sgpt', 'transaminases'], category: 'laboratory' },
  { label: 'Examen cytobacteriologique des urines', loinc: '630-4', keywords: ['ecbu', 'urines', 'uroculture'], category: 'laboratory' },
  { label: 'Serologie widal', loinc: '20481-2', keywords: ['widal', 'serologie typhoide'], category: 'laboratory' },
  { label: 'Test VIH', loinc: '75622-1', keywords: ['test vih', 'serologie vih', 'depistage vih'], category: 'laboratory' },
  { label: 'Recherche BAAR (crachats)', loinc: '11545-1', keywords: ['baar', 'bk crachat', 'genexpert'], category: 'laboratory' },
  { label: 'Examen parasitologique des selles', loinc: '10704-5', keywords: ['selles', 'parasitologie', 'kop'], category: 'laboratory' },
  { label: 'Test de grossesse (hCG urinaire)', loinc: '2106-3', keywords: ['test de grossesse', 'hcg', 'beta hcg'], category: 'laboratory' },
  { label: 'Radiographie du thorax', loinc: '36643-5', keywords: ['radio thorax', 'radiographie pulmonaire', 'rx thorax'], category: 'imaging' },
  { label: 'Echographie abdominale', loinc: '24558-9', keywords: ['echographie abdominale', 'echo abdomen'], category: 'imaging' },
  { label: 'Echographie obstetricale', loinc: '11525-3', keywords: ['echographie obstetricale', 'echo grossesse'], category: 'imaging' },
];

export function suggestLab(label: string): LabDef | undefined {
  const t = normalizeText(label);
  return LABS.find((l) => l.keywords.some((k) => t.includes(normalizeText(k))) || normalizeText(l.label) === t);
}

// ------------------------------------------------------------------ Utils

/** Minuscule + suppression des accents : la reconnaissance vocale accentue mal. */
export function normalizeText(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Codes SNOMED CT des symptomes les plus courants. */
export const SNOMED_SYMPTOMS: Record<string, string> = {
  fievre: '386661006',
  cephalee: '25064002',
  toux: '49727002',
  vomissement: '422400008',
  diarrhee: '62315008',
  'douleur abdominale': '21522001',
  fatigue: '84229001',
  frissons: '43724002',
  'douleur thoracique': '29857009',
  dyspnee: '267036007',
  vertige: '404640003',
  'perte appetit': '79890006',
  courbatures: '68962001',
  prurit: '418290006',
  'mal de gorge': '162397003',
};

export function snomedForSymptom(label: string): string | undefined {
  const t = normalizeText(label);
  for (const [k, code] of Object.entries(SNOMED_SYMPTOMS)) {
    if (t.includes(normalizeText(k))) return code;
  }
  return undefined;
}
