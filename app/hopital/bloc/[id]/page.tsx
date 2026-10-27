import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { checklistDe, interventionParId } from '@/lib/hopital/bloc-store';
import { POINTS } from '@/lib/hopital/bloc';
import { ChecklistBloc } from '@/components/hopital/ChecklistBloc';
import { get } from '@/lib/db';
import { fuseauDe } from '@/lib/localisation-store';
import { formaterInstant } from '@/lib/localisation';

export const dynamic = 'force-dynamic';

const COTE = {
  droite: 'DROITE',
  gauche: 'GAUCHE',
  bilateral: 'BILATERAL',
  'sans-objet': null,
} as const;

/**
 * Une intervention et sa checklist.
 *
 * Le bandeau d'identite reprend le patient, le geste et le COTE, en haut
 * et en grand. C'est ce que le time out demande de confirmer a voix haute :
 * l'ecran doit le donner a lire d'un coup d'oeil, pas le faire chercher.
 */
export default async function InterventionPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('bloc:read', '/hopital/bloc');
  const { id } = await params;

  const intervention = interventionParId(id);
  if (!intervention) notFound();

  const patient = get<{ given_name: string; family_name: string; birth_date: string | null }>(
    'SELECT given_name, family_name, birth_date FROM patient WHERE id = ?',
    [intervention.patientId],
  );
  if (!patient) notFound();

  const fuseau = fuseauDe(ctx.user.organization_id ?? null);
  const heure = (iso: string | null) => formaterInstant(iso, fuseau, 'heure');
  const checklist = checklistDe(id);
  const cote = COTE[intervention.lateralite];

  return (
    <div className="grid gap-6">
      <section className="card-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">
              {patient.given_name} {patient.family_name}
            </h1>
            <p className="text-sm text-ink-soft">
              {patient.birth_date ? `Ne(e) le ${new Date(patient.birth_date).toLocaleDateString('fr-FR')}` : 'Date de naissance inconnue'}
            </p>
            <p className="mt-2 text-lg font-semibold">{intervention.geste}</p>
          </div>
          {cote ? (
            <span className="rounded-xl bg-danger px-4 py-2 text-xl font-bold tracking-wider text-white">
              {cote}
            </span>
          ) : (
            <span className="chip bg-paper text-ink-soft">Geste non lateralise</span>
          )}
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          {heure(intervention.debutPrevu)}–{heure(intervention.finPrevue)} ·{' '}
          {intervention.etat}
          {intervention.inciseLe ? ` · incision a ${heure(intervention.inciseLe)}` : ''}
        </p>
      </section>

      <ChecklistBloc
        intervention={intervention}
        points={POINTS}
        coches={checklist.coches}
        peutAgir={ctx.can('bloc:write')}
      />

      <p className="text-xs text-ink-soft">
        <Link href="/hopital/bloc" className="hover:underline">
          ← Programme operatoire
        </Link>
      </p>
    </div>
  );
}
