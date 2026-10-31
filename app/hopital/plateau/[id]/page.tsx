import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { demandeParId, historiqueResultats, seuils } from '@/lib/hopital/plateau-store';
import { get } from '@/lib/db';
import { fuseauDe } from '@/lib/localisation-store';
import { formaterInstant } from '@/lib/localisation';

export const dynamic = 'force-dynamic';

const INTERPRETATION = {
  critique: { libelle: 'Critique', classe: 'bg-danger text-white' },
  anormal: { libelle: 'Anormal', classe: 'bg-warn-soft text-warn' },
  normal: { libelle: 'Normal', classe: 'bg-brand-soft text-brand-dark' },
  'non-interprete': { libelle: 'Non interprete', classe: 'bg-paper text-ink-soft' },
} as const;

/**
 * Une demande d'examen et l'historique de ses resultats.
 *
 * Toutes les versions sont affichees, y compris celles qu'une correction a
 * remplacees. Un clinicien a pu prescrire sur la foi d'une valeur fausse ;
 * la masquer efface la raison de ce qu'il a fait.
 */
export default async function ExamenPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('plateau:read', '/hopital/plateau');
  const { id } = await params;

  const demande = demandeParId(id);
  if (!demande) notFound();

  const patient = get<{ given_name: string; family_name: string }>(
    'SELECT given_name, family_name FROM patient WHERE id = ?',
    [demande.patientId],
  );
  if (!patient) notFound();

  const fuseau = fuseauDe(ctx.user.organization_id ?? null);
  const versions = historiqueResultats(id);
  const seuil = seuils(ctx.user.organization_id ?? null).find(
    (s) => s.examen.toLowerCase() === demande.examen.toLowerCase(),
  );

  return (
    <div className="grid gap-6">
      <section className="card-pad">
        <h1 className="text-lg font-bold">{demande.examen}</h1>
        <p className="text-sm text-ink-soft">
          {patient.given_name} {patient.family_name} · {demande.domaine} · {demande.priorite} ·{' '}
          {demande.etat}
        </p>
        <p className="mt-2 text-xs text-ink-soft">
          {seuil ? (
            <>
              Seuils de l etablissement : {seuil.bas ?? '—'} / {seuil.haut ?? '—'} {seuil.unite}
            </>
          ) : (
            // Dit explicitement pourquoi un resultat sortira « non
            // interprete » : sans cette ligne, l'absence de verdict passe
            // pour une panne.
            <>
              Aucun seuil configure pour cet examen : les resultats seront rendus non interpretes,
              et non declares normaux.
            </>
          )}
        </p>
      </section>

      <section className="card">
        <header className="border-b border-line px-5 py-3">
          <h2 className="text-base font-bold">
            Resultats ({versions.length} version{versions.length > 1 ? 's' : ''})
          </h2>
          <p className="text-xs text-ink-soft">
            Une correction cree une version ; elle n efface jamais la precedente.
          </p>
        </header>

        {versions.length === 0 ? (
          <p className="p-5 text-sm text-ink-soft">
            Aucun resultat rendu.
            {!demande.preleveeLe && ' Le prelevement n est pas encore enregistre.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {versions.map((v) => {
              const interp = INTERPRETATION[v.interpretation] ?? INTERPRETATION['non-interprete'];
              const remplacee = Boolean(v.remplace_par);
              return (
                <li key={v.id} className={`px-5 py-3 ${remplacee ? 'bg-paper' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-lg font-bold ${remplacee ? 'text-ink-soft line-through' : ''}`}>
                      {v.valeur_num ?? v.valeur_texte ?? '—'} {v.unite ?? ''}
                    </span>
                    <span className={`chip ${interp.classe}`}>{interp.libelle}</span>
                    {v.a_transmettre === 1 && (
                      <span className="chip bg-danger text-white">A transmettre</span>
                    )}
                    {remplacee && <span className="chip bg-paper text-ink-soft">Remplacee</span>}
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    rendu {formaterInstant(v.rendu_le, fuseau)}
                    {v.motif_correction ? ` · correction : ${v.motif_correction}` : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-xs text-ink-soft">
        <Link href="/hopital/plateau" className="hover:underline">
          ← Plateau technique
        </Link>
      </p>
    </div>
  );
}
