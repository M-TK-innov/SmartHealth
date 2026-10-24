import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { fileDuPoste, passagesDuPoste, postes } from '@/lib/hopital/flux-store';
import { FileAttente } from '@/components/hopital/FileAttente';
import { all } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * La file d'un poste.
 *
 * Les noms des patients sont resolus ICI, cote serveur, et transmis deja
 * associes. Le composant client ne recoit jamais de requete a faire sur un
 * dossier : il affiche ce qu'on lui donne, et rien d'autre n'est exposable
 * depuis le navigateur.
 */
export default async function FilePage({ params }: { params: Promise<{ posteId: string }> }) {
  const ctx = await requirePermission('flux:read', '/hopital');
  const { posteId } = await params;

  const poste = postes(ctx.user.organization_id ?? null).find((p) => p.id === posteId);
  if (!poste) notFound();

  const maintenant = new Date().toISOString();
  const file = fileDuPoste(posteId, maintenant);
  const debut = new Date(maintenant);
  debut.setUTCHours(0, 0, 0, 0);
  const tous = passagesDuPoste(posteId, debut.toISOString());
  const enCoursDeSoin = tous
    .filter((p) => p.etat === 'en-cours')
    .map((p) => ({ id: p.id, sejourId: p.sejourId, gravite: p.gravite }));

  const sejourIds = [...new Set([...file, ...enCoursDeSoin].map((p) => p.sejourId))];
  const nomParSejour: Record<string, string> = {};
  if (sejourIds.length > 0) {
    const marques = sejourIds.map(() => '?').join(', ');
    for (const l of all<{ sejour_id: string; given_name: string; family_name: string }>(
      `SELECT s.id AS sejour_id, p.given_name, p.family_name
         FROM sejour s JOIN patient p ON p.id = s.patient_id
        WHERE s.id IN (${marques})`,
      sejourIds,
    )) {
      nomParSejour[l.sejour_id] = `${l.given_name} ${l.family_name}`;
    }
  }

  return (
    <FileAttente
      posteId={poste.id}
      posteNom={poste.nom}
      file={file}
      enCoursDeSoin={enCoursDeSoin}
      nomParSejour={nomParSejour}
    />
  );
}
