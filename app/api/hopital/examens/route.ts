import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import {
  creerDemande,
  critiquesNonTransmises,
  demandesEnCours,
  tableauPlateau,
} from '@/lib/hopital/plateau-store';
import type { Domaine } from '@/lib/hopital/plateau';

export const dynamic = 'force-dynamic';

const DOMAINES: Domaine[] = ['laboratoire', 'imagerie'];

/**
 * L'etat du plateau technique.
 *
 * Les valeurs critiques non acquittees sont rendues A PART, et non noyees
 * dans la liste des demandes. C'est le chiffre qui doit etre a zero :
 * chaque ligne est un patient dont le resultat dangereux attend quelque
 * part.
 */
export function GET(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('plateau:read');
    const orgId = ctx.user.organization_id ?? null;
    const brut = new URL(req.url).searchParams.get('domaine');
    const domaine = DOMAINES.includes(brut as Domaine) ? (brut as Domaine) : undefined;

    return NextResponse.json({
      demandes: demandesEnCours(orgId, domaine),
      critiques: critiquesNonTransmises(orgId),
      tension: tableauPlateau(orgId),
    });
  });
}

/** Cree une demande d'examen. */
export function POST(req: Request) {
  return guarded(async () => {
    const auth = await apiRequire('plateau:write');
    const data = await body<{
      patientId?: string;
      sejourId?: string;
      domaine?: string;
      examen?: string;
      priorite?: string;
    }>(req);

    if (!data.patientId || !data.examen) {
      return NextResponse.json({ error: 'Patient et examen sont requis.' }, { status: 400 });
    }
    if (!data.domaine || !DOMAINES.includes(data.domaine as Domaine)) {
      return NextResponse.json(
        { error: `Domaine manquant ou inconnu. Valeurs acceptees : ${DOMAINES.join(', ')}.` },
        { status: 400 },
      );
    }

    const demande = creerDemande(
      {
        patientId: data.patientId,
        sejourId: data.sejourId ?? null,
        domaine: data.domaine as Domaine,
        examen: data.examen,
        priorite:
          data.priorite === 'urgente' || data.priorite === 'vitale' ? data.priorite : 'routine',
      },
      { acteurId: auth.user.id, organizationId: auth.user.organization_id ?? null },
    );

    return NextResponse.json({ demande }, { status: 201 });
  });
}
