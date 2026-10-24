import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { avisPourSejour, factureOuverteDuSejour, ouvrirFacture } from '@/lib/hopital/caisse-store';
import { solde, type Urgence } from '@/lib/hopital/caisse';

export const dynamic = 'force-dynamic';

const URGENCES: Urgence[] = ['vitale', 'urgente', 'programmable'];

/**
 * La facture ouverte d'un sejour, et l'avis de caisse avant un acte.
 *
 * L'avis est consultatif sur tout acte vital ou urgent : il nomme le reste a
 * charge et dit que l'acte se fait quand meme. Un module de caisse qui PEUT
 * bloquer une prise en charge finit par le faire, un soir de garde, pour une
 * somme derisoire.
 */
export function GET(req: Request) {
  return guarded(async () => {
    await apiRequire('caisse:read');
    const url = new URL(req.url);
    const sejourId = url.searchParams.get('sejourId');
    if (!sejourId) return NextResponse.json({ error: 'Sejour non precise.' }, { status: 400 });

    const brut = url.searchParams.get('urgence');
    const urgence: Urgence = URGENCES.includes(brut as Urgence) ? (brut as Urgence) : 'programmable';

    const facture = factureOuverteDuSejour(sejourId);
    return NextResponse.json({
      facture,
      solde: facture ? solde(facture) : null,
      avis: avisPourSejour(sejourId, urgence),
    });
  });
}

/** Ouvre une facture pour un sejour, ou rend celle qui est deja ouverte. */
export function POST(req: Request) {
  return guarded(async () => {
    const auth = await apiRequire('caisse:write');
    const data = await body<{ sejourId?: string; tiersNom?: string; partTiers?: number }>(req);
    if (!data.sejourId) return NextResponse.json({ error: 'Sejour non precise.' }, { status: 400 });

    if (data.partTiers !== undefined && (!Number.isInteger(data.partTiers) || data.partTiers < 0)) {
      return NextResponse.json(
        {
          error: 'La part prise en charge doit etre un nombre entier de francs, positif ou nul.',
          remede: 'Saisir le montant accorde par le tiers payant, en francs entiers.',
        },
        { status: 400 },
      );
    }

    const facture = ouvrirFacture(
      data.sejourId,
      { acteurId: auth.user.id, organizationId: auth.user.organization_id ?? null },
      data.tiersNom ? { nom: data.tiersNom, part: data.partTiers ?? 0 } : undefined,
    );

    return NextResponse.json({ facture, solde: solde(facture) }, { status: 201 });
  });
}
