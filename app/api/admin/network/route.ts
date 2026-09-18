import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { currentPort, networkAddresses } from '@/lib/auth/network';
import {
  ComplianceError,
  evaluateCurrent,
  listDerogations,
  listEndpoints,
  networkConfig,
  saveConfig,
  secretsPresent,
} from '@/lib/net/store';
import type { NetworkConfig } from '@/lib/compliance/rules';

export const dynamic = 'force-dynamic';

/**
 * Configuration des adresses et des serveurs.
 *
 * Reservee au droit `server:manage`. La lecture expose les adresses et la
 * PRESENCE des secrets ; jamais leur valeur, meme a un super-administrateur.
 */
export function GET() {
  return guarded(async () => {
    await apiRequire('server:manage');
    const config = networkConfig();
    const endpoints = listEndpoints();

    return NextResponse.json({
      config,
      endpoints,
      derogations: listDerogations(),
      evaluation: evaluateCurrent(),
      // Adresses reellement servies, pour comparer avec ce qui est declare.
      detected: networkAddresses(currentPort()),
      livePort: currentPort(),
      secrets: secretsPresent(endpoints.map((e) => e.secret_env)),
      desktop: Boolean(process.env.PARLEDOCTEUR_DB),
    });
  });
}

export function PUT(req: Request) {
  return guarded(async () => {
    const ctx = await apiRequire('server:manage');
    const patch = await body<Partial<NetworkConfig>>(req);

    try {
      const { config, evaluation } = saveConfig(patch, ctx.user);
      return NextResponse.json({ config, evaluation });
    } catch (e) {
      if (e instanceof ComplianceError) {
        // 422 et non 400 : la requete est bien formee, c'est son contenu qui
        // est irrecevable. L'interface a besoin de la difference pour afficher
        // les manquements plutot qu'une erreur de saisie.
        return NextResponse.json({ error: e.message, evaluation: e.evaluation }, { status: 422 });
      }
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Enregistrement impossible.' },
        { status: 400 },
      );
    }
  });
}
