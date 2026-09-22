/**
 * Assemblage du lexique clinique servant a biaiser puis a normaliser la
 * transcription.
 *
 * Le lexique n'est pas saisi ici : il est DERIVE des terminologies deja
 * embarquees (formulaire ATC, sous-ensemble CIM-10, LOINC, constantes, SNOMED).
 * Ajouter une molecule au formulaire la rend automatiquement reconnaissable a
 * la dictee — une seule source de verite, donc pas de derive entre ce que le
 * moteur sait entendre et ce que l'application sait coder.
 *
 * Les poids reflètent l'epidemiologie ouest-africaine : le prompt de biaisage
 * est tronque par le moteur, et ce qui doit survivre a la troncature, c'est le
 * paludisme avant l'hypertension.
 */

import { FORMULARY } from '@/lib/terminology/formulary';
import { ICD10, LABS, VITALS, SNOMED_SYMPTOMS } from '@/lib/terminology';
import { buildBiasPrompt, buildIndex, type LexiconIndex, type LexiconTerm } from './keywords';

/** Programmes nationaux : ces termes ne doivent jamais tomber du prompt. */
const PRIORITAIRES = [
  'paludisme',
  'tuberculose',
  'vih',
  'typhoide',
  'cholera',
  'malnutrition',
  'meningite',
  'rougeole',
];

function poidsDiagnostic(label: string, notifiable?: string): number {
  if (notifiable) return 10;
  const l = label.toLowerCase();
  return PRIORITAIRES.some((p) => l.includes(p)) ? 9 : 4;
}

/**
 * Termes locaux maintenus par l'etablissement.
 *
 * Ce tableau est VIDE a dessein. Les tournures employees en consultation
 * varient d'une region a l'autre, et une correspondance fausse inseree ici se
 * propagerait silencieusement dans des dossiers medicaux. Il revient a un
 * soignant de la structure — locuteur de la langue — de le remplir et de le
 * relire, pas au code de le deviner.
 *
 * Exemple de forme attendue :
 *   { canonical: 'Paludisme', variants: ['fievre du corps chaud'], weight: 10 }
 */
export const TERMES_LOCAUX: LexiconTerm[] = [];

function assembler(): LexiconTerm[] {
  const termes: LexiconTerm[] = [];

  // --- Molecules du formulaire : le gisement d'erreurs le plus couteux,
  //     parce qu'une molecule mal entendue devient une ligne d'ordonnance.
  for (const d of FORMULARY) {
    termes.push({
      canonical: d.dci,
      variants: d.aliases ?? [],
      weight: d.essential ? 8 : 5,
    });
  }

  // --- Diagnostics : on indexe les mots-cles, pas les libelles CIM-10
  //     complets, que personne ne prononce en consultation.
  for (const e of ICD10) {
    const [principal, ...autres] = e.keywords;
    if (!principal) continue;
    termes.push({
      canonical: principal,
      variants: autres,
      weight: poidsDiagnostic(e.label, e.notifiable),
    });
  }

  // --- Examens, constantes, symptomes
  for (const l of LABS) {
    termes.push({ canonical: l.label, variants: l.keywords, weight: 6 });
  }
  for (const v of VITALS) {
    termes.push({ canonical: v.label, variants: v.aliases, weight: 7 });
  }
  for (const s of Object.keys(SNOMED_SYMPTOMS)) {
    termes.push({ canonical: s, weight: 5 });
  }

  termes.push(...TERMES_LOCAUX);
  return termes;
}

let cacheIndex: LexiconIndex | null = null;
let cacheTermes: LexiconTerm[] | null = null;

export function lexiqueClinique(): LexiconTerm[] {
  if (!cacheTermes) cacheTermes = assembler();
  return cacheTermes;
}

/** Index de correction, construit une fois par processus. */
export function indexClinique(): LexiconIndex {
  if (!cacheIndex) cacheIndex = buildIndex(lexiqueClinique());
  return cacheIndex;
}

/** Prompt de biaisage a transmettre au moteur de transcription. */
export function promptBiaisage(): string {
  return buildBiasPrompt(lexiqueClinique());
}
