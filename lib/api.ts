import { NextResponse } from 'next/server';
import { defaultPractitioner, getPractitioner } from './repo';
import { auth } from './auth/session';
import type { Practitioner } from './types';

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data as Record<string, unknown>, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function fhirJson(resource: unknown, status = 200) {
  return new NextResponse(JSON.stringify(resource, null, 2), {
    status,
    headers: { 'Content-Type': 'application/fhir+json; charset=utf-8' },
  });
}

export function text(body: string, contentType = 'text/plain; charset=utf-8', filename?: string) {
  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType,
      ...(filename ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {}),
    },
  });
}

/**
 * Praticien courant.
 *
 * Le compte de connexion et la fiche praticien sont deux choses distinctes :
 * le compte sert a s'authentifier, la fiche praticien est ce qui signe les
 * comptes rendus et les ordonnances. Un compte medecin porte le lien vers sa
 * fiche ; les comptes administratifs n'en ont pas, et ne peuvent donc pas
 * signer d'acte medical — ce qui est le comportement voulu.
 *
 * Repli sur le premier praticien du fichier uniquement hors session, pour que
 * les scripts et la demonstration hors-ligne restent utilisables.
 */
export async function currentPractitioner(): Promise<Practitioner | null> {
  const ctx = await auth();
  if (ctx?.user.practitioner_id) {
    const p = getPractitioner(ctx.user.practitioner_id);
    if (p) return p;
  }
  if (ctx) return null;
  return defaultPractitioner() ?? null;
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function handle(fn: () => Promise<Response> | Response) {
  return Promise.resolve()
    .then(fn)
    .catch((e) => fail(e instanceof Error ? e.message : 'Erreur interne', 500));
}
