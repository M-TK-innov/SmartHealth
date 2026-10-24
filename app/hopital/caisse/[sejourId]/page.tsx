import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { avisPourSejour, factureOuverteDuSejour } from '@/lib/hopital/caisse-store';
import { solde, type Urgence } from '@/lib/hopital/caisse';
import { Caisse } from '@/components/hopital/Caisse';
import { get } from '@/lib/db';

export const dynamic = 'force-dynamic';

const URGENCES: Urgence[] = ['vitale', 'urgente', 'programmable'];

/**
 * La caisse d'un sejour.
 *
 * L'urgence de l'acte envisage se passe dans l'URL, parce que c'est elle qui
 * decide du ton de l'avis. Par defaut « programmable » : c'est le cas le
 * moins engageant, et il vaut mieux qu'un agent precise « urgent » pour
 * lever le blocage que l'inverse.
 */
export default async function CaissePage({
  params,
  searchParams,
}: {
  params: Promise<{ sejourId: string }>;
  searchParams: Promise<{ urgence?: string }>;
}) {
  const ctx = await requirePermission('caisse:read', '/hopital');
  const { sejourId } = await params;
  const { urgence: brut } = await searchParams;
  const urgence: Urgence = URGENCES.includes(brut as Urgence) ? (brut as Urgence) : 'programmable';

  const patient = get<{ given_name: string; family_name: string }>(
    `SELECT p.given_name, p.family_name
       FROM sejour s JOIN patient p ON p.id = s.patient_id
      WHERE s.id = ?`,
    [sejourId],
  );
  if (!patient) notFound();

  const facture = factureOuverteDuSejour(sejourId);

  if (!facture) {
    return (
      <section className="card-pad">
        <h1 className="text-lg font-bold">
          {patient.given_name} {patient.family_name}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Aucune facture ouverte pour ce sejour. Elle sera creee au premier acte facture.
        </p>
      </section>
    );
  }

  return (
    <Caisse
      facture={facture}
      solde={solde(facture)}
      avis={avisPourSejour(sejourId, urgence)}
      patientNom={`${patient.given_name} ${patient.family_name}`}
      peutEncaisser={ctx.can('caisse:write')}
    />
  );
}
