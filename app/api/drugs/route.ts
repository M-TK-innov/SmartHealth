import { ok } from '@/lib/api';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { FORMULARY } from '@/lib/terminology/formulary';

export const dynamic = 'force-dynamic';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Recherche dans le formulaire embarque : autocompletion de l'editeur d'ordonnance. */
export function GET(req: Request) {
  return guarded(async () => {
    await apiRequire('consultation:write');
    const q = norm(new URL(req.url).searchParams.get('q') ?? '');
    const matches = q
      ? FORMULARY.filter(
          (d) => norm(d.dci).includes(q) || d.aliases?.some((a) => norm(a).includes(q)) || norm(d.className).includes(q),
        )
      : FORMULARY;
    return ok({
      drugs: matches.slice(0, 40).map((d) => ({
        dci: d.dci,
        atc: d.atc,
        forms: d.forms,
        strengths: d.strengths,
        className: d.className,
        essential: d.essential,
        pregnancy: d.pregnancy,
        notes: d.notes ?? null,
      })),
      total: matches.length,
    });
  });
}
