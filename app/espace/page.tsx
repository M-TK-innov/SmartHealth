import Link from 'next/link';
import Logo from '@/components/Logo';
import { requirePatient } from '@/lib/patient/session';
import {
  analysesDe,
  dossierMedicalDe,
  facturesDe,
  noterVisiteADistance,
  ordonnancesDe,
  rendezVousDe,
  sejoursDe,
} from '@/lib/patient/dossier';
import { francs } from '@/lib/hopital/caisse';
import { DeconnexionPatient } from '@/components/espace/DeconnexionPatient';
import { PayerFacture } from '@/components/espace/PayerFacture';
import { ConsentementDistance } from '@/components/espace/ConsentementDistance';
import { referenceFacture } from '@/lib/paiement/tentative';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Mon espace sante — SmartHealth' };

const JOUR = (v: string | null) => (v ? v.slice(0, 10) : '');

/** « 2026-11-12 09:30:00 » devient « 2026-11-12 a 09:30 ». */
const DATE_HEURE = (v: string) => `${v.slice(0, 10)} a ${v.slice(11, 16)}`;

/**
 * Etats d'un examen, dits au patient.
 *
 * « prelevee » ou « resultat-disponible » sont du vocabulaire de laboratoire.
 * Quelqu'un qui attend ses resultats veut savoir ou il en est, pas apprendre
 * la nomenclature interne.
 */
const ETAT_EXAMEN: Record<string, string> = {
  demandee: 'Demande',
  prelevee: 'Preleve',
  'en-cours': 'En cours',
  'resultat-disponible': 'Resultat arrive',
  validee: 'Valide',
};

/**
 * Accueil de l'espace patient.
 *
 * L'ORDRE SUIT CE QU'ON VIENT Y CHERCHER, pas l'organigramme de l'hopital :
 * ce que je dois payer, quand je dois revenir, ce que je dois prendre, ce que
 * mes examens ont donne, ce que je dois pouvoir montrer aux urgences, ou je
 * suis passe. Pas de tableau de bord, pas de graphique : quelqu'un qui ouvre
 * cet ecran a une question precise et veut y repondre en un coup d'oeil.
 *
 * Le dossier medical vient en avant-dernier et non en tete, bien qu'il soit
 * le plus « complet ». On ne consulte pas son groupe sanguin toutes les
 * semaines ; on verifie une date de rendez-vous, oui.
 */
export default async function EspacePage() {
  const session = await requirePatient('/espace');

  const ordonnances = ordonnancesDe(session);
  const factures = facturesDe(session);
  const sejours = sejoursDe(session);
  const rendezVous = rendezVousDe(session);
  const analyses = analysesDe(session);
  // Le premier dossier rattache. Un compte qui en porte plusieurs — un parent
  // qui suit ses enfants — verra le sien ; melanger les allergies de deux
  // personnes dans une seule liste serait dangereux.
  const dossier =
    session.dossiers.length > 0
      ? dossierMedicalDe(session, session.dossiers[0].patient_id)
      : null;

  const prochain = rendezVous.find((r) => !r.passe && r.etat !== 'annule');
  // Une valeur critique que personne n'a encore acquittee : le patient est le
  // premier au courant, et il doit le savoir pour appeler lui-meme.
  const critiquesNonJointes = analyses.filter((a) => a.centreNonJoint);

  // Une visite a distance est une visite qu'on n'a pas eu a faire. Comptee
  // une seule fois pour cette session, sans rien de nominatif.
  noterVisiteADistance(session);

  const duTotal = factures.reduce((n, f) => n + f.resteACharge, 0);

  return (
    <main className="mx-auto max-w-md px-4 py-6 pb-16">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Logo className="h-9 w-9 text-brand" />
          <div>
            <p className="text-[15px] font-bold leading-none">Mon espace sante</p>
            <p className="text-[11px] text-ink-soft">
              {session.dossiers.length} dossier{session.dossiers.length > 1 ? 's' : ''} rattache
              {session.dossiers.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <DeconnexionPatient />
      </header>

      {duTotal > 0 && (
        <section className="card-pad mb-4 border-l-4 border-warn">
          <p className="text-sm text-ink-soft">Reste a payer</p>
          <p className="text-2xl font-bold">{francs(duTotal)}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Reglable a la caisse de votre centre. Presentez le numero de la facture.
          </p>
        </section>
      )}

      {critiquesNonJointes.length > 0 && (
        <section className="card-pad mb-4 border-l-4 border-danger">
          <p className="text-sm font-semibold text-danger">Resultat a signaler sans attendre</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            {critiquesNonJointes.length === 1
              ? 'Un de vos resultats est hors des valeurs attendues'
              : `${critiquesNonJointes.length} de vos resultats sont hors des valeurs attendues`}{' '}
            et votre centre n a pas encore pu etre joint a ce sujet. Appelez-le, ou presentez-vous
            aux urgences si vous vous sentez mal.
          </p>
        </section>
      )}

      {prochain && (
        <section className="card-pad mb-4 border-l-4 border-brand">
          <p className="text-sm text-ink-soft">Prochain rendez-vous</p>
          <p className="text-lg font-bold">{DATE_HEURE(prochain.debut)}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            {prochain.aDistance ? 'A distance' : 'Sur place'}
            {prochain.praticien ? ` — ${prochain.praticien}` : ''}
            {prochain.lieu ? ` — ${prochain.lieu}` : ''}
          </p>
          {prochain.salle && (
            <Link href={`/espace/salle/${prochain.salle}`} className="btn-primary btn-sm mt-3 inline-block">
              Entrer en consultation
            </Link>
          )}
        </section>
      )}

      <section className="mb-6">
        <h2 className="section-title mb-2">Mes rendez-vous</h2>
        {rendezVous.length === 0 ? (
          <p className="card-pad text-sm text-ink-soft">
            Aucun rendez-vous. Votre centre en fixe un a la fin d une consultation, ou par
            telephone.
          </p>
        ) : (
          <ul className="space-y-2">
            {rendezVous.map((r) => (
              <li
                key={r.id}
                className={`card-pad ${r.passe || r.etat === 'annule' ? 'opacity-70' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{DATE_HEURE(r.debut)}</p>
                    <p className="truncate text-xs text-ink-soft">
                      {r.aDistance ? 'A distance' : 'Sur place'}
                      {r.praticien ? ` — ${r.praticien}` : ''}
                      {r.motif ? ` — ${r.motif}` : ''}
                    </p>
                  </div>
                  {r.etat === 'annule' ? (
                    <span className="chip bg-danger-soft text-danger">Annule</span>
                  ) : r.etat === 'absent' ? (
                    <span className="chip bg-warn-soft text-warn">Non honore</span>
                  ) : r.passe ? (
                    <span className="chip">Passe</span>
                  ) : (
                    <span className="chip bg-brand-soft text-brand">A venir</span>
                  )}
                </div>
                {r.etat === 'annule' && r.annuleMotif && (
                  <p className="mt-2 text-xs text-ink-soft">Motif : {r.annuleMotif}</p>
                )}
                {r.aDistance && !r.passe && r.etat !== 'annule' && !r.consentementDonne && (
                  <ConsentementDistance rendezVousId={r.id} />
                )}
                {r.salle && (
                  <Link
                    href={`/espace/salle/${r.salle}`}
                    className="btn-primary btn-sm mt-2 inline-block"
                  >
                    Entrer en consultation
                  </Link>
                )}
                {r.aDistance && !r.passe && r.etat !== 'annule' && r.consentementDonne && !r.salle && (
                  <p className="mt-2 rounded-lg bg-paper p-2 text-xs leading-relaxed text-ink-soft">
                    Votre accord est enregistre. La salle ouvre un quart d heure avant l heure du
                    rendez-vous.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <h2 className="section-title mb-2">Mes ordonnances</h2>
        {ordonnances.length === 0 ? (
          <p className="card-pad text-sm text-ink-soft">
            Aucune ordonnance validee pour le moment. Une ordonnance n apparait ici qu une fois
            signee par le praticien.
          </p>
        ) : (
          <ul className="space-y-3">
            {ordonnances.map((o) => (
              <li key={o.id} className={`card-pad ${o.annulee ? 'opacity-70' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {JOUR(o.prescriteLe)}
                      {o.prescripteur ? ` — ${o.prescripteur}` : ''}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {o.lignes.length} medicament{o.lignes.length > 1 ? 's' : ''}
                    </p>
                  </div>
                  {o.annulee && (
                    <span className="chip bg-danger-soft text-danger">Annulee</span>
                  )}
                </div>

                <ul className="mt-3 space-y-2">
                  {o.lignes.map((l, i) => (
                    <li key={i} className={`text-sm ${o.annulee ? 'line-through' : ''}`}>
                      <b>{l.medicament}</b>
                      {l.dosage ? ` ${l.dosage}` : ''}
                      {l.posologie ? <span className="text-ink-soft"> — {l.posologie}</span> : null}
                      {l.dureeJours ? (
                        <span className="text-ink-soft"> pendant {l.dureeJours} jours</span>
                      ) : null}
                    </li>
                  ))}
                </ul>

                {o.annulee ? (
                  <p className="mt-3 rounded-lg bg-danger-soft p-2 text-xs leading-relaxed text-danger">
                    Cette ordonnance a ete annulee. Ne la presentez pas en pharmacie, meme si vous
                    en avez garde une photo.
                  </p>
                ) : o.qr ? (
                  <p className="mt-3 break-all rounded-lg bg-paper p-2 font-mono text-[11px] text-ink-soft">
                    Code pharmacie : {o.qr}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <h2 className="section-title mb-2">Mes factures</h2>
        {factures.length === 0 ? (
          <p className="card-pad text-sm text-ink-soft">Aucune facture.</p>
        ) : (
          <ul className="space-y-3">
            {factures.map((f) => (
              <li key={f.id} className="card-pad">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-xs text-ink-soft">{referenceFacture(f.id)}</p>
                  {f.soldee ? (
                    <span className="chip">Soldee</span>
                  ) : (
                    <span className="chip bg-warn-soft text-warn">{francs(f.resteACharge)}</span>
                  )}
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {f.lignes.map((l, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {l.libelle}
                        {l.quantite > 1 ? ` x${l.quantite}` : ''}
                      </span>
                      <span className="shrink-0 tabular-nums">{francs(l.montant * l.quantite)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex justify-between border-t border-line pt-2 text-sm">
                  <span className="text-ink-soft">Total</span>
                  <span className="font-semibold tabular-nums">{francs(f.total)}</span>
                </div>
                {f.partTiers > 0 && (
                  <div className="flex justify-between text-sm text-ink-soft">
                    <span>Pris en charge</span>
                    <span className="tabular-nums">{francs(f.partTiers)}</span>
                  </div>
                )}
                <PayerFacture factureId={f.id} resteACharge={f.resteACharge} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <h2 className="section-title mb-2">Mes analyses</h2>
        {analyses.length === 0 ? (
          <p className="card-pad text-sm text-ink-soft">Aucun examen demande.</p>
        ) : (
          <ul className="space-y-2">
            {analyses.map((a) => (
              <li key={a.id} className="card-pad">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{a.examen}</p>
                    <p className="text-xs text-ink-soft">
                      {a.domaine === 'imagerie' ? 'Imagerie' : 'Laboratoire'} —{' '}
                      {JOUR(a.demandeeLe)}
                    </p>
                  </div>
                  {a.valeur === null ? (
                    <span className="chip">{ETAT_EXAMEN[a.etat] ?? a.etat}</span>
                  ) : a.critique ? (
                    <span className="chip bg-danger-soft text-danger">Critique</span>
                  ) : a.interpretation === 'anormal' ? (
                    <span className="chip bg-warn-soft text-warn">Hors normes</span>
                  ) : a.interpretation === 'normal' ? (
                    <span className="chip bg-brand-soft text-brand">Normal</span>
                  ) : (
                    <span className="chip">Rendu</span>
                  )}
                </div>

                {a.valeur !== null && (
                  <p className="mt-2 text-lg font-bold tabular-nums">
                    {a.valeur}
                    {a.unite ? <span className="text-sm font-normal text-ink-soft"> {a.unite}</span> : null}
                  </p>
                )}

                {a.centreNonJoint ? (
                  <p className="mt-2 rounded-lg bg-danger-soft p-2 text-xs leading-relaxed text-danger">
                    Ce resultat demande une reaction rapide et votre centre n a pas encore pu etre
                    joint. Appelez-le, ou presentez-vous aux urgences si vous vous sentez mal.
                  </p>
                ) : a.critique ? (
                  <p className="mt-2 rounded-lg bg-paper p-2 text-xs leading-relaxed text-ink-soft">
                    Votre centre a ete prevenu de ce resultat et vous rappellera.
                  </p>
                ) : a.interpretation === 'anormal' ? (
                  <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                    Hors des valeurs habituelles. Une valeur isolee ne fait pas un diagnostic :
                    parlez-en a la personne qui vous suit.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {dossier && (
        <section className="mb-6">
          <h2 className="section-title mb-2">Mon dossier medical</h2>
          <div className="card-pad">
            <p className="text-sm font-semibold">{dossier.nom}</p>
            <p className="text-xs text-ink-soft">
              {dossier.neLe
                ? `Ne${dossier.sexe === 'female' ? 'e' : ''} le ${JOUR(dossier.neLe)}${dossier.naissanceEstimee ? ' (estimee)' : ''}`
                : 'Date de naissance non renseignee'}
              {dossier.groupeSanguin ? ` — Groupe ${dossier.groupeSanguin}` : ''}
            </p>
            {dossier.numeroDossier && (
              <p className="mt-1 font-mono text-[11px] text-ink-soft">
                Dossier {dossier.numeroDossier}
                {dossier.npi ? ` — NPI ${dossier.npi}` : ''}
              </p>
            )}

            <div className="mt-3 border-t border-line pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Allergies
              </p>
              {dossier.allergies.length === 0 ? (
                <p className="mt-1 text-sm text-ink-soft">Aucune allergie enregistree.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-sm">
                  {dossier.allergies.map((a, i) => (
                    <li key={i}>
                      <b>{a.substance}</b>
                      {a.reaction ? <span className="text-ink-soft"> — {a.reaction}</span> : null}
                      {a.criticite === 'high' ? (
                        <span className="ml-1 chip bg-danger-soft text-danger">Grave</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-3 border-t border-line pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Maladies au long cours
              </p>
              {dossier.problemes.length === 0 ? (
                <p className="mt-1 text-sm text-ink-soft">Rien d enregistre.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-sm">
                  {dossier.problemes.map((p, i) => (
                    <li key={i} className={p.actif ? '' : 'text-ink-soft line-through'}>
                      {p.libelle}
                      {p.depuis ? <span className="text-ink-soft"> — depuis {JOUR(p.depuis)}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-3 border-t border-line pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Traitements en cours
              </p>
              {dossier.traitements.length === 0 ? (
                <p className="mt-1 text-sm text-ink-soft">Aucun traitement au long cours.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-sm">
                  {dossier.traitements.map((m, i) => (
                    <li key={i}>
                      <b>{m.medicament}</b>
                      {m.dose ? <span className="text-ink-soft"> — {m.dose}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="mt-3 rounded-lg bg-paper p-2 text-xs leading-relaxed text-ink-soft">
              Cet ecran remplace le carnet : montrez-le si vous arrivez aux urgences sans pouvoir
              repondre vous-meme.
            </p>
          </div>
        </section>
      )}

      <section className="mb-6">
        <h2 className="section-title mb-2">Mes passages</h2>
        {sejours.length === 0 ? (
          <p className="card-pad text-sm text-ink-soft">Aucun passage enregistre.</p>
        ) : (
          <ul className="space-y-2">
            {sejours.map((s) => (
              <li key={s.id} className="card-pad flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{JOUR(s.entreeLe)}</p>
                  {s.motif && <p className="truncate text-xs text-ink-soft">{s.motif}</p>}
                </div>
                {s.enCours ? (
                  <span className="chip bg-brand-soft text-brand">En cours</span>
                ) : (
                  <span className="text-xs text-ink-soft">{JOUR(s.sortieLe)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs leading-relaxed text-ink-soft">
        Vos resultats figurent ici avec leurs valeurs. Une valeur isolee ne fait pas un
        diagnostic : les comptes rendus et l interpretation se lisent avec la personne qui vous
        suit.{' '}
        <Link href="/espace/connexion" className="underline">
          Aide
        </Link>
      </p>
    </main>
  );
}
