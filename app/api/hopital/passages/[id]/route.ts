import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import {
  appelerPatient,
  marquerPatientParti,
  passageParId,
  terminerPassage,
} from '@/lib/hopital/flux-store';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Les transitions d'un passage : appel, fin, depart sans avoir ete vu.
 *
 * « parti » n'est pas un synonyme de « termine », et la route ne les
 * confond pas. La part de patients qui repartent avant d'etre appeles est
 * l'indicateur le plus direct d'un poste sature ; les enregistrer comme
 * termines ferait disparaitre la saturation des tableaux au moment precis
 * ou elle est la plus forte.
 */
export function POST(req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    const auth = await apiRequire('flux:write');
    const { id } = await ctxParam.params;
    const data = await body<{ action?: string }>(req);
    const ctx = { acteurId: auth.user.id, organizationId: auth.user.organization_id ?? null };

    const decision =
      data.action === 'appel'
        ? appelerPatient(id, ctx)
        : data.action === 'fin'
          ? terminerPassage(id, ctx)
          : data.action === 'parti'
            ? marquerPatientParti(id, ctx)
            : null;

    if (!decision) {
      return NextResponse.json(
        { error: 'Action inconnue. Valeurs acceptees : appel, fin, parti.' },
        { status: 400 },
      );
    }

    if (!decision.ok) {
      return NextResponse.json(
        { error: decision.message, motif: decision.motif, remede: decision.remede },
        { status: 409 },
      );
    }

    return NextResponse.json({ passage: decision.resultat });
  });
}

export function GET(_req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    await apiRequire('flux:read');
    const { id } = await ctxParam.params;
    const passage = passageParId(id);
    if (!passage) return NextResponse.json({ error: 'Passage introuvable.' }, { status: 404 });
    return NextResponse.json({ passage });
  });
}
