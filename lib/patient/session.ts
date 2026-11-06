import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { getPolicy } from '@/lib/auth/store';
import { resoudreSessionPatient, revoquerSessionPatient, type SessionPatient } from './store';

/**
 * Session patient.
 *
 * COOKIE DISTINCT, TABLE DISTINCTE, GARDE DISTINCTE
 *
 * Rien n'est partage avec la session des soignants. Un patient connecte n'a
 * aucune existence pour `auth()`, et un agent connecte n'en a aucune pour
 * `authPatient()`. Les deux mondes ne se croisent nulle part, ce qui veut
 * dire qu'aucune confusion de cookie ne peut ouvrir l'un avec l'autre.
 *
 * Ce choix coute un peu de duplication. Il evite la faute classique : une
 * seule garde parametree, qu'un oubli de parametre fait basculer du mauvais
 * cote.
 */

export const COOKIE_PATIENT = 'sh_patient';

export async function ouvrirSessionPatient(token: string): Promise<void> {
  const politique = getPolicy();
  (await cookies()).set(COOKIE_PATIENT, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: politique.session_hours * 3600,
  });
}

export async function fermerSessionPatient(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_PATIENT)?.value;
  jar.delete(COOKIE_PATIENT);
  // La ligne de session est revoquee, pas seulement le cookie : un cookie
  // efface du navigateur reste valable s'il a ete recopie ailleurs.
  if (token) revoquerSessionPatient(token);
}

export async function authPatient(): Promise<SessionPatient | null> {
  const token = (await cookies()).get(COOKIE_PATIENT)?.value;
  if (!token) return null;
  return resoudreSessionPatient(token);
}

/** Garde de page : renvoie vers la connexion patient, jamais vers celle des agents. */
export async function requirePatient(suite?: string): Promise<SessionPatient> {
  const s = await authPatient();
  if (!s) redirect(`/espace/connexion${suite ? `?suite=${encodeURIComponent(suite)}` : ''}`);
  return s;
}

/** Garde d'API. */
export async function apiPatient(): Promise<SessionPatient> {
  const s = await authPatient();
  if (!s) throw new ReponsePatient('Connexion requise.', 401);
  return s;
}

export class ReponsePatient extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Enveloppe une route de l'espace patient. */
export function gardePatient(fn: () => Promise<Response> | Response) {
  return Promise.resolve()
    .then(fn)
    .catch((e) => {
      if (e instanceof ReponsePatient) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Erreur interne' },
        { status: 500 },
      );
    });
}
