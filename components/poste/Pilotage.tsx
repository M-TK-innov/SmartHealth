import type { AuthContext } from '@/lib/auth/session';
import { all, get } from '@/lib/db';
import { Chiffre, Entete, Gestes, Ligne, Pile } from './elements';

/**
 * Les postes qui ne soignent pas : ministere et administration.
 *
 * DEUX ECRANS, UN SEUL FICHIER, PARCE QUE LEUR FORME EST LA MEME : des
 * agregats et des listes d'objets administratifs. Ce qui change est ce qu'ils
 * ont le droit de voir, et ce droit est deja tranche ailleurs — ici on se
 * contente de ne demander que ce que le role porte.
 *
 * AUCUN NOM DE PATIENT SUR CES ECRANS. Ni pour le ministere, qui n'y a pas
 * droit, ni pour l'administrateur de plateforme, qui n'en a pas l'usage. Un
 * compteur d'activite se construit sans jamais joindre la table des patients.
 */

export async function PosteMinistere({ ctx }: { ctx: AuthContext }) {
  const mois = new Date().toISOString().slice(0, 7);

  const consultations =
    get<{ n: number }>(
      "SELECT COUNT(*) n FROM consultation WHERE substr(started_at, 1, 7) = ? AND status = 'signed'",
      [mois],
    )?.n ?? 0;

  const etablissements =
    get<{ n: number }>("SELECT COUNT(*) n FROM organization WHERE type <> 'ministry'")?.n ?? 0;

  const parEtablissement = all<{ nom: string; n: number }>(
    `SELECT o.name AS nom, COUNT(c.id) AS n
       FROM organization o
       LEFT JOIN consultation c
         ON c.organization_id = o.id
        AND substr(c.started_at, 1, 7) = ?
        AND c.status = 'signed'
      WHERE o.type <> 'ministry'
      GROUP BY o.id, o.name
      ORDER BY n DESC`,
    [mois],
  );

  return (
    <div className="space-y-4">
      <Entete
        titre="Pilotage national"
        sous={`${consultations} consultation${consultations > 1 ? 's' : ''} signee${consultations > 1 ? 's' : ''} ce mois, sur ${etablissements} etablissement${etablissements > 1 ? 's' : ''}.`}
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <Chiffre valeur={consultations} libelle="Consultations signees ce mois" href="/interop/rapport-mensuel" />
        <Chiffre valeur={etablissements} libelle="Etablissements" href="/admin/organisations" />
        <Chiffre valeur={mois} libelle="Periode en cours" href="/interop/rapport-mensuel" />
      </section>

      <Gestes
        enfants={[
          { libelle: 'Rapport de surveillance', href: '/interop/rapport-mensuel' },
          { libelle: 'Exports', href: '/interop' },
          { libelle: 'Etablissements', href: '/admin/organisations' },
          { libelle: 'Allegement administratif', href: '/admin/allegement' },
        ]}
      />

      <Pile
        titre="Activite par etablissement"
        compte={parEtablissement.length}
        vide="Aucun etablissement enregistre."
        tout={{ libelle: 'Le rapport mensuel', href: '/interop/rapport-mensuel' }}
      >
        {parEtablissement.map((e) => (
          <Ligne
            key={e.nom}
            href="/interop/rapport-mensuel"
            titre={e.nom}
            sous={`${e.n} consultation${e.n > 1 ? 's' : ''} signee${e.n > 1 ? 's' : ''} ce mois`}
          />
        ))}
      </Pile>

      <section className="card-pad">
        <h2 className="section-title">Ce que cet ecran ne montre pas</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          Aucun dossier nominatif, aucun compte rendu, aucun resultat. Le pilotage national se fait
          sur des agregats : c est une regle du produit, pas une limite de cet ecran, et elle se
          verifie en essayant d ouvrir la liste des patients.
        </p>
      </section>
    </div>
  );
}

export async function PosteAdministration({ ctx }: { ctx: AuthContext }) {
  const superAdmin = ctx.user.role === 'super_admin';

  const comptes = get<{ n: number }>('SELECT COUNT(*) n FROM user_account')?.n ?? 0;
  const enAttente =
    get<{ n: number }>("SELECT COUNT(*) n FROM user_account WHERE status = 'pending'")?.n ?? 0;
  const suspendus =
    get<{ n: number }>("SELECT COUNT(*) n FROM user_account WHERE status = 'suspended'")?.n ?? 0;
  const organisations = get<{ n: number }>('SELECT COUNT(*) n FROM organization')?.n ?? 0;
  const sessions =
    get<{ n: number }>("SELECT COUNT(*) n FROM user_session WHERE expires_at > datetime('now')")?.n ?? 0;

  const recents = all<{ at: string; action: string; entity: string; actor_label: string | null }>(
    `SELECT at, action, entity, actor_label FROM audit_log ORDER BY at DESC LIMIT 8`,
  );

  return (
    <div className="space-y-4">
      <Entete
        titre={superAdmin ? 'Super-administration' : 'Administration de la plateforme'}
        sous={`${comptes} compte${comptes > 1 ? 's' : ''}, ${organisations} organisation${organisations > 1 ? 's' : ''}, ${sessions} session${sessions > 1 ? 's' : ''} ouverte${sessions > 1 ? 's' : ''}.`}
        urgent={
          enAttente > 0
            ? {
                libelle: `${enAttente} compte${enAttente > 1 ? 's' : ''} en attente de validation`,
                href: '/admin/comptes',
              }
            : null
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Chiffre valeur={enAttente} libelle="A valider" href="/admin/comptes" alerte={enAttente > 0} />
        <Chiffre valeur={suspendus} libelle="Suspendus" href="/admin/comptes" />
        <Chiffre valeur={organisations} libelle="Organisations" href="/admin/organisations" />
        <Chiffre valeur={sessions} libelle="Sessions ouvertes" href="/admin/acces" />
      </section>

      <Gestes
        enfants={[
          { libelle: 'Comptes', href: '/admin/comptes' },
          { libelle: 'Organisations', href: '/admin/organisations' },
          { libelle: 'Acces et sessions', href: '/admin/acces' },
          { libelle: 'Journal', href: '/audit' },
          ...(superAdmin
            ? [
                { libelle: 'Matrice des droits', href: '/admin/droits' },
                { libelle: 'Etat du systeme', href: '/admin/systeme' },
                { libelle: 'Reseau et serveurs', href: '/admin/reseau' },
              ]
            : []),
        ]}
      />

      <Pile
        titre="Derniers gestes enregistres"
        compte={recents.length}
        vide="Le journal est vide."
        tout={{ libelle: 'Le journal', href: '/audit' }}
      >
        {recents.map((l, i) => (
          <Ligne
            key={`${l.at}-${i}`}
            href="/audit"
            titre={`${l.action} · ${l.entity}`}
            sous={`${l.at.slice(0, 16)}${l.actor_label ? ` · ${l.actor_label}` : ''}`}
          />
        ))}
      </Pile>
    </div>
  );
}
