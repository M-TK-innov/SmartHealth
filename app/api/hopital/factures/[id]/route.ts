import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import {
  ajouterActe,
  cloreFacture,
  encaisserPaiement,
  etatFacture,
} from '@/lib/hopital/caisse-store';
import type { Paiement, Urgence } from '@/lib/hopital/caisse';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const MOYENS: Paiement['moyen'][] = ['especes', 'mobile', 'carte', 'tiers-payant'];
const URGENCES: Urgence[] = ['vitale', 'urgente', 'programmable'];

/** L'etat d'une facture : ses lignes, ses paiements, son solde. */
export function GET(_req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    await apiRequire('caisse:read');
    const { id } = await ctxParam.params;
    const etat = etatFacture(id);
    if (!etat) return NextResponse.json({ error: 'Facture introuvable.' }, { status: 404 });
    return NextResponse.json(etat);
  });
}

/**
 * Les ecritures de caisse : acte, paiement, cloture.
 *
 * Un paiement ne se modifie ni ne se supprime — il n'y a donc ni PATCH ni
 * DELETE ici. Une caisse dont les lignes s'editent ne prouve rien, et c'est
 * justement une preuve qu'on lui demande.
 */
export function POST(req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    const auth = await apiRequire('caisse:write');
    const { id } = await ctxParam.params;
    const ctx = { acteurId: auth.user.id, organizationId: auth.user.organization_id ?? null };
    const data = await body<{
      type?: string;
      libelle?: string;
      montant?: number;
      quantite?: number;
      urgence?: string;
      moyen?: string;
      reference?: string;
    }>(req);

    if (data.type === 'acte') {
      if (!data.libelle || typeof data.montant !== 'number') {
        return NextResponse.json({ error: 'Libelle et montant sont requis.' }, { status: 400 });
      }
      const decision = ajouterActe(
        id,
        {
          libelle: data.libelle,
          montant: data.montant,
          quantite: data.quantite,
          urgence: URGENCES.includes(data.urgence as Urgence) ? (data.urgence as Urgence) : undefined,
        },
        ctx,
      );
      return reponse(decision, 201);
    }

    if (data.type === 'paiement') {
      if (typeof data.montant !== 'number') {
        return NextResponse.json({ error: 'Montant requis.' }, { status: 400 });
      }
      if (!data.moyen || !MOYENS.includes(data.moyen as Paiement['moyen'])) {
        return NextResponse.json(
          { error: `Moyen de paiement inconnu. Valeurs acceptees : ${MOYENS.join(', ')}.` },
          { status: 400 },
        );
      }
      const decision = encaisserPaiement(
        id,
        data.montant,
        data.moyen as Paiement['moyen'],
        ctx,
        data.reference ?? null,
      );
      return reponse(decision, 201);
    }

    if (data.type === 'cloture') {
      return reponse(cloreFacture(id, ctx), 200);
    }

    return NextResponse.json(
      { error: 'Operation inconnue. Valeurs acceptees : acte, paiement, cloture.' },
      { status: 400 },
    );
  });
}

function reponse(
  decision: { ok: true; resultat: unknown } | { ok: false; motif: string; message: string; remede: string },
  succes: number,
) {
  // 409 et non 400 : la demande est bien formee, c'est l'etat de la facture
  // qui s'y oppose. Le motif et le remede partent avec, pour que l'agent de
  // caisse agisse sans appeler l'informatique.
  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.message, motif: decision.motif, remede: decision.remede },
      { status: 409 },
    );
  }
  return NextResponse.json({ resultat: decision.resultat }, { status: succes });
}
