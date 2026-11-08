import Link from 'next/link';
import { requirePatient } from '@/lib/patient/session';
import { rendezVousParSalle, salleUtilisable } from '@/lib/rdv/store';
import { relaisDisponible } from '@/lib/teleconsultation/signal';
import { Salle } from '@/components/teleconsultation/Salle';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Consultation a distance — SmartHealth' };

/**
 * La salle, vue du patient.
 *
 * LE JETON SEUL N'OUVRE RIEN. Il faut en plus une session patient qui porte
 * CE dossier : un lien transmis a quelqu'un d'autre ne lui donne pas l'entree.
 * C'est la raison pour laquelle le jeton n'est pas un secret suffisant, et
 * pourquoi il n'est jamais envoye a l'avance.
 *
 * Une salle fermee et une salle inexistante donnent le meme ecran : dire
 * « cette salle existe mais elle est fermee » confirmerait un jeton a qui le
 * devine.
 */
export default async function SallePatientPage({
  params,
}: {
  params: Promise<{ salle: string }>;
}) {
  const { salle } = await params;
  const session = await requirePatient(`/espace/salle/${salle}`);

  const rdv = rendezVousParSalle(salle);
  const sien = rdv ? session.dossiers.some((d) => d.patient_id === rdv.patient_id) : false;

  if (!rdv || !sien || !salleUtilisable(rdv)) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-lg font-bold">Cette salle n est pas ouverte</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Une salle ouvre un quart d heure avant l heure du rendez-vous, et se ferme une fois la
          consultation terminee. Verifiez l heure sur votre espace, ou appelez votre centre.
        </p>
        <Link href="/espace" className="btn-primary mt-4 inline-block">
          Retour a mon espace
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Salle
        salle={salle}
        titre="Consultation a distance"
        sousTitre={rdv.motif ?? undefined}
        relaisDisponible={relaisDisponible()}
      />
      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        Ni l image ni le son ne sont enregistres. Seul le compte rendu redige par le praticien
        rejoint votre dossier.{' '}
        <Link href="/espace" className="underline">
          Retour a mon espace
        </Link>
      </p>
    </main>
  );
}
