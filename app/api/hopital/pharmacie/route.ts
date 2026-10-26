import { NextResponse } from 'next/server';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { rayon } from '@/lib/hopital/pharmacie-store';

export const dynamic = 'force-dynamic';

/**
 * L'etat du rayon.
 *
 * Trie en mettant devant ce sur quoi il faut agir — peremption, rupture,
 * stock bas — et non par ordre alphabetique : un inventaire alphabetique
 * oblige a lire toute la liste pour trouver les trois lignes qui comptent.
 */
export function GET() {
  return guarded(async () => {
    const ctx = await apiRequire('pharmacie:read');
    const articles = rayon(ctx.user.organization_id ?? null);

    return NextResponse.json({
      articles,
      ensemble: {
        references: articles.length,
        ruptures: articles.filter((a) => a.niveau === 'rupture').length,
        stockBas: articles.filter((a) => a.niveau === 'bas').length,
        // Deux chiffres distincts, et c'est voulu : le premier est une perte
        // deja consommee, le second est ce sur quoi on peut encore agir.
        unitesPerimees: articles.reduce((n, a) => n + a.perimees, 0),
        unitesBientotPerimees: articles.reduce((n, a) => n + a.bientotPerimees, 0),
      },
    });
  });
}
