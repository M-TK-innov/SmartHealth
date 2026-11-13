import Link from 'next/link';
import type { AuthContext } from '@/lib/auth/session';
import { organizationFilter } from '@/lib/auth/guard';
import { tableauTension } from '@/lib/hopital/flux-store';
import { tableauOccupation } from '@/lib/hopital/store';
import { demandesEnCours } from '@/lib/hopital/plateau-store';
import { enAttenteDansLEtablissement } from '@/lib/parcours/store';
import { Chiffre, Entete, Gestes, Ligne, Pile } from './elements';

/**
 * Le poste de l'infirmier d'accueil.
 *
 * SON ECRAN REGARDE DEHORS, PAS DEDANS. Le medecin ouvre sur ce qu'il doit
 * finir ; l'accueil ouvre sur qui attend. L'ordre suit la salle d'attente :
 * les files d'abord, les lits ensuite, les prelevements apres.
 *
 * LES LITS A PREPARER SONT COMPTES A PART des lits libres, et ce n'est pas un
 * detail d'affichage : un lit « a preparer » n'accueille personne tant que
 * quelqu'un n'y est pas alle. Les fondre ensemble ferait annoncer des places
 * qui n'existent pas encore.
 */
/**
 * La couleur dit QUI doit agir, pas la gravite.
 *
 * Rouge pour ce qui attend un soignant sur un resultat, ambre pour ce qui
 * attend une decision medicale, neutre pour ce qui attend un guichet. Un
 * ecran ou tout est rouge ne hierarchise plus rien.
 */
const MARQUE_SUITE: Record<string, string> = {
  resultat: 'bg-danger-soft text-danger',
  consultation: 'bg-warn-soft text-warn',
  ordonnance: 'bg-warn-soft text-warn',
  examen: 'bg-warn-soft text-warn',
  lit: 'bg-warn-soft text-warn',
};

export async function PosteInfirmier({ ctx }: { ctx: AuthContext }) {
  const scoped = organizationFilter(ctx);

  // Ce que chaque module sait des patients, rassemble en une vue.
  const attentes = enAttenteDansLEtablissement(scoped);

  const tension = tableauTension(scoped);
  const unites = tableauOccupation(scoped);
  const examens = demandesEnCours(scoped);

  const enAttente = tension.reduce((n, t) => n + t.enAttente, 0);
  const aPrelever = examens.filter((d) => d.etat === 'demandee');

  // Les comptes viennent du module d'occupation, qui retire deja les lits hors
  // service du denominateur. Les recompter ici ferait vivre deux versions de
  // la meme regle, et elles finiraient par diverger.
  const libres = unites.reduce((n, u) => n + u.libres, 0);
  const aPreparer = unites.reduce((n, u) => n + u.aPreparer, 0);

  // Le poste le plus tendu passe devant : c'est la que la salle d'attente
  // deborde, et c'est la qu'un geste change quelque chose.
  const plusTendu = [...tension].sort((a, b) => b.enAttente - a.enAttente)[0];

  return (
    <div className="space-y-4">
      <Entete
        titre={`Accueil · ${ctx.organization?.name ?? 'votre centre'}`}
        sous={
          enAttente === 0
            ? 'Personne n attend pour le moment.'
            : `${enAttente} personne${enAttente > 1 ? 's' : ''} en attente, ${libres} lit${libres > 1 ? 's' : ''} libre${libres > 1 ? 's' : ''}.`
        }
        urgent={
          plusTendu && (plusTendu.enAttente ?? 0) >= 5
            ? {
                libelle: `${plusTendu.nom} : ${plusTendu.enAttente} personnes en attente, la plus ancienne depuis ${plusTendu.attenteMaxMinutes} min`,
                href: `/hopital/files/${plusTendu.posteId}`,
              }
            : null
        }
      />

      <section className="grid gap-3 sm:grid-cols-4">
        <Chiffre valeur={enAttente} libelle="En attente" href="/hopital" alerte={enAttente >= 5} />
        <Chiffre valeur={libres} libelle="Lits libres" href="/hopital" />
        <Chiffre valeur={aPreparer} libelle="Lits a preparer" href="/hopital" alerte={aPreparer > 0} />
        <Chiffre
          valeur={aPrelever.length}
          libelle="Prelevements a faire"
          href="/hopital/plateau"
          alerte={aPrelever.length > 0}
        />
      </section>

      <Gestes
        enfants={[
          { libelle: 'Enregistrer un patient', href: '/patients' },
          { libelle: 'Poser un rendez-vous', href: '/rendez-vous' },
          { libelle: 'Lits et files', href: '/hopital' },
          { libelle: 'Laboratoire', href: '/hopital/plateau' },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Pile
          titre="Les files"
          compte={tension.length}
          vide="Aucun poste d accueil declare."
          tout={{ libelle: 'Tout voir', href: '/hopital' }}
        >
          {tension.map((t) => (
            <Ligne
              key={t.posteId}
              href={`/hopital/files/${t.posteId}`}
              titre={t.nom}
              sous={
                t.enAttente === 0
                  ? `${t.enCours} en cours`
                  : `${t.enAttente} en attente · plus ancienne depuis ${t.attenteMaxMinutes} min` +
                    (t.partis > 0 ? ` · ${t.partis} parti${t.partis > 1 ? 's' : ''} sans etre vu` : '')
              }
              marque={
                t.enAttente >= 5
                  ? { texte: 'sature', classe: 'bg-danger-soft text-danger' }
                  : t.enAttente > 0
                    ? { texte: 'file', classe: 'bg-warn-soft text-warn' }
                    : { texte: 'calme', classe: 'bg-brand-soft text-brand' }
              }
            />
          ))}
        </Pile>

        <Pile
          titre="A prelever"
          compte={aPrelever.length}
          vide="Aucun prelevement en attente."
          tout={{ libelle: 'Le laboratoire', href: '/hopital/plateau' }}
        >
          {aPrelever.slice(0, 10).map((d) => (
            <Ligne
              key={d.id}
              href={`/hopital/plateau/${d.id}`}
              titre={d.examen}
              sous={d.domaine === 'imagerie' ? 'Imagerie' : 'Laboratoire'}
              marque={
                d.priorite === 'vitale'
                  ? { texte: 'vital', classe: 'bg-danger-soft text-danger' }
                  : d.priorite === 'urgente'
                    ? { texte: 'urgent', classe: 'bg-warn-soft text-warn' }
                    : null
              }
            />
          ))}
        </Pile>
      </div>

      <Pile
        titre="Les unites"
        compte={unites.length}
        vide="Aucune unite de soins declaree."
        tout={{ libelle: 'Lits et files', href: '/hopital' }}
      >
        {unites.map((u) => {
          const servables = u.total - u.horsService;
          return (
            <Ligne
              key={u.uniteId}
              href="/hopital"
              titre={u.nom}
              sous={
                `${u.occupes} / ${servables} occupes` +
                (u.aPreparer > 0 ? ` · ${u.aPreparer} a preparer` : '') +
                (u.horsService > 0 ? ` · ${u.horsService} hors service` : '')
              }
              marque={
                u.libres === 0 && servables > 0
                  ? { texte: 'complet', classe: 'bg-danger-soft text-danger' }
                  : null
              }
            />
          );
        })}
      </Pile>

      <section className="card-pad">
        <h2 className="section-title">Ce que ce poste ne fait pas</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          Signer un compte rendu, valider une ordonnance, encaisser, dispenser. Ce n est pas un
          oubli : separer celui qui execute de celui qui prescrit est ce qui permet au second de
          repondre de ce qu il a decide.{' '}
          <Link href="/demo" className="underline">
            Le parcours guide
          </Link>{' '}
          explique ce decoupage.
        </p>
      </section>

      <Pile
        titre="Les patients qui attendent quelque chose"
        compte={attentes.length}
        vide="Aucun patient n attend quoi que ce soit."
        tout={{ libelle: 'Les dossiers', href: '/patients' }}
      >
        {attentes.map((a) => (
          <Ligne
            key={a.patientId}
            href={`/patients/${a.patientId}`}
            titre={a.nom}
            sous={a.suite.pourquoi || a.suite.libelle}
            marque={{ texte: a.suite.libelle, classe: MARQUE_SUITE[a.suite.etape] ?? '' }}
          />
        ))}
      </Pile>
    </div>
  );
}
