import { NextResponse } from 'next/server';
import { COOKIE, DUREE_HEURES, cleAttendue, cleValide, ouvrirSession } from '@/lib/enquete/acces';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Ouverture et fermeture du depouillement.
 *
 * La cle arrive par un POST et ressort en cookie : elle ne passe jamais par
 * l'adresse. Une cle dans l'URL se retrouve dans l'historique du navigateur,
 * dans les journaux du serveur et dans le presse-papier du jour ou l'on
 * partage le lien.
 *
 * AUCUN MESSAGE NE DIT CE QUI A ECHOUE. « Cle incorrecte » et « aucune cle
 * posee sur le serveur » se repondent de la meme facon : distinguer les deux
 * apprendrait a un visiteur que la page existe mais n'est pas encore fermee.
 */
export async function POST(req: Request) {
  const formulaire = await req.formData();
  const attendue = cleAttendue();
  const cible = new URL('/enquete/resultats', req.url);

  // Sortie : le meme formulaire HTML sert a fermer, sans script de page.
  if (formulaire.get('sortir') !== null) {
    const sortie = NextResponse.redirect(cible, { status: 303 });
    sortie.cookies.set(COOKIE, '', { path: '/enquete', maxAge: 0 });
    return sortie;
  }

  const fournie = String(formulaire.get('cle') ?? '');

  if (!cleValide(fournie, attendue) || !attendue) {
    cible.searchParams.set('refus', '1');
    return NextResponse.redirect(cible, { status: 303 });
  }

  const reponse = NextResponse.redirect(cible, { status: 303 });
  reponse.cookies.set(COOKIE, ouvrirSession(attendue, new Date()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(req.url).protocol === 'https:',
    path: '/enquete',
    maxAge: DUREE_HEURES * 3600,
  });
  return reponse;
}
