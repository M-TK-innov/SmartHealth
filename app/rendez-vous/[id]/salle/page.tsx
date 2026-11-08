import Link from 'next/link';
import { requirePermission } from '@/lib/auth/guard';
import { rendezVousParId, salleUtilisable } from '@/lib/rdv/store';
import { relaisDisponible } from '@/lib/teleconsultation/signal';
import { get } from '@/lib/db';
import { Salle } from '@/components/teleconsultation/Salle';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Consultation a distance — SmartHealth' };

/**
 * La salle, vue du praticien.
 *
 * `consultation:write` : conduire une consultation a distance, c'est conduire
 * une consultation. L'infirmier d'accueil, qui peut pourtant poser le
 * rendez-vous, ne passe pas cette porte — et c'est le meme droit qui garde la
 * route d'ouverture, pour qu'il n'y ait pas deux verrous a tenir d'accord.
 *
 * LE LIEN VERS LA CONSULTATION EST DONNE ICI. Le compte rendu se redige dans
 * l'espace de consultation habituel, pas dans un formulaire separe : une
 * teleconsultation produit le meme dossier qu'une visite au cabinet.
 */
export default async function SallePraticienPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission('consultation:write', `/rendez-vous/${id}/salle`);

  const rdv = rendezVousParId(id);

  if (!rdv || !rdv.salle || !salleUtilisable(rdv)) {
    return (
      <div className="card-pad">
        <h1 className="text-lg font-bold">Cette salle n est pas ouverte</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {!rdv
            ? 'Ce rendez-vous est introuvable.'
            : !rdv.consentement_le
              ? "Le patient n a pas encore donne son accord pour la consultation a distance."
              : "La salle ouvre un quart d heure avant l heure du rendez-vous, et se ferme une fois la consultation close."}
        </p>
        <Link href="/rendez-vous" className="btn-primary mt-4 inline-block">
          Retour au planning
        </Link>
      </div>
    );
  }

  const patient = get<{ given_name: string; family_name: string }>(
    'SELECT given_name, family_name FROM patient WHERE id = ?',
    [rdv.patient_id],
  );

  return (
    <div className="space-y-4">
      <Salle
        salle={rdv.salle}
        titre={patient ? `${patient.given_name} ${patient.family_name}` : 'Consultation a distance'}
        sousTitre={`${rdv.debut.slice(11, 16)} · ${rdv.duree_min} min${rdv.motif ? ` · ${rdv.motif}` : ''}`}
        relaisDisponible={relaisDisponible()}
      />

      <div className="card-pad">
        <p className="text-sm font-semibold">Le compte rendu</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          Il se redige dans l espace de consultation, comme apres une visite au cabinet. Ni l image
          ni le son de cette salle ne sont enregistres.
        </p>
        {rdv.consultation_id && (
          <Link
            href={`/consultations/${rdv.consultation_id}`}
            className="btn-primary btn-sm mt-3 inline-block"
          >
            Ouvrir la consultation
          </Link>
        )}
        <Link href="/rendez-vous" className="btn-ghost btn-sm mt-3 ml-2 inline-block">
          Retour au planning
        </Link>
      </div>
    </div>
  );
}
