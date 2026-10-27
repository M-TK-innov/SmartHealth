import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { fileDuPoste, placerDansFile, prochainDuPoste } from '@/lib/hopital/flux-store';
import type { Gravite } from '@/lib/hopital/flux';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ posteId: string }> };

const GRAVITES: Gravite[] = ['vitale', 'urgente', 'standard', 'differable'];

/** La file ordonnee d'un poste, et le patient a appeler. */
export function GET(_req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    await apiRequire('flux:read');
    const { posteId } = await ctxParam.params;
    const maintenant = new Date().toISOString();

    return NextResponse.json({
      posteId,
      file: fileDuPoste(posteId, maintenant),
      prochain: prochainDuPoste(posteId, maintenant),
      calculeLe: maintenant,
    });
  });
}

/**
 * Place un patient dans la file de ce poste.
 *
 * La gravite est OBLIGATOIRE et sans valeur par defaut. Un defaut
 * « standard » transformerait chaque saisie pressee en sous-triage
 * silencieux — exactement le patient qu'une file est censee faire remonter.
 */
export function POST(req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    const auth = await apiRequire('flux:write');
    const { posteId } = await ctxParam.params;
    const data = await body<{ sejourId?: string; gravite?: string }>(req);

    if (!data.sejourId) {
      return NextResponse.json({ error: 'Sejour non precise.' }, { status: 400 });
    }
    if (!data.gravite || !GRAVITES.includes(data.gravite as Gravite)) {
      return NextResponse.json(
        {
          error: `Gravite manquante ou inconnue. Valeurs acceptees : ${GRAVITES.join(', ')}.`,
          remede: 'Trier le patient avant de le placer dans la file.',
        },
        { status: 400 },
      );
    }

    const decision = placerDansFile(data.sejourId, posteId, data.gravite as Gravite, {
      acteurId: auth.user.id,
      organizationId: auth.user.organization_id ?? null,
    });

    // 409 : la demande est bien formee, c'est l'etat du parcours qui s'y
    // oppose. Le motif et le remede partent avec.
    if (!decision.ok) {
      return NextResponse.json(
        { error: decision.message, motif: decision.motif, remede: decision.remede },
        { status: 409 },
      );
    }

    return NextResponse.json({ passage: decision.resultat }, { status: 201 });
  });
}
