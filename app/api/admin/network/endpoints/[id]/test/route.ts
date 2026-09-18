import { NextResponse } from 'next/server';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { getEndpoint, recordTest } from '@/lib/net/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Test de joignabilite d'un serveur declare.
 *
 * L'adresse vient de la configuration, jamais de la requete : accepter une URL
 * fournie par le client transformerait cette route en sonde de reseau interne
 * utilisable par quiconque obtient une session d'administration.
 *
 * Deux precautions de plus, pour la meme raison :
 *   - aucune redirection suivie, sinon le serveur teste choisit la cible ;
 *   - aucun corps de reponse renvoye a l'interface. Le code HTTP suffit a
 *     diagnostiquer ; le contenu d'un service interne n'a pas a remonter.
 */
export function POST(_req: Request, routeCtx: Ctx) {
  return guarded(async () => {
    await apiRequire('server:manage');
    const { id } = await routeCtx.params;
    const endpoint = getEndpoint(id);
    if (!endpoint) return NextResponse.json({ error: 'Serveur introuvable.' }, { status: 404 });

    let url: URL;
    try {
      url = new URL(endpoint.url);
    } catch {
      return NextResponse.json({ error: 'Adresse invalide.' }, { status: 400 });
    }

    const started = Date.now();
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { Accept: '*/*' },
        signal: AbortSignal.timeout(8000),
      });
      const ms = Date.now() - started;
      // Un 401 ou un 404 prouve qu'un serveur repond : c'est ce qu'on cherche
      // a savoir. Seule l'absence de reponse est un echec de joignabilite.
      const status = `HTTP ${res.status} en ${ms} ms`;
      recordTest(id, status);
      return NextResponse.json({
        reachable: true,
        status: res.status,
        ms,
        contentType: res.headers.get('content-type'),
        message:
          res.status >= 200 && res.status < 500
            ? `Serveur joignable (HTTP ${res.status}, ${ms} ms).`
            : `Serveur joignable mais en erreur (HTTP ${res.status}).`,
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'erreur reseau';
      recordTest(id, `injoignable : ${reason}`);
      return NextResponse.json({
        reachable: false,
        message: `Serveur injoignable : ${reason}`,
      });
    }
  });
}
