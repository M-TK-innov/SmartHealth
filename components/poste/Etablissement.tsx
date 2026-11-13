import type { AuthContext } from '@/lib/auth/session';
import { organizationFilter } from '@/lib/auth/guard';
import { get } from '@/lib/db';
import { tableauTension } from '@/lib/hopital/flux-store';
import { tableauOccupation } from '@/lib/hopital/store';
import { critiquesNonTransmises } from '@/lib/hopital/plateau-store';
import { rayon } from '@/lib/hopital/pharmacie-store';
import { programmeDuJour } from '@/lib/hopital/bloc-store';
import { Chiffre, Entete, Gestes, Ligne, Pile } from './elements';

/**
 * Le poste de la direction d'etablissement.
 *
 * ELLE NE SOIGNE PAS : elle regarde si la structure tient, et elle a besoin
 * des chiffres qui declenchent une decision — ouvrir une place, rappeler
 * quelqu'un, commander un produit. Les listes nominatives ne sont pas sur cet
 * ecran : elles existent a cote, pour qui a le droit de les ouvrir.
 *
 * CE QUI MONTE EN TETE N'EST PAS LE PLUS GROS CHIFFRE, mais celui qui coute
 * le plus a ignorer : une rupture de stock, un lit hors service, une valeur
 * critique que personne n'a acquittee.
 */
export async function PosteEtablissement({ ctx }: { ctx: AuthContext }) {
  const scoped = organizationFilter(ctx);

  const tension = tableauTension(scoped);
  const unites = tableauOccupation(scoped);
  const stock = rayon(scoped);
  const critiques = critiquesNonTransmises(scoped);
  const bloc = programmeDuJour(scoped);

  const enAttente = tension.reduce((n, t) => n + t.enAttente, 0);
  const partis = tension.reduce((n, t) => n + t.partis, 0);
  const libres = unites.reduce((n, u) => n + u.libres, 0);
  const horsService = unites.reduce((n, u) => n + u.horsService, 0);

  // `niveau` est deja decide par le module de pharmacie : on ne rejuge pas un
  // seuil ici, sinon deux endroits diraient ce qu'est une rupture.
  const ruptures = stock.filter((a) => a.niveau === 'rupture');
  const bas = stock.filter((a) => a.niveau === 'bas');
  const perimes = stock.filter((a) => a.perimees > 0);

  // Le programme vient salle par salle : ce qui interesse la direction est le
  // nombre d'interventions, toutes salles confondues.
  const interventions = bloc.reduce((n, s) => n + s.interventions.length, 0);

  const aValider =
    get<{ n: number }>(
      `SELECT COUNT(*) n FROM user_account
        WHERE status = 'pending' AND (? IS NULL OR organization_id = ?)`,
      [scoped, scoped],
    )?.n ?? 0;

  const urgent =
    critiques.length > 0
      ? {
          libelle: `${critiques.length} valeur${critiques.length > 1 ? 's' : ''} critique${critiques.length > 1 ? 's' : ''} sans acquittement`,
          href: '/hopital/plateau',
        }
      : ruptures.length > 0
        ? {
            libelle: `${ruptures.length} produit${ruptures.length > 1 ? 's' : ''} en rupture a la pharmacie`,
            href: '/hopital/pharmacie',
          }
        : null;

  return (
    <div className="space-y-4">
      <Entete
        titre={ctx.organization?.name ?? 'Votre etablissement'}
        sous={`${enAttente} personne${enAttente > 1 ? 's' : ''} en attente, ${libres} lit${libres > 1 ? 's' : ''} libre${libres > 1 ? 's' : ''}, ${interventions} intervention${interventions > 1 ? 's' : ''} au programme.`}
        urgent={urgent}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Chiffre valeur={enAttente} libelle="En attente" href="/hopital" alerte={enAttente >= 10} />
        <Chiffre valeur={libres} libelle="Lits libres" href="/hopital" alerte={libres === 0} />
        <Chiffre
          valeur={ruptures.length}
          libelle="Produits en rupture"
          href="/hopital/pharmacie"
          alerte={ruptures.length > 0}
        />
        <Chiffre valeur={aValider} libelle="Comptes a valider" href="/admin/comptes" alerte={aValider > 0} />
      </section>

      <Gestes
        enfants={[
          { libelle: 'Rapport mensuel', href: '/interop/rapport-mensuel' },
          { libelle: 'Allegement administratif', href: '/admin/allegement' },
          { libelle: 'Journal d acces', href: '/audit' },
          { libelle: 'Comptes', href: '/admin/comptes' },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Pile
          titre="Ce qui demande une decision"
          compte={ruptures.length + bas.length + perimes.length + (horsService > 0 ? 1 : 0)}
          vide="Rien a arbitrer dans l immediat."
          tout={{ libelle: 'La pharmacie', href: '/hopital/pharmacie' }}
        >
          {ruptures.slice(0, 4).map((a) => (
            <Ligne
              key={a.articleId}
              href="/hopital/pharmacie"
              titre={a.dci}
              sous="Aucune unite servable"
              marque={{ texte: 'rupture', classe: 'bg-danger-soft text-danger' }}
            />
          ))}
          {bas.slice(0, 4).map((a) => (
            <Ligne
              key={`b-${a.articleId}`}
              href="/hopital/pharmacie"
              titre={a.dci}
              sous={`${a.disponible} unites, seuil a ${a.seuilAlerte}`}
              marque={{ texte: 'stock bas', classe: 'bg-warn-soft text-warn' }}
            />
          ))}
          {perimes.slice(0, 4).map((a) => (
            <Ligne
              key={`p-${a.articleId}`}
              href="/hopital/pharmacie"
              titre={a.dci}
              sous={`${a.perimees} unites perimees a retirer`}
              marque={{ texte: 'perime', classe: 'bg-warn-soft text-warn' }}
            />
          ))}
          {horsService > 0 && (
            <Ligne
              href="/hopital"
              titre={`${horsService} lit${horsService > 1 ? 's' : ''} hors service`}
              sous="Hors du parc utilisable tant qu ils ne sont pas remis en etat"
              marque={{ texte: 'parc', classe: 'bg-warn-soft text-warn' }}
            />
          )}
        </Pile>

        <Pile
          titre="Le bloc aujourd hui"
          compte={interventions}
          vide="Aucune intervention programmee."
          tout={{ libelle: 'Le bloc', href: '/hopital/bloc' }}
        >
          {bloc
            .filter((s) => s.interventions.length > 0)
            .map((s) => (
              <Ligne
                key={s.salle.id}
                href="/hopital/bloc"
                titre={s.salle.nom}
                sous={`${s.interventions.length} intervention${s.interventions.length > 1 ? 's' : ''} · ${Math.round(s.minutesProgrammees / 60)} h programmees`}
              />
            ))}
        </Pile>
      </div>

      {partis > 0 && (
        <section className="card-pad border-l-4 border-warn">
          <h2 className="section-title">
            {partis} personne{partis > 1 ? 's' : ''} partie{partis > 1 ? 's' : ''} sans avoir ete vue
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Compte du jour, tous postes confondus. C est le chiffre qui dit le mieux si
            l etablissement tient le choc, et c est aussi celui qu aucun rapport ne remonte
            spontanement.
          </p>
        </section>
      )}
    </div>
  );
}
