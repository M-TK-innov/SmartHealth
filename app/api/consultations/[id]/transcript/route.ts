import { body, fail, ok } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import {
  appendSegments,
  getConsultation,
  getSegments,
  reattributeSpeakers,
  renderTranscript,
  replaceTranscript,
  setSegmentSpeaker,
} from '@/lib/repo';

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
  return guarded(async () => {
    await apiRequire('consultation:read');
    const { id } = await ctx.params;
    if (!getConsultation(id)) return fail('Consultation introuvable', 404);
    return ok({ segments: getSegments(id), transcript: renderTranscript(id) });
  });
}

/** Ajout incremental des segments produits par la reconnaissance vocale. */
export function POST(req: Request, ctx: Ctx) {
  return guarded(async () => {
    await apiRequire('transcript:record');
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
  return guarded(async () => {
    await apiRequire('transcript:record');
    const { id } = await ctx.params;
    const consultation = getConsultation(id);
    if (!consultation) return fail('Consultation introuvable', 404);
    if (consultation.status === 'signed') return fail('Consultation signee : transcription verrouillee.', 409);

    const { text } = await body<{ text?: string }>(req);
    replaceTranscript(id, text ?? '');
    return ok({ segments: getSegments(id), transcript: renderTranscript(id) });
  });
}

/**
 * Correction du locuteur, ou re-attribution automatique de toute la
 * consultation.
 *
 *   { segmentId, speaker }        -> le praticien tranche un segment
 *   { reattribuer: true }         -> relance la detection sur l'ensemble
 *
 * Une correction manuelle est definitive : la re-attribution ne la touche pas.
 */
export function PATCH(req: Request, ctx: Ctx) {
  return guarded(async () => {
    await apiRequire('transcript:record');
    const { id } = await ctx.params;
    const consultation = getConsultation(id);
    if (!consultation) return fail('Consultation introuvable', 404);
    if (consultation.status === 'signed') return fail('Consultation signee : transcription verrouillee.', 409);

    const data = await body<{ segmentId?: string; speaker?: string; reattribuer?: boolean }>(req);

    if (data.reattribuer) {
      const result = reattributeSpeakers(id);
      return ok({
        ...result,
        segments: getSegments(id),
        transcript: renderTranscript(id),
        message:
          result.undetermined > 0
            ? `${result.updated} segment(s) re-attribue(s). ${result.undetermined} reste(nt) indetermine(s) : tranchez-les a la main.`
            : `${result.updated} segment(s) re-attribue(s).`,
      });
    }

    if (!data.segmentId || !data.speaker) {
      return fail('Fournissez segmentId et speaker, ou reattribuer: true.');
    }
    if (!['clinician', 'patient', 'companion', 'unknown'].includes(data.speaker)) {
      return fail('Locuteur invalide.');
    }

    if (!setSegmentSpeaker(id, data.segmentId, data.speaker)) {
      return fail('Segment introuvable dans cette consultation.', 404);
    }
    return ok({ segments: getSegments(id), transcript: renderTranscript(id) });
  });
}
