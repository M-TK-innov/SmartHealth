import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { admettrePatient, sejourParId, sortirPatient, transfererPatient } from '@/lib/hopital/store';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Les mouvements d'un sejour : admission, transfert, sortie.
 *
 * Une seule route pour les trois, parce qu'ils partagent la meme garantie :
 * l'etat est lu, les regles tranchent, et l'ecriture n'a lieu que si elles
 * ont accorde. Un refus rend 409 avec son motif et son remede — l'agent
 * d'accueil doit pouvoir agir sans appeler l'informatique.
 */
export function POST(req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    const auth = await apiRequire('consultation:write');
    const { id } = await ctxParam.params;

    const data = await body<{ type?: string; litId?: string; motif?: string; modeSortie?: string }>(req);
    const ctx = { acteurId: auth.user.id, organizationId: auth.user.organization_id ?? null };

    const decision =
      data.type === 'admission'
        ? admettrePatient(id, data.litId ?? null, ctx)
        : data.type === 'transfert'
          ? data.litId
            ? transfererPatient(id, data.litId, ctx, data.motif ?? null)
            : null
          : data.type === 'sortie'
            ? sortirPatient(id, ctx, data.modeSortie ?? null)
            : null;

    if (!decision) {
      return NextResponse.json(
        { error: 'Mouvement inconnu ou lit non precise. Types acceptes : admission, transfert, sortie.' },
        { status: 400 },
      );
    }

    // 409 et non 400 : la demande est bien formee, c'est l'etat de
    // l'etablissement qui s'y oppose. Le motif et le remede partent avec.
    if (!decision.ok) {
      return NextResponse.json(
        { error: decision.message, motif: decision.motif, remede: decision.remede },
        { status: 409 },
      );
    }

    return NextResponse.json({ sejour: decision.resultat });
  });
}

export function GET(_req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    await apiRequire('patient:read');
    const { id } = await ctxParam.params;
    const sejour = sejourParId(id);
    if (!sejour) return NextResponse.json({ error: 'Sejour introuvable.' }, { status: 404 });
    return NextResponse.json({ sejour });
  });
}
