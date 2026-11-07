import Link from 'next/link';
import Logo from '@/components/Logo';
import { DUREE_ESSAI_JOURS } from '@/lib/essai';

export const metadata = {
  title: "Essayer SmartHealth — sept jours, sur votre poste",
  description:
    "Deux facons d'essayer : une demonstration en ligne immediate, ou une installation complete sur votre poste pendant sept jours, avec votre base locale.",
};

const DEPOT = 'https://github.com/M-TK-innov/SmartHealth';
const DEMONSTRATION = 'https://smart-health-vert.vercel.app/demo';

/**
 * Page d'entree pour un medecin ou un responsable d'etablissement.
 *
 * Elle distingue deux choses qu'on confond toujours : REGARDER et ESSAYER.
 * La demonstration en ligne sert a se faire une idee en dix minutes, sans
 * rien installer et sans rien garder. L'installation locale sert a juger
 * l'outil sur ses propres cas, avec une base qui persiste.
 *
 * Elle dit aussi, avant le telechargement et non apres, ce qui se passe le
 * huitieme jour. Une limite decouverte au moment ou elle tombe est vecue
 * comme un piege, meme quand elle etait annoncee en petits caracteres.
 */
export default function EssaiPage() {
  return (
    <div className="mx-auto max-w-3xl py-10">
      <div className="text-center">
        <Logo className="mx-auto h-16 w-16 text-brand" />
        <h1 className="mt-5 text-2xl font-bold">Essayer SmartHealth</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
          Deux facons, et elles ne servent pas a la meme chose. L&apos;une pour voir, l&apos;autre
          pour juger.
        </p>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="card-pad">
          <h2 className="section-title mb-1">Regarder, tout de suite</h2>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Demonstration en ligne
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Rien a installer. Des comptes d&apos;essai par role, un parcours guide qui vous invite
            a <b>enfreindre les regles</b> — on ne constate pas qu&apos;un lit ne porte qu&apos;un
            patient en regardant un lit.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Les donnees y sont fictives et remises a zero regulierement. Ce que vous y saisissez
            ne sera pas conserve : ce n&apos;est pas une panne, la plateforme n&apos;a pas de
            disque en ligne.
          </p>
          <a className="btn-primary mt-4 inline-flex" href={DEMONSTRATION}>
            Ouvrir la demonstration
          </a>
        </section>

        <section className="card-pad">
          <h2 className="section-title mb-1">Juger, sur vos cas</h2>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Installation sur votre poste &middot; {DUREE_ESSAI_JOURS} jours
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Toutes les fonctionnalites, <b>votre base de donnees sur votre machine</b>, et aucun
            octet qui sort de l&apos;etablissement. La transcription fonctionne sans internet : le
            modele est dans l&apos;installateur.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Le compte des {DUREE_ESSAI_JOURS} jours part de la <b>premiere ouverture</b>, pas du
            telechargement.
          </p>
          <a className="btn-primary mt-4 inline-flex" href={`${DEPOT}/releases/latest`}>
            Telecharger pour Windows
          </a>
        </section>
      </div>

      <section className="card-pad mt-4">
        <h2 className="section-title mb-2">Le huitieme jour, dit avant et non apres</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          La saisie se ferme. <b>La lecture et l&apos;export restent ouverts</b>, et une sauvegarde
          complete de la base est posee automatiquement a cote du fichier de donnees.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          C&apos;est volontaire et ce n&apos;est pas une generosite commerciale : si un dossier
          reel a ete saisi pendant l&apos;essai, le verrouiller reviendrait a le confisquer. Une
          facture impayee se recouvre ; un dossier enferme ne se recupere pas.
        </p>
        <p className="mt-3 rounded-lg bg-warn-soft p-3 text-sm leading-relaxed text-warn">
          <b>Essayez de preference avec des cas fictifs.</b> Si vous saisissez des dossiers reels,
          exportez-les avant la fin — l&apos;export FHIR, HL7 et DHIS2 reste disponible ensuite,
          mais autant ne pas dependre d&apos;une echeance.
        </p>
      </section>

      <section className="card-pad mt-4">
        <h2 className="section-title mb-2">Ce qu&apos;il faut sur le poste</h2>
        <ul className="space-y-1 text-sm text-ink-soft">
          <li>Windows 10 ou 11, 64 bits.</li>
          <li>
            Environ 2 Go d&apos;espace disque : l&apos;installateur embarque le modele de
            transcription pour fonctionner hors ligne des le premier lancement.
          </li>
          <li>
            Aucun Node.js, aucune base a installer a cote : tout est dans l&apos;executable.
          </li>
        </ul>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Pour un serveur partage entre plusieurs postes, voir le{' '}
          <a href={`${DEPOT}/tree/main/docs/installation`} className="underline">
            guide d&apos;installation
          </a>
          .
        </p>
      </section>

      <p className="mt-6 text-center text-sm text-ink-soft">
        Deja installe ?{' '}
        <Link href="/connexion" className="underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
