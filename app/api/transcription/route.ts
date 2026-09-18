import { NextResponse } from 'next/server';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { blockingReason, resolveEndpoint } from '@/lib/net/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Relais vers un Whisper heberge par l'etablissement.
 *
 * L'endpoint vient de la configuration de la structure, jamais de la requete :
 * une URL fournie par le client permettrait d'exfiltrer l'audio d'une
 * consultation vers n'importe ou. Compatible avec le serveur HTTP de
 * whisper.cpp et avec faster-whisper, qui acceptent tous deux un multipart
 * contenant un WAV.
 *
 * L'audio brut d'une consultation contient les noms prononces a voix haute :
 * c'est une donnee identifiante, et la configuration le declare comme telle.
 * Une destination Whisper refusee par les restrictions n'est pas utilisee.
 */
function endpoint(): { url: string; token: string | null } | null {
  const resolved = resolveEndpoint('whisper');
  if (resolved) {
    try {
      return { url: new URL(resolved.endpoint.url).toString(), token: resolved.secret };
    } catch {
      return null;
    }
  }
  if (blockingReason('whisper')) return null;

  const raw = process.env.WHISPER_ENDPOINT?.trim();
  if (!raw) return null;
  try {
    return { url: new URL(raw).toString(), token: process.env.WHISPER_TOKEN?.trim() || null };
  } catch {
    return null;
  }
}

export function GET() {
  return guarded(async () => {
    await apiRequire('transcript:record');
    const target = endpoint();
    return NextResponse.json({
      configured: Boolean(target),
      // On expose l'origine, pas l'URL complete : un chemin peut contenir un jeton.
      endpoint: target ? new URL(target.url).origin : null,
      // Destination declaree mais ecartee par les restrictions : le dire, sinon
      // l'utilisateur conclut a une panne du serveur Whisper.
      blocked: blockingReason('whisper'),
    });
  });
}

export function POST(req: Request) {
  return guarded(async () => {
    await apiRequire('transcript:record');
    const target = endpoint();
    if (!target) {
      const blocked = blockingReason('whisper');
      return NextResponse.json(
        {
          error: blocked
            ? `Serveur Whisper ecarte par la configuration reseau. ${blocked}`
            : 'Aucun serveur Whisper declare. Ajoutez-le dans Administration > Reseau et serveurs.',
        },
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
      const res = await fetch(target.url, {
        method: 'POST',
        headers: target.token ? { Authorization: `Bearer ${target.token}` } : undefined,
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
