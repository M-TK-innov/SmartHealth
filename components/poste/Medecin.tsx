import { all, get } from '@/lib/db';
import type { AuthContext } from '@/lib/auth/session';
import { organizationFilter } from '@/lib/auth/guard';
import { critiquesNonTransmises } from '@/lib/hopital/plateau-store';
import { journeeDe } from '@/lib/rdv/store';
import Link from 'next/link';
import { Chiffre, Entete, Gestes, Ligne, Pile, aujourdhui, heure } from './elements';

/**
 * Le poste du medecin.
 *
 * CE QU'IL OUVRE EN PREMIER, DANS CET ORDRE : une valeur critique qui attend
 * son acquittement, ce qui attend sa signature, ses rendez-vous du jour, puis
 * ses consultations en cours. L'ordre n'est pas esthetique — il va du plus
 * couteux a ignorer au moins couteux.
 *
 * UNE VALEUR CRITIQUE NON ACQUITTEE PASSE DEVANT TOUT. Tant que personne n'a
 * ete joint nommement, le laboratoire a rendu un resultat que nul n'a lu.
 * C'est la seule chose de cet ecran qui se compte en minutes.
 *
 * CE QUI A DISPARU : la banniere qui expliquait le produit. Elle s'adresse a
 * quelqu'un qui decouvre la plateforme, pas a un praticien qui l'ouvre pour la
 * huitieme fois de la journee. Elle vit sur /demo, ou elle a du sens.
 */

interface LigneConsultation {
  id: string;
  status: string;
  started_at: string;
  given_name: string;
  family_name: string;
  mrn: string | null;
}

export async function PosteMedecin({ ctx }: { ctx: AuthContext }) {
  const scoped = organizationFilter(ctx);
  const ou = scoped ? '(c.organization_id = ? OR c.organization_id IS NULL)' : '1 = 1';
  const args: unknown[] = scoped ? [scoped] : [];

  const aSigner = all<LigneConsultation>(
    `SELECT c.id, c.status, c.started_at, p.given_name, p.family_name, p.mrn
       FROM consultation c JOIN patient p ON p.id = c.patient_id
      WHERE ${ou} AND c.status = 'analyzed'
      ORDER BY c.started_at`,
    args,
  );

  const enCours = all<LigneConsultation>(
    `SELECT c.id, c.status, c.started_at, p.given_name, p.family_name, p.mrn
       FROM consultation c JOIN patient p ON p.id = c.patient_id
      WHERE ${ou} AND c.status = 'in-progress'
      ORDER BY c.started_at DESC LIMIT 8`,
    args,
  );

  const brouillons =
    get<{ n: number }>(
      `SELECT COUNT(*) n FROM prescription r
         JOIN consultation c ON c.id = r.consultation_id
        WHERE r.status = 'draft' AND ${ou}`,
      args,
    )?.n ?? 0;

  const critiques = critiquesNonTransmises(scoped);

  // Le planning n'existe que pour un compte rattache a un praticien. Un
  // medecin sans fiche praticien est une anomalie de configuration, pas une
  // raison de faire tomber son ecran.
  const planning = ctx.user.practitioner_id ? journeeDe(ctx.user.practitioner_id, aujourdhui()) : [];
  const aVenir = planning.filter((r) => r.etat !== 'annule' && r.etat !== 'honore');

  const nom = (l: LigneConsultation) => `${l.given_name} ${l.family_name}`;

  return (
    <div className="space-y-4">
      <Entete
        titre={`Bonjour ${ctx.user.full_name.split(' ')[0]}`}
        sous={
          aSigner.length + aVenir.length === 0
            ? 'Rien ne vous attend pour le moment.'
            : `${aSigner.length} compte rendu${aSigner.length > 1 ? 's' : ''} a signer, ${aVenir.length} rendez-vous aujourd hui.`
        }
        urgent={
          critiques.length > 0
            ? {
                libelle: `${critiques.length} valeur${critiques.length > 1 ? 's' : ''} critique${critiques.length > 1 ? 's' : ''} sans acquittement : personne n a encore ete joint`,
                href: '/hopital/plateau',
              }
            : null
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <Chiffre valeur={aSigner.length} libelle="A signer" href="/consultations" alerte={aSigner.length > 0} />
        <Chiffre valeur={brouillons} libelle="Ordonnances a valider" href="/consultations" />
        <Chiffre valeur={aVenir.length} libelle="Rendez-vous du jour" href="/rendez-vous" />
      </section>

      <Gestes
        enfants={[
          { libelle: 'Mes patients', href: '/patients' },
          { libelle: 'Mon planning', href: '/rendez-vous' },
          { libelle: 'Interoperabilite', href: '/interop' },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Pile
          titre="A signer"
          compte={aSigner.length}
          vide="Aucun compte rendu n attend votre signature."
          tout={{ libelle: 'Toutes les consultations', href: '/consultations' }}
        >
          {aSigner.map((c) => (
            <Ligne
              key={c.id}
              href={`/consultations/${c.id}`}
              titre={nom(c)}
              sous={`${c.mrn ?? 'sans numero'} · ${heure(c.started_at)}`}
              marque={{ texte: 'a signer', classe: 'bg-warn-soft text-warn' }}
            />
          ))}
        </Pile>

        <Pile
          titre="Aujourd hui"
          compte={aVenir.length}
          vide="Aucun rendez-vous aujourd hui."
          tout={{ libelle: 'Le planning', href: '/rendez-vous' }}
        >
          {aVenir.map((r) => (
            <Ligne
              key={r.id}
              href={r.mode === 'distance' && r.etat === 'en-cours' ? `/rendez-vous/${r.id}/salle` : '/rendez-vous'}
              titre={`${heure(r.debut)} · ${r.motif ?? 'Consultation'}`}
              sous={r.mode === 'distance' ? 'A distance' : 'Sur place'}
              marque={
                r.mode === 'distance'
                  ? r.consentement_le
                    ? { texte: 'accord donne', classe: 'bg-brand-soft text-brand' }
                    : { texte: 'accord en attente', classe: 'bg-warn-soft text-warn' }
                  : null
              }
            />
          ))}
        </Pile>
      </div>

      <Pile
        titre="Consultations en cours"
        compte={enCours.length}
        vide="Aucune consultation ouverte."
        tout={{ libelle: 'Tout voir', href: '/consultations' }}
      >
        {enCours.map((c) => (
          <Ligne
            key={c.id}
            href={`/consultations/${c.id}`}
            titre={nom(c)}
            sous={`${c.mrn ?? 'sans numero'} · ouverte a ${heure(c.started_at)}`}
            marque={{ texte: 'en cours', classe: 'bg-brand-soft text-brand' }}
          />
        ))}
      </Pile>

      <section className="card-pad">
        <h2 className="section-title">Demarrer une consultation</h2>
        <p className="mt-1 text-xs text-ink-soft">
          Une consultation part toujours d un dossier : on choisit le patient, puis on ouvre. Le
          dossier se cree au meme endroit si le patient vient pour la premiere fois.
        </p>
        <Link href="/patients" className="btn-primary btn-sm mt-3 inline-block">
          Choisir un patient
        </Link>
      </section>
    </div>
  );
}
