import { NextResponse } from 'next/server';
import { defaultPractitioner, getPractitioner } from './repo';
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
 * L'authentification n'est pas implementee dans cette version : on resout
 * l'acteur via l'en-tete `x-practitioner-id` sinon le premier praticien du
 * fichier. Un deploiement reel doit brancher ici un fournisseur d'identite
 * (OIDC de l'etablissement, carte professionnelle de sante).
 */
export function currentPractitioner(req?: Request): Practitioner | null {
  const headerId = req?.headers.get('x-practitioner-id');
  if (headerId) {
    const p = getPractitioner(headerId);
    if (p) return p;
  }
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
