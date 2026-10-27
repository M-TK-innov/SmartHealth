import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import {
  acquitterCritique,
  corrigerResultat,
  demandeParId,
  enregistrerPrelevement,
  historiqueResultats,
  resultatCourant,
  saisirResultat,
} from '@/lib/hopital/plateau-store';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Une demande, son resultat courant, et l'historique de ses versions. */
export function GET(_req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    await apiRequire('plateau:read');
    const { id } = await ctxParam.params;
    const demande = demandeParId(id);
    if (!demande) return NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 });

    return NextResponse.json({
      demande,
      resultat: resultatCourant(id),
      // L'historique est rendu meme quand il n'y a qu'une version : c'est
      // ce qui permet de voir, plus tard, qu'une valeur a ete corrigee.
      versions: historiqueResultats(id),
    });
  });
}

/**
 * Le circuit d'un examen : prelevement, resultat, acquittement, correction.
 *
 * Chaque geste exige son propre droit. Celui qui saisit un resultat n'est
 * pas celui qui l'acquitte : un laboratoire qui s'acquitte lui-meme ses
 * valeurs critiques n'a transmis a personne.
 */
export function POST(req: Request, ctxParam: Ctx) {
  return guarded(async () => {
    const { id } = await ctxParam.params;
    const data = await body<{
      type?: string;
      nom?: string;
      naissance?: string;
      valeurNum?: number | null;
      valeurTexte?: string;
      unite?: string;
      resultatId?: string;
      transmisA?: string;
      commentaire?: string;
      motif?: string;
    }>(req);

    if (data.type === 'prelevement') {
      const auth = await apiRequire('plateau:write');
      if (!data.nom || !data.naissance) {
        return NextResponse.json(
          {
            error: 'Le nom et la date de naissance annonces par le patient sont requis.',
            remede: 'Les demander au patient, et non les recopier de l ecran.',
          },
          { status: 400 },
        );
      }
      return reponse(
        enregistrerPrelevement(id, { nom: data.nom, naissance: data.naissance }, contexte(auth)),
        201,
      );
    }

    if (data.type === 'resultat') {
      const auth = await apiRequire('plateau:write');
      return reponse(
        saisirResultat(
          id,
          {
            valeurNum: typeof data.valeurNum === 'number' ? data.valeurNum : null,
            valeurTexte: data.valeurTexte ?? null,
            unite: data.unite ?? null,
          },
          contexte(auth),
        ),
        201,
      );
    }

    if (data.type === 'acquittement') {
      const auth = await apiRequire('plateau:acquitter');
      if (!data.resultatId) {
        return NextResponse.json({ error: 'Resultat non precise.' }, { status: 400 });
      }
      return reponse(
        acquitterCritique(
          data.resultatId,
          data.transmisA ?? '',
          contexte(auth),
          data.commentaire ?? null,
        ),
        200,
      );
    }

    if (data.type === 'correction') {
      const auth = await apiRequire('plateau:write');
      if (!data.resultatId) {
        return NextResponse.json({ error: 'Resultat non precise.' }, { status: 400 });
      }
      return reponse(
        corrigerResultat(
          data.resultatId,
          {
            valeurNum: typeof data.valeurNum === 'number' ? data.valeurNum : null,
            valeurTexte: data.valeurTexte ?? null,
            unite: data.unite ?? null,
          },
          data.motif ?? '',
          contexte(auth),
        ),
        201,
      );
    }

    return NextResponse.json(
      {
        error:
          'Operation inconnue. Valeurs acceptees : prelevement, resultat, acquittement, correction.',
      },
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
  // 409 et non 400 : la demande est bien formee, c'est l'etat du dossier ou
  // de l'echantillon qui s'y oppose. Le motif et le remede partent avec.
  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.message, motif: decision.motif, remede: decision.remede },
      { status: 409 },
    );
  }
  return NextResponse.json({ resultat: decision.resultat }, { status: succes });
}
