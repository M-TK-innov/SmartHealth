import { NextResponse } from 'next/server';
import { facturerDispensation } from '@/lib/caisse/auto';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import {
  articleParId,
  detruirePerimes,
  entrerLot,
  lotsDeLArticle,
  servir,
} from '@/lib/hopital/pharmacie-store';
import { alerteStock } from '@/lib/hopital/pharmacie';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Un article, ses lots, et son etat. */
export function GET(_req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    await apiRequire('pharmacie:read');
    const { id } = await ctxParam.params;
    const article = articleParId(id);
    if (!article) return NextResponse.json({ error: 'Article inconnu.' }, { status: 404 });

    const lots = lotsDeLArticle(id);
    const aujourdhui = new Date().toISOString().slice(0, 10);
    return NextResponse.json({ article, lots, etat: alerteStock(article, lots, aujourdhui) });
  });
}

/**
 * Les trois ecritures de pharmacie : livraison, dispensation, destruction.
 *
 * Chacune exige son propre droit. Celui qui sert un patient n'est pas
 * forcement celui qui recoit les livraisons, et confondre les deux fait
 * disparaitre la seule separation qui rend un inventaire opposable.
 */
export function POST(req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    const { id } = await ctxParam.params;
    const data = await body<{
      type?: string;
      numero?: string;
      perimeLe?: string;
      quantite?: number;
      patientId?: string;
      sejourId?: string;
      prescriptionId?: string;
      accepterPartiel?: boolean;
    }>(req);

    if (data.type === 'livraison') {
      const auth = await apiRequire('pharmacie:stock');
      if (!data.numero || !data.perimeLe || typeof data.quantite !== 'number') {
        return NextResponse.json(
          { error: 'Numero de lot, date de peremption et quantite sont requis.' },
          { status: 400 },
        );
      }
      return reponse(
        entrerLot(
          id,
          { numero: data.numero, perimeLe: data.perimeLe, quantite: data.quantite },
          contexte(auth),
        ),
        201,
      );
    }

    if (data.type === 'dispensation') {
      const auth = await apiRequire('pharmacie:dispense');
      if (!data.patientId || typeof data.quantite !== 'number') {
        return NextResponse.json({ error: 'Patient et quantite sont requis.' }, { status: 400 });
      }
      const dispense = servir(
        {
          patientId: data.patientId,
          sejourId: data.sejourId ?? null,
          prescriptionId: data.prescriptionId ?? null,
          articleId: id,
          quantite: data.quantite,
          accepterPartiel: data.accepterPartiel === true,
        },
        contexte(auth),
      );

      // ON FACTURE CE QUI EST SORTI DU RAYON, pas ce qui etait prescrit. Une
      // ordonnance de 21 comprimes servie a 7 faute de stock ne se facture
      // pas 21 : le patient paierait ce qu'il n'a pas recu, et c'est l'ecart
      // qu'on ne retrouve jamais apres coup.
      if (dispense.ok) {
        facturerDispensation(dispense.resultat.dispensationId, {
          acteurId: auth.user.id,
          organizationId: auth.user.organization_id,
        });
      }

      return reponse(dispense, 201);
    }

    if (data.type === 'destruction') {
      const auth = await apiRequire('pharmacie:stock');
      const detruites = detruirePerimes(id, contexte(auth));
      return NextResponse.json({ detruites });
    }

    return NextResponse.json(
      { error: 'Operation inconnue. Valeurs acceptees : livraison, dispensation, destruction.' },
      { status: 400 },
    );
  });
}

function contexte(auth: { user: { id: string; organization_id?: string | null } }) {
  return { acteurId: auth.user.id, organizationId: auth.user.organization_id ?? null };
}

function reponse(
  decision:
    | { ok: true; resultat: unknown }
    | { ok: false; motif: string; message: string; remede: string },
  succes: number,
) {
  // 409 et non 400 : la demande est bien formee, c'est l'etat du rayon — ou
  // le dossier du patient — qui s'y oppose. Le motif et le remede partent
  // avec, pour que le pharmacien agisse sans appeler l'informatique.
  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.message, motif: decision.motif, remede: decision.remede },
      { status: 409 },
    );
  }
  return NextResponse.json({ resultat: decision.resultat }, { status: succes });
}
