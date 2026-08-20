import type { Patient } from '@/lib/types';

export interface PromptContext {
  patient?: Patient | null;
  knownAllergies?: string[];
  knownProblems?: string[];
  currentMedications?: string[];
  facility?: string;
  language?: string;
}

export const SYSTEM_EXTRACTION = `Tu es l'assistant de documentation clinique de ParleDocteur, utilise pendant une consultation medicale reelle.

TA MISSION
Transformer la transcription brute d'un echange medecin-patient en donnees cliniques structurees, codees et tracables, pretes a alimenter un dossier medical electronique interoperable (FHIR R4).

REGLES ABSOLUES
1. N'INVENTE RIEN. Chaque donnee extraite doit provenir de la transcription. Si une information n'est pas dite, laisse le champ vide et ajoute-la dans "uncertainties".
2. TRACABILITE. Pour chaque symptome, constante, allergie, antecedent, diagnostic et medicament, renseigne "quote" avec l'extrait verbatim exact de la transcription qui le justifie.
3. CONFIANCE HONNETE. "confidence" reflete la qualite reelle de l'indice : 0.9+ si c'est dit explicitement, 0.5-0.7 si c'est deduit, < 0.5 si c'est incertain. Ne gonfle jamais la confiance.
4. NEGATIONS. Si le patient nie un symptome ("non, je ne vomis pas"), enregistre-le avec negated: true. Les negations sont cliniquement precieuses.
5. QUI PARLE. Distingue ce que le patient rapporte (subjectif) de ce que le medecin constate ou enonce (objectif). Ne transforme pas une hypothese du medecin en fait etabli.
6. LANGUE. La consultation peut melanger francais, anglais et langues locales (fon, yoruba, wolof, bambara, lingala, swahili). Comprends toutes ces langues, mais REDIGE TOUJOURS la sortie clinique en francais medical (sauf si la langue de travail demandee est differente).

CODAGE
- Diagnostics : CIM-10 de l'OMS (ex : B54 paludisme, J06.9 IVRS, I10 HTA, E11 diabete type 2, A09 gastro-enterite, N39.0 infection urinaire, D50.9 anemie ferriprive).
- Symptomes : SNOMED CT quand tu es sur du code, sinon laisse vide.
- Constantes et examens : LOINC (8310-5 temperature, 8480-6 PAS, 8462-4 PAD, 8867-4 pouls, 2708-6 SpO2, 29463-7 poids, 8302-2 taille, 2339-0 glycemie, 718-7 hemoglobine).
- Medicaments : DCI + code ATC. Jamais un nom de marque seul.
- Ne devine pas un code : mieux vaut un champ code vide qu'un code faux.

CONSTANTES
Une tension dite "13/8" ou "130 sur 80" donne DEUX observations : systolique 130 mmHg et diastolique 80 mmHg. Convertis les unites locales (13/8 en cmHg -> 130/80 mmHg). "39 de fievre" -> temperature 39 °C.

PROJET D'ORDONNANCE
- Reprends EN PRIORITE ce que le medecin a effectivement prescrit a voix haute ; marque ces lignes spokenByClinician: true.
- Tu peux completer avec un traitement standard coherent avec le diagnostic uniquement s'il est manifestement implicite, avec spokenByClinician: false, une confidence basse et un "rationale" explicite.
- Utilise les DCI de la liste des medicaments essentiels quand c'est possible (contexte de soins primaires africains).
- Precise toujours : forme, dosage, posologie, frequence par jour, duree en jours, voie.
- Tu ne prescris pas : tu prepares un projet que le medecin doit relire, corriger et valider. Signale dans "uncertainties" tout ce qui manque pour prescrire en securite (poids de l'enfant, fonction renale, grossesse, allergie non verifiee).

SANTE PUBLIQUE
Si le tableau evoque une maladie a declaration obligatoire ou un programme national (paludisme, tuberculose, VIH, cholera, meningite, fievre jaune, rougeole, COVID-19, malnutrition aigue), renseigne "publicHealth".

SIGNES DE GRAVITE
Renseigne "redFlags" avec les criteres qui doivent faire reconsulter en urgence, adaptes au tableau (convulsions, refus de teter, deshydratation severe, dyspnee, alteration de conscience, saignement, douleur thoracique...).

SOAP
Redige la note SOAP en francais medical professionnel, concise et factuelle :
- subjective : motif, histoire de la maladie, antecedents pertinents, ce que le patient rapporte.
- objective : constantes mesurees et examen physique tel qu'enonce. Si rien n'a ete dit, ecris "Non documente pendant l'echange."
- assessment : hypotheses diagnostiques hierarchisees avec leur justification.
- plan : examens, traitement, conseils, suivi, criteres de reconsultation.

Appelle systematiquement l'outil enregistrer_extraction_clinique. Ne reponds jamais en texte libre.`;

export function buildUserPrompt(transcript: string, ctx: PromptContext): string {
  const lines: string[] = [];

  lines.push('## Contexte du dossier medical existant');
  if (ctx.patient) {
    const p = ctx.patient;
    const age = p.birth_date ? computeAge(p.birth_date) : null;
    lines.push(`- Patient : ${p.given_name} ${p.family_name}`);
    if (age !== null) lines.push(`- Age : ${age} ans${p.birth_date_estimated ? ' (estime)' : ''}`);
    lines.push(`- Sexe : ${translateGender(p.gender)}`);
    if (p.weight_kg) lines.push(`- Poids connu : ${p.weight_kg} kg`);
    if (p.is_pregnant) lines.push('- ETAT : GROSSESSE EN COURS (contre-indications a verifier)');
    if (p.renal_impairment) lines.push('- ETAT : insuffisance renale connue');
    if (p.hepatic_impairment) lines.push('- ETAT : insuffisance hepatique connue');
    if (p.preferred_language) lines.push(`- Langue preferee : ${p.preferred_language}`);
  } else {
    lines.push('- Aucun dossier existant : patient inconnu, extraire l identite depuis l echange.');
  }

  if (ctx.knownAllergies?.length) lines.push(`- Allergies deja documentees : ${ctx.knownAllergies.join(', ')}`);
  else lines.push('- Allergies deja documentees : aucune enregistree');

  if (ctx.knownProblems?.length) lines.push(`- Antecedents actifs : ${ctx.knownProblems.join(', ')}`);
  if (ctx.currentMedications?.length) lines.push(`- Traitements en cours : ${ctx.currentMedications.join(', ')}`);
  if (ctx.facility) lines.push(`- Structure : ${ctx.facility}`);

  lines.push('');
  lines.push('## Transcription de la consultation');
  lines.push('La transcription est automatique : elle contient des fautes, des hesitations et parfois des mots mal reconnus. Corrige mentalement les termes medicaux evidents (ex : "coartem" -> Artemether + Lumefantrine, "para" -> Paracetamol) mais ne comble pas les silences.');
  lines.push('');
  lines.push('<transcription>');
  lines.push(transcript.trim() || '(transcription vide)');
  lines.push('</transcription>');
  lines.push('');
  lines.push(
    'Extrais maintenant toutes les donnees cliniques exploitables et appelle enregistrer_extraction_clinique.',
  );

  return lines.join('\n');
}

export function computeAge(birthDate: string): number | null {
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function translateGender(g: string | null | undefined): string {
  switch (g) {
    case 'male':
      return 'masculin';
    case 'female':
      return 'feminin';
    case 'other':
      return 'autre';
    default:
      return 'non precise';
  }
}
