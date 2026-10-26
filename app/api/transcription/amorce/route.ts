import { NextResponse } from 'next/server';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { promptBiaisage } from '@/lib/transcription/clinical-lexicon';

export const dynamic = 'force-dynamic';

/**
 * L'amorce de biaisage, pour le moteur Whisper qui tourne dans le navigateur.
 *
 * Elle etait deja calculee pour les moteurs serveur, et n'arrivait pas au
 * moteur embarque — c'est-a-dire au seul qui fonctionne hors ligne, celui
 * qui en a le plus besoin. Sans elle, le modele rend « arthemeter » la ou
 * le formulaire dit « artemether », et la correction retombe sur le
 * praticien a chaque consultation.
 *
 * Le calcul reste cote serveur parce qu'il lit le formulaire, les
 * terminologies et les corrections apprises de l'etablissement. La requete
 * est locale : sur un poste de dispensaire, le serveur tourne sur la meme
 * machine, et rien ne sort de l'appareil.
 */
export function GET() {
  return guarded(async () => {
    const ctx = await apiRequire('transcript:record');
    const amorce = promptBiaisage(ctx.user.organization_id ?? null);
    return NextResponse.json({ amorce });
  });
}
