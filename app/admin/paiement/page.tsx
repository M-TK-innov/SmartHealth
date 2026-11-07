import { requirePermission } from '@/lib/auth/guard';
import { OPERATEURS, type Operateur } from '@/lib/paiement/tentative';
import {
  fournisseur,
  paiementEnLigneDisponible,
  reglagesManquants,
} from '@/lib/paiement/fournisseur';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Paiement en ligne — SmartHealth' };

type Etat = 'ouvert' | 'cles-manquantes' | 'adaptateur-manquant';

function etatDe(o: Operateur): { etat: Etat; manquants: string[] } {
  const manquants = reglagesManquants(o);
  if (manquants.length > 0) return { etat: 'cles-manquantes', manquants };
  if (!fournisseur(o)) return { etat: 'adaptateur-manquant', manquants: [] };
  return { etat: 'ouvert', manquants: [] };
}

const ALLURE: Record<Etat, { libelle: string; classe: string }> = {
  ouvert: { libelle: 'Ouvert', classe: 'bg-brand-soft text-brand' },
  'cles-manquantes': { libelle: 'Cles manquantes', classe: 'bg-warn-soft text-warn' },
  'adaptateur-manquant': { libelle: 'Adaptateur absent', classe: 'bg-line text-ink-soft' },
};

/**
 * Etat du paiement en ligne, par operateur.
 *
 * CET ECRAN NE MODIFIE RIEN, ET C'EST LA REGLE DU PROJET
 *
 * Le guide d'installation la pose en une phrase : un secret modifiable
 * depuis une page web est un secret exposé. Une cle marchande saisie ici
 * traverserait le navigateur, s'ecrirait en base, et apparaitrait dans
 * toute sauvegarde. Elle vit donc dans le fichier d'environnement du
 * serveur, que seul l'administrateur du poste ouvre.
 *
 * Ce que l'ecran apporte malgre tout, et qui manquait : savoir POURQUOI le
 * paiement est ferme, sans lire le code. La difference entre « il manque
 * une cle », qu'un responsable pose en deux minutes, et « l'adaptateur
 * n'est pas ecrit », qui demande du developpement, lui evite d'appeler le
 * mauvais interlocuteur.
 */
export default async function AdminPaiementPage() {
  await requirePermission('server:manage', '/admin/paiement');

  const operateurs = (Object.keys(OPERATEURS) as Operateur[]).map((o) => ({
    operateur: o,
    nom: OPERATEURS[o],
    ...etatDe(o),
  }));
  const enLigne = paiementEnLigneDisponible();

  return (
    <div className="space-y-6">
      <section className="card-pad">
        <h2 className="section-title mb-1">Paiement en ligne</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          {enLigne
            ? 'Au moins un operateur est ouvert. Les patients peuvent regler depuis leur telephone.'
            : "Aucun operateur n'est ouvert. Les patients voient leur reste a charge et la reference de leur facture, et reglent a la caisse."}
        </p>
        <p className="mt-3 rounded-lg bg-paper p-3 text-sm leading-relaxed text-ink-soft">
          <b>Le reglement a la caisse ne depend d aucun de ces reglages.</b> Il fonctionne sans
          operateur, sans compte marchand et sans reseau. Ce qui suit n ajoute qu un second
          chemin.
        </p>
      </section>

      <section className="card">
        <header className="border-b border-line px-5 py-3">
          <h2 className="section-title">Operateurs</h2>
        </header>
        <ul className="divide-y divide-line">
          {operateurs.map((o) => (
            <li key={o.operateur} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{o.nom}</span>
                <span className={`chip ${ALLURE[o.etat].classe}`}>{ALLURE[o.etat].libelle}</span>
              </div>

              {o.etat === 'cles-manquantes' && (
                <div className="mt-2">
                  <p className="text-sm text-ink-soft">
                    A poser dans le fichier d environnement du serveur :
                  </p>
                  <ul className="mt-1 space-y-1">
                    {o.manquants.map((v) => (
                      <li key={v}>
                        <code className="text-xs">{v}=</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {o.etat === 'adaptateur-manquant' && (
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  Les cles sont posees, mais l adaptateur de cet operateur n est pas livre dans
                  cette version. Il s ecrit a partir de sa documentation et s eprouve contre son
                  bac a sable : ce n est pas un reglage, c est du developpement.
                </p>
              )}

              {o.etat === 'ouvert' && (
                <p className="mt-2 text-sm text-ink-soft">
                  Cles posees et adaptateur present. Les patients peuvent choisir cet operateur.
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card-pad">
        <h2 className="section-title mb-1">Pourquoi rien ne se saisit ici</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Une cle marchande saisie dans une page web traverse le navigateur, s ecrit en base de
          donnees, et se retrouve dans chaque sauvegarde. Elle vit donc dans le fichier d
          environnement du serveur, que seul l administrateur du poste ouvre. Cet ecran lit cet
          etat et ne l ecrit pas.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Pour la meme raison, aucune valeur de reglage n est affichee, meme partiellement : cette
          page est consultable par tout compte disposant du droit de configurer les serveurs, et
          un extrait de cle suffit parfois a la reconstituer.
        </p>
      </section>
    </div>
  );
}
