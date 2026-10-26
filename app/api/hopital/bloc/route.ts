import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { programmeDuJour, programmerIntervention, salles } from '@/lib/hopital/bloc-store';
import type { Lateralite } from '@/lib/hopital/bloc';

export const dynamic = 'force-dynamic';

const LATERALITES: Lateralite[] = ['droite', 'gauche', 'bilateral', 'sans-objet'];

/** Le programme operatoire du jour, salle par salle. */
export function GET(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('bloc:read');
    const orgId = ctx.user.organization_id ?? null;
    const jour = new URL(req.url).searchParams.get('jour') ?? new Date().toISOString().slice(0, 10);

    return NextResponse.json({ jour, salles: salles(orgId), programme: programmeDuJour(orgId, jour) });
  });
}

/**
 * Programme une intervention.
 *
 * La lateralite est exigee a la saisie, sans valeur par defaut : un defaut
 * silencieux sur un cote est le mecanisme meme de l'erreur de cote.
 */
export function POST(req: Request) {
  return guarded(async () => {
    const auth = await apiRequire('bloc:write');
    const data = await body<{
      patientId?: string;
      sejourId?: string;
      salleId?: string;
      geste?: string;
      lateralise?: boolean;
      lateralite?: string;
      debutPrevu?: string;
      finPrevue?: string;
      operateurId?: string;
    }>(req);

    if (!data.patientId || !data.salleId || !data.geste || !data.debutPrevu || !data.finPrevue) {
      return NextResponse.json(
        { error: 'Patient, salle, geste et creneau sont requis.' },
        { status: 400 },
      );
    }
    if (typeof data.lateralise !== 'boolean') {
      return NextResponse.json(
        {
          error: 'Il faut dire si le geste est lateralise.',
          remede: 'Repondre explicitement : un geste sur un organe pair ou un membre l est.',
        },
        { status: 400 },
      );
    }
    if (!data.lateralite || !LATERALITES.includes(data.lateralite as Lateralite)) {
      return NextResponse.json(
        {
          error: `Lateralite manquante ou inconnue. Valeurs acceptees : ${LATERALITES.join(', ')}.`,
          remede: 'Indiquer le cote d apres le dossier et le marquage du patient.',
        },
        { status: 400 },
      );
    }

    const decision = programmerIntervention(
      {
        patientId: data.patientId,
        sejourId: data.sejourId ?? null,
        salleId: data.salleId,
        geste: data.geste,
        lateralise: data.lateralise,
        lateralite: data.lateralite as Lateralite,
        debutPrevu: data.debutPrevu,
        finPrevue: data.finPrevue,
        operateurId: data.operateurId ?? null,
      },
      { acteurId: auth.user.id, organizationId: auth.user.organization_id ?? null },
    );

    if (!decision.ok) {
      return NextResponse.json(
        { error: decision.message, motif: decision.motif, remede: decision.remede },
        { status: 409 },
      );
    }
    return NextResponse.json({ intervention: decision.resultat }, { status: 201 });
  });
}
