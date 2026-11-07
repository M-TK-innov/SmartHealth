import { NextResponse } from 'next/server';
import { CHAMPS_LIBRES, QUESTIONS } from '@/lib/enquete/questionnaire';
import { configuree, lire, refusConfiguration } from '@/lib/enquete/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Export CSV du depouillement. OUVERT, comme la page qui y renvoie.
 *
 * Il ne sort que ce que cette page affiche deja : des reponses sans aucune
 * donnee nominative. Le fichier ne porte ni adresse reseau, ni empreinte de
 * navigateur — la table n'en contient pas.
 *
 * DEUX ECHAPPEMENTS, ET LE SECOND EST LE MOINS CONNU
 *
 * Le premier est celui du CSV : doubler les guillemets, entourer la valeur.
 * Sans lui, une virgule dans un texte libre decale toutes les colonnes
 * suivantes.
 *
 * Le second vise le tableur. Une cellule qui commence par `=`, `+`, `-`, `@`
 * ou une tabulation est interpretee comme une FORMULE a l'ouverture, et
 * certaines formules joignent le reseau. Le contenu vient ici d'un formulaire
 * public : c'est exactement le chemin par lequel cette attaque se mene. On
 * prefixe donc par une apostrophe, qui force le texte et reste lisible.
 */

const COLONNES = [
  'id',
  'recu_le',
  ...QUESTIONS.map((q) => q.cle),
  ...CHAMPS_LIBRES.map((c) => c.cle),
];

const DEBUTS_DE_FORMULE = ['=', '+', '-', '@', '\t', '\r'];

function cellule(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  let texte = String(valeur);
  if (DEBUTS_DE_FORMULE.includes(texte.slice(0, 1))) texte = `'${texte}`;
  return `"${texte.replace(/"/g, '""')}"`;
}

export async function GET() {
  if (!configuree()) {
    return NextResponse.json({ error: refusConfiguration() }, { status: 503 });
  }

  const lignes = await lire(5000);
  const corps = [
    COLONNES.join(','),
    ...lignes.map((l) => COLONNES.map((c) => cellule((l as Record<string, unknown>)[c])).join(',')),
  ].join('\r\n');

  // Le BOM evite qu'un tableur sous Windows lise les accents de travers.
  return new NextResponse(`﻿${corps}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="enquete-smarthealth.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
