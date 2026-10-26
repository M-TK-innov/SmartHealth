import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import {
  checklistDe,
  cocher,
  decocher,
  entreeAuBloc,
  incision,
  interventionParId,
  manquantsDe,
  sortie,
} from '@/lib/hopital/bloc-store';
import type { TempsChecklist } from '@/lib/hopital/bloc';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const TEMPS: TempsChecklist[] = ['avant-induction', 'avant-incision', 'avant-sortie'];

/**
 * Une intervention et sa checklist.
 *
 * Ce qui MANQUE est rendu temps par temps, et pas seulement « complete :
 * non ». L'equipe doit voir ce qui reste avant d'essayer, sinon elle
 * decouvre le refus au moment ou elle est le plus pressee.
 */
export function GET(_req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    await apiRequire('bloc:read');
    const { id } = await ctxParam.params;
    const intervention = interventionParId(id);
    if (!intervention) {
      return NextResponse.json({ error: 'Intervention introuvable.' }, { status: 404 });
    }

    return NextResponse.json({
      intervention,
      checklist: checklistDe(id),
      manquants: Object.fromEntries(TEMPS.map((t) => [t, manquantsDe(id, t)])),
    });
  });
}

/** Checklist et transitions : cocher, decocher, entrer, inciser, sortir. */
export function POST(req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    const auth = await apiRequire('bloc:write');
    const { id } = await ctxParam.params;
    const ctx = { acteurId: auth.user.id, organizationId: auth.user.organization_id ?? null };
    const data = await body<{ type?: string; point?: string }>(req);

    if (data.type === 'cocher' || data.type === 'decocher') {
      if (!data.point) return NextResponse.json({ error: 'Point non precise.' }, { status: 400 });
      if (data.type === 'decocher') {
        return NextResponse.json({ checklist: decocher(id, data.point, ctx) });
      }
      const d = cocher(id, data.point, ctx);
      if (!d.ok) {
        return NextResponse.json({ error: d.message, motif: d.motif, remede: d.remede }, { status: 400 });
      }
      return NextResponse.json({ checklist: d.resultat });
    }

    const decision =
      data.type === 'entree'
        ? entreeAuBloc(id, ctx)
        : data.type === 'incision'
          ? incision(id, ctx)
          : data.type === 'sortie'
            ? sortie(id, ctx)
            : null;

    if (!decision) {
      return NextResponse.json(
        {
          error:
            'Operation inconnue. Valeurs acceptees : cocher, decocher, entree, incision, sortie.',
        },
        { status: 400 },
      );
    }

    // 409 et non 400 : la demande est bien formee, c'est l'etat de la
    // checklist ou de l'intervention qui s'y oppose. Le remede nomme les
    // points qui manquent, un par un.
    if (!decision.ok) {
      return NextResponse.json(
        { error: decision.message, motif: decision.motif, remede: decision.remede },
        { status: 409 },
      );
    }
    return NextResponse.json({ intervention: decision.resultat });
  });
}
