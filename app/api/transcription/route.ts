import { NextResponse } from 'next/server';
import { apiRequire, guarded } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Relais vers un Whisper heberge par l'etablissement.
 *
 * L'endpoint vient de la configuration du serveur, jamais de la requete : une
 * URL fournie par le client permettrait d'exfiltrer l'audio d'une consultation
 * vers n'importe ou. Compatible avec le serveur HTTP de whisper.cpp et avec
 * faster-whisper, qui acceptent tous deux un multipart contenant un WAV.
 */
function endpoint(): string | null {
  const raw = process.env.WHISPER_ENDPOINT?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).toString();
  } catch {
    return null;
  }
}

export function GET() {
  return guarded(async () => {
    await apiRequire('transcript:record');
    const url = endpoint();
    return NextResponse.json({
      configured: Boolean(url),
      // On expose l'origine, pas l'URL complete : un chemin peut contenir un jeton.
      endpoint: url ? new URL(url).origin : null,
    });
  });
}

export function POST(req: Request) {
  return guarded(async () => {
    await apiRequire('transcript:record');
    const url = endpoint();
    if (!url) {
      return NextResponse.json(
        { error: "Aucun serveur Whisper configure (WHISPER_ENDPOINT)." },
        { status: 412 },
      );
    }

    const incoming = await req.formData();
    const audio = incoming.get('audio');
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: 'Extrait audio manquant.' }, { status: 400 });
    }
    // Garde-fou : un extrait de consultation depasse rarement quelques Mo.
    if (audio.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Extrait audio trop volumineux.' }, { status: 413 });
    }

    const outgoing = new FormData();
    outgoing.append('file', audio, 'extrait.wav');
    outgoing.append('language', String(incoming.get('language') ?? 'fr'));
    outgoing.append('response_format', 'json');
    outgoing.append('temperature', '0');

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: process.env.WHISPER_TOKEN ? { Authorization: `Bearer ${process.env.WHISPER_TOKEN}` } : undefined,
        body: outgoing,
        signal: AbortSignal.timeout(90000),
      });

      const raw = await res.text();
      if (!res.ok) {
        return NextResponse.json({ error: `Serveur Whisper : HTTP ${res.status}` }, { status: 502 });
      }

      // whisper.cpp renvoie { text }, faster-whisper parfois { segments: [...] }.
      let text = '';
      try {
        const parsed = JSON.parse(raw);
        text = parsed.text ?? (parsed.segments ?? []).map((s: { text: string }) => s.text).join(' ');
      } catch {
        text = raw;
      }

      return NextResponse.json({ text: text.trim() });
    } catch (e) {
      return NextResponse.json(
        { error: `Serveur Whisper injoignable : ${e instanceof Error ? e.message : 'erreur reseau'}` },
        { status: 502 },
      );
    }
  });
}
