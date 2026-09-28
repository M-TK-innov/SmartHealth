import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { audit } from '@/lib/db';
import { SEUIL_CONFIRMATION, ecarter, lecons, termesAppris } from '@/lib/apprentissage/store';

export const dynamic = 'force-dynamic';

/**
 * Ce que cette installation a appris des corrections de ses praticiens.
 *
 * L'ecran d'administration existe pour une raison precise : une lecon retenue
 * a tort s'appliquerait en silence a toutes les transcriptions suivantes, et
 * le praticien relirait un texte deja abime en croyant relire la machine. Il
 * faut donc que quelqu'un puisse VOIR ce qui a ete appris, et le retirer.
 *
 * Rien ne sort du poste : ni ici, ni ailleurs. L'amelioration d'un dispensaire
 * lui appartient, et la mutualiser supposerait de faire circuler des extraits
 * de consultation.
 */
export function GET(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('transcript:record');
    const org = ctx.user.organization_id ?? null;
    const format = new URL(req.url).searchParams.get('format');

    const toutes = lecons(org);
    const appliquees = termesAppris(org);

    // Export destine a un re-entrainement ulterieur, sur une machine dediee et
    // sur decision ecrite. Il ne part pas tout seul : c'est un telechargement
    // demande par un humain, et il est inscrit au journal.
    if (format === 'jsonl') {
      await apiRequire('server:manage');
      // L'export porte sur TOUTE l'installation, pas sur la seule structure du
      // demandeur : le cloisonnement par organisation sert a decider quelles
      // lecons s'appliquent a une transcription, pas a decider ce qu'un
      // administrateur d'installation a le droit d'emporter. Sans cela, le seul
      // compte autorise a exporter reparait avec un fichier vide.
      const completes = lecons(null);
      audit({
        action: 'export',
        entity: 'apprentissage_correction',
        actorId: ctx.user.id,
        detail: { lignes: completes.length, format: 'jsonl', portee: 'installation' },
      });
      const corps = completes
        .map((l) =>
          JSON.stringify({
            entendu: l.avant_affiche,
            attendu: l.apres,
            contexte: l.contexte,
            consultations: l.consultations,
            etat: l.etat,
          }),
        )
        .join('\n');
      return new NextResponse(corps, {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Content-Disposition': 'attachment; filename="corrections-locales.jsonl"',
        },
      });
    }

    return NextResponse.json({
      seuil: SEUIL_CONFIRMATION,
      lecons: toutes,
      appliquees: appliquees.length,
    });
  });
}

/**
 * Ecarte une lecon.
 *
 * Definitif : le couple ne revient pas par la petite porte, meme s'il est
 * corrige a nouveau. Un relecteur qui a juge qu'une correction ne se
 * generalise pas n'a pas a rejuger la meme chose chaque mois.
 */
export function PATCH(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('transcript:record');
    const { avant, apres } = await body<{ avant?: string; apres?: string }>(req);
    if (!avant || !apres) {
      return NextResponse.json({ error: 'Couple a ecarter non precise.' }, { status: 400 });
    }

    const touchees = ecarter(avant, apres);
    audit({
      action: 'update',
      entity: 'apprentissage_correction',
      actorId: ctx.user.id,
      detail: { avant, apres, etat: 'ecarte', lignes: touchees },
    });

    const org = ctx.user.organization_id ?? null;
    return NextResponse.json({ ecartees: touchees, lecons: lecons(org), appliquees: termesAppris(org).length });
  });
}
