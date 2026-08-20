import Anthropic from '@anthropic-ai/sdk';
import { ClinicalExtraction, EXTRACTION_TOOL_SCHEMA, normalizeExtraction } from './schema';
import { SYSTEM_EXTRACTION, buildUserPrompt, PromptContext } from './prompts';
import { extractLocally } from './local';
import { enrichExtraction } from './enrich';

export interface ExtractionResult {
  extraction: ClinicalExtraction;
  engine: string;
  degraded: boolean;
  warning?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function aiModel(): string {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const TOOL_NAME = 'enregistrer_extraction_clinique';

/**
 * Extraction clinique d'une transcription.
 *
 * Strategie : modele de langage si une cle est disponible, sinon (ou en cas
 * d'echec reseau) repli automatique sur le moteur local deterministe. Dans les
 * deux cas la sortie passe par `enrichExtraction` qui complete les codes
 * LOINC/CIM-10/ATC manquants a partir des terminologies embarquees.
 */
export async function extractFromTranscript(
  transcript: string,
  ctx: PromptContext = {},
): Promise<ExtractionResult> {
  if (!transcript.trim()) {
    return {
      extraction: enrichExtraction(extractLocally('')),
      engine: 'local-rules',
      degraded: true,
      warning: 'Transcription vide.',
    };
  }

  if (!aiAvailable()) {
    return {
      extraction: enrichExtraction(extractLocally(transcript)),
      engine: 'local-rules',
      degraded: true,
      warning:
        "Aucune cle ANTHROPIC_API_KEY configuree : extraction realisee par le moteur local hors-ligne. Relisez attentivement.",
    };
  }

  try {
    const response = await getClient().messages.create({
      model: aiModel(),
      max_tokens: 8000,
      temperature: 0,
      system: SYSTEM_EXTRACTION,
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Enregistre l'extraction clinique structuree de la consultation dans le dossier medical electronique.",
          input_schema: EXTRACTION_TOOL_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: buildUserPrompt(transcript, ctx) }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    );
    if (!toolUse) throw new Error('Le modele n a pas appele l outil d extraction.');

    return {
      extraction: enrichExtraction(normalizeExtraction(toolUse.input)),
      engine: `anthropic:${aiModel()}`,
      degraded: false,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      extraction: enrichExtraction(extractLocally(transcript)),
      engine: 'local-rules',
      degraded: true,
      warning: `Le service IA est indisponible (${message}). Repli sur le moteur local hors-ligne : relisez attentivement avant de signer.`,
    };
  }
}

/**
 * Reformulation libre assistee (amelioration d'un paragraphe du compte rendu).
 * Renvoie null si l'IA n'est pas disponible : l'appelant garde alors le texte d'origine.
 */
export async function rewriteSection(section: string, instruction: string): Promise<string | null> {
  if (!aiAvailable() || !section.trim()) return null;
  try {
    const res = await getClient().messages.create({
      model: aiModel(),
      max_tokens: 1500,
      temperature: 0.2,
      system:
        "Tu reformules une section de compte rendu medical. Reste strictement fidele aux faits : n'ajoute aucune donnee clinique absente du texte source. Reponds uniquement par le texte reformule, en francais medical.",
      messages: [{ role: 'user', content: `Instruction : ${instruction}\n\nTexte source :\n${section}` }],
    });
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
    return text?.trim() || null;
  } catch {
    return null;
  }
}
