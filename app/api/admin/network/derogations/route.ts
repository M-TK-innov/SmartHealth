import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { evaluateCurrent, grantDerogation, revokeDerogation } from '@/lib/net/store';
import { DEROGABLE_CODES, MIN_JUSTIFICATION } from '@/lib/compliance/rules';

export const dynamic = 'force-dynamic';

const derogable = new Set<string>(DEROGABLE_CODES);

/**
 * Levee ecrite d'une restriction.
 *
 * Trois verrous, et aucun n'est redondant :
 *
 *   1. le code doit figurer dans la liste des restrictions levables — une
 *      regle bloquante (transport en clair, secret dans l'adresse, base sur
 *      un partage reseau) n'a pas de derogation, et cette route ne doit pas
 *      en fabriquer une ;
 *   2. seul un super-administrateur signe. Accepter un transfert hors du
 *      territoire engage le responsable de traitement ; ce n'est pas un droit
 *      qu'on delegue en cochant une case, au meme titre que le cloisonnement
 *      par etablissement ;
 *   3. la justification est obligatoire et substantielle. « ok » ne documente
 *      rien : dans six mois, personne ne saura pourquoi la restriction a ete
 *      levee, et c'est precisement ce que le journal doit retenir.
 */
export function POST(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('server:manage');
    const { code, target, reason } = await body<{ code?: string; target?: string; reason?: string }>(req);

    if (!code || !target) {
      return NextResponse.json({ error: 'Restriction a lever non precisee.' }, { status: 400 });
    }
    if (!derogable.has(code)) {
      return NextResponse.json(
        {
          error:
            `La restriction ${code} n'admet pas de derogation. Elle sanctionne une configuration qui ` +
            'exposerait des donnees de sante ou compromettrait le dossier : seule sa correction la leve.',
        },
        { status: 409 },
      );
    }
    if (ctx.user.role !== 'super_admin') {
      return NextResponse.json(
        {
          error:
            "Seul un super-administrateur peut lever une restriction sanitaire. La decision engage le " +
            'responsable de traitement de la structure.',
        },
        { status: 403 },
      );
    }
    const justification = (reason ?? '').trim();
    if (justification.length < MIN_JUSTIFICATION) {
      return NextResponse.json(
        {
          error:
            `La justification doit compter au moins ${MIN_JUSTIFICATION} caracteres et decrire la mesure ` +
            'compensatoire retenue (reseau isole, autorisation de l autorite, contrat de sous-traitance...).',
        },
        { status: 400 },
      );
    }

    const derogation = grantDerogation({ code, target, reason: justification }, ctx.user);
    return NextResponse.json({ derogation, evaluation: evaluateCurrent() }, { status: 201 });
  });
}

export function DELETE(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('server:manage');
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const target = url.searchParams.get('target');
    if (!code || !target) {
      return NextResponse.json({ error: 'Derogation non precisee.' }, { status: 400 });
    }
    if (ctx.user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Seul un super-administrateur peut revenir sur une derogation.' },
        { status: 403 },
      );
    }
    revokeDerogation(code, target, ctx.user);
    return NextResponse.json({ revoked: true, evaluation: evaluateCurrent() });
  });
}
