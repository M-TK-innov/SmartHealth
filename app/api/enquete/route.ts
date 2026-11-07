import { NextResponse } from 'next/server';
import { valider } from '@/lib/enquete/questionnaire';
import { compterRecentes, configuree, enregistrer, refusConfiguration } from '@/lib/enquete/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Collecte des reponses a l'enquete usagers.
 *
 * ROUTE PUBLIQUE, ET C'EST LE SUJET. Le formulaire est servi par une page
 * statique hebergee ailleurs ; cette route est donc exposee a tout ce qui
 * passe. Trois verrous, dans cet ordre :
 *
 *   1. l'origine de l'appel doit figurer dans la liste ci-dessous ;
 *   2. le corps doit tenir dans `TAILLE_MAXIMUM` avant d'etre analyse ;
 *   3. le contenu doit passer `valider`, qui n'accepte que les options du
 *      questionnaire.
 *
 * Et un quatrieme en base : les contraintes CHECK de la table refusent, elles
 * aussi, toute valeur hors liste. Si cette route etait un jour modifiee a la
 * legere, la base tiendrait encore.
 *
 * CE QUE LE CONTROLE D'ORIGINE NE FAIT PAS
 *
 * Il n'authentifie rien. Un en-tete `Origin` se pose a la main dans n'importe
 * quel client qui n'est pas un navigateur. Il ecarte les pages tierces, pas
 * les envois automatises. Contre ceux-la, il n'y a que le plafond horaire et
 * la validation — et il faut le dire plutot que de se croire protege.
 *
 * AUCUNE DONNEE DE SANTE N'ENTRE ICI, et aucune donnee de la plateforme n'en
 * sort : cette route ne touche pas la base de l'etablissement.
 */

/** Origines autorisees a appeler cette route depuis un navigateur. */
const ORIGINES = [
  'https://m-tk-innov.github.io',
  'https://smart-health-vert.vercel.app',
  'http://localhost:3000',
];

/** Un formulaire rempli tient tres largement dedans. */
const TAILLE_MAXIMUM = 4096;

/**
 * Plafond de reponses par heure, toutes origines confondues.
 *
 * Ce n'est pas une limite par personne : la table ne porte aucun identifiant,
 * donc une telle limite n'existe pas ici. C'est une vanne, destinee a ce que
 * l'enquete ne soit pas noyee en une nuit.
 */
const PLAFOND_HORAIRE = 300;

function entetes(origine: string | null): Record<string, string> {
  const base: Record<string, string> = {
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  };
  if (origine && ORIGINES.includes(origine)) {
    base['Access-Control-Allow-Origin'] = origine;
    base['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    base['Access-Control-Allow-Headers'] = 'Content-Type';
    base['Access-Control-Max-Age'] = '86400';
  }
  return base;
}

/**
 * Etat de la collecte, pour le formulaire publie.
 *
 * Le questionnaire vit sur une page statique, hebergee ailleurs et mise a
 * jour a un autre rythme que ce serveur. Sans cette route, la page afficherait
 * un bouton d'envoi avant que la collecte existe, et quelqu'un remplirait
 * onze questions pour s'entendre dire que rien n'est parti.
 *
 * Elle ne dit rien d'autre que « oui » ou « non », et ne lit aucune reponse.
 */
export function GET(req: Request) {
  const origine = req.headers.get('origin');
  const tetes = entetes(origine);
  if (!configuree()) {
    return NextResponse.json({ ouverte: false }, { status: 503, headers: tetes });
  }
  return NextResponse.json({ ouverte: true }, { headers: tetes });
}

export function OPTIONS(req: Request) {
  const origine = req.headers.get('origin');
  // 204 avec les entetes, ou 403 sans : un navigateur dont l'origine n'est
  // pas listee n'enverra meme pas la requete reelle.
  const autorisee = Boolean(origine && ORIGINES.includes(origine));
  return new NextResponse(null, { status: autorisee ? 204 : 403, headers: entetes(origine) });
}

export async function POST(req: Request) {
  const origine = req.headers.get('origin');
  const tetes = entetes(origine);

  if (!origine || !ORIGINES.includes(origine)) {
    return NextResponse.json({ error: 'Origine non autorisee.' }, { status: 403, headers: tetes });
  }

  if (!configuree()) {
    // Le motif nomme la variable manquante et ne montre aucune valeur. Il
    // part au journal du serveur ; le navigateur, lui, apprend seulement que
    // la collecte est fermee.
    console.error(refusConfiguration());
    return NextResponse.json(
      { error: "La collecte n'est pas ouverte." },
      { status: 503, headers: tetes },
    );
  }

  const brut = await req.text();
  if (brut.length > TAILLE_MAXIMUM) {
    return NextResponse.json({ error: 'Envoi trop volumineux.' }, { status: 413, headers: tetes });
  }

  let charge: unknown;
  try {
    charge = JSON.parse(brut);
  } catch {
    return NextResponse.json({ error: 'Envoi illisible.' }, { status: 400, headers: tetes });
  }

  const verdict = valider(charge);
  if (!verdict.ok) {
    // Le motif precis reste au serveur : le detailler au client reviendrait
    // a expliquer a un envoi automatise comment s'y prendre.
    console.warn(`Enquete, reponse refusee : ${verdict.motif}`);
    return NextResponse.json(
      { error: "Reponse incomplete ou invalide." },
      { status: 422, headers: tetes },
    );
  }

  try {
    if ((await compterRecentes(1)) >= PLAFOND_HORAIRE) {
      return NextResponse.json(
        { error: 'Trop de reponses en ce moment. Reessayez dans un moment.' },
        { status: 429, headers: tetes },
      );
    }
    await enregistrer(verdict.resultat);
  } catch (e) {
    console.error('Enquete, enregistrement impossible :', e);
    return NextResponse.json(
      { error: "La reponse n'a pas pu etre enregistree." },
      { status: 502, headers: tetes },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201, headers: tetes });
}
