import { NextResponse } from 'next/server';
import { guarded } from '@/lib/auth/guard';
import { apiRequire } from '@/lib/auth/guard';
import { needsBootstrap } from '@/lib/auth/bootstrap';
import { relever } from '@/lib/prerequis/collecte';
import { bilan, verifier } from '@/lib/prerequis/regles';
import { databasePath } from '@/lib/db';
import path from 'node:path';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic des prerequis du poste.
 *
 * ACCES : cette route est ouverte TANT QU'AUCUN COMPTE N'EXISTE, et seulement
 * a ce moment-la. C'est la condition pour qu'elle serve a quelque chose : elle
 * s'adresse au responsable qui installe, avant qu'il n'ait de compte. Des
 * qu'un compte existe, elle se referme derriere `server:manage`.
 *
 * Ce qu'elle expose est un etat de machine — versions, espace disque, presence
 * de modules — jamais une donnee de sante ni un secret. Le releve ne lit aucune
 * valeur de variable d'environnement, seulement leur presence.
 */
export function GET(req: Request) {
  return guarded(async () => {
    if (!needsBootstrap()) await apiRequire('server:manage');

    const racines = [process.cwd()];
    // Dans l'application desktop, public/ et services/ vivent a cote du serveur
    // empaquete, pas dans le repertoire de travail.
    const aCote = path.join(process.cwd(), '..');
    if (!racines.includes(aCote)) racines.push(aCote);

    const releve = relever({
      origine: new URL(req.url).origin,
      cheminDonnees: databasePath(),
      racines,
    });
    const constats = verifier(releve);

    return NextResponse.json({ releve, constats, bilan: bilan(constats) });
  });
}
