import { body, fail, handle, ok } from '@/lib/api';
import { appendSegments, getConsultation, getSegments, renderTranscript, replaceTranscript } from '@/lib/repo';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

interface SegmentIn {
  text: string;
  speaker?: 'clinician' | 'patient' | 'companion' | 'unknown';
  startMs?: number;
  endMs?: number;
  confidence?: number;
  language?: string;
}

export function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!getConsultation(id)) return fail('Consultation introuvable', 404);
    return ok({ segments: getSegments(id), transcript: renderTranscript(id) });
  });
}

/** Ajout incremental des segments produits par la reconnaissance vocale. */
export function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const consultation = getConsultation(id);
    if (!consultation) return fail('Consultation introuvable', 404);
    if (consultation.status === 'signed') return fail('Consultation signee : transcription verrouillee.', 409);

    const data = await body<{ segments?: SegmentIn[]; text?: string }>(req);
    const segments = data.segments ?? (data.text ? [{ text: data.text }] : []);
    if (!segments.length) return fail('Aucun segment fourni.');

    appendSegments(id, segments);
    return ok({ segments: getSegments(id), transcript: renderTranscript(id) });
  });
}

/** Remplacement complet : le medecin corrige la transcription a la main. */
export function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const consultation = getConsultation(id);
    if (!consultation) return fail('Consultation introuvable', 404);
    if (consultation.status === 'signed') return fail('Consultation signee : transcription verrouillee.', 409);

    const { text } = await body<{ text?: string }>(req);
    replaceTranscript(id, text ?? '');
    return ok({ segments: getSegments(id), transcript: renderTranscript(id) });
  });
}
