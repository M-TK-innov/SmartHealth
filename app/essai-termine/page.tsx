import Link from 'next/link';
import Logo from '@/components/Logo';
import { MODE_ESSAI, etatEssaiCourant, sauvegardeEcheance } from '@/lib/essai-store';
import { DUREE_ESSAI_JOURS, PERMISSIONS_APRES_ECHEANCE } from '@/lib/essai';
import { PERMISSIONS } from '@/lib/auth/roles';

export const metadata = { title: "Periode d'essai — SmartHealth" };

/**
 * Ce que devient l'installation a l'echeance.
 *
 * La page existe pour UNE raison : un verrou qui ne dit pas ce qu'il laisse
 * ouvert est vecu comme une perte de donnees. On nomme donc, une par une, les
 * actions qui restent — et l'on dit ou se trouve la sauvegarde.
 */
export default async function EssaiTerminePage({
  searchParams,
}: {
  searchParams: Promise<{ droit?: string }>;
}) {
  const { droit } = await searchParams;
  const refusees = (droit ?? '').split(',').filter(Boolean);
  const etat = MODE_ESSAI ? etatEssaiCourant() : null;
  const sauvegarde = sauvegardeEcheance();
  const clos = etat?.phase === 'expire';

  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="text-center">
        <Logo className={`mx-auto h-16 w-16 ${clos ? 'text-danger' : 'text-brand'}`} />
        <h1 className="mt-5 text-xl font-bold">
          {clos ? "La periode d'essai est terminee" : "Periode d'essai en cours"}
        </h1>
        {etat && (
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {clos
              ? `Ouverte le ${etat.jourDebut}, close depuis le ${etat.jourFin}.`
              : `Ouverte le ${etat.jourDebut}. Elle court jusqu'au ${etat.jourFin} inclus, soit ${etat.joursRestants} jour${etat.joursRestants > 1 ? 's' : ''}.`}
          </p>
        )}
        {!MODE_ESSAI && (
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Cette installation n&apos;est pas une version d&apos;essai. Aucune limite de duree ne
            s&apos;y applique.
          </p>
        )}
      </div>

      {refusees.length > 0 && (
        <p className="mt-6 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          L&apos;action demandee modifie des donnees :{' '}
          {refusees.map((d) => PERMISSIONS[d as keyof typeof PERMISSIONS] ?? d).join(', ')}.
        </p>
      )}

      <section className="card-pad mt-6">
        <h2 className="section-title mb-2">Rien n&apos;est enferme</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          L&apos;essai ferme la saisie, jamais la lecture. Si un dossier reel a ete saisi pendant
          ces {DUREE_ESSAI_JOURS} jours, il reste consultable et recuperable — une facture impayee
          se recouvre, un dossier enferme ne se recupere pas.
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {PERMISSIONS_APRES_ECHEANCE.map((p) => (
            <li key={p} className="flex gap-2">
              <span aria-hidden="true" className="text-brand">
                &#8212;
              </span>
              <span>{PERMISSIONS[p]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card-pad mt-4">
        <h2 className="section-title mb-2">La sauvegarde d&apos;echeance</h2>
        {sauvegarde?.chemin ? (
          <p className="text-sm leading-relaxed text-ink-soft">
            Une copie de la base a ete posee le {sauvegarde.jour} :{' '}
            <code className="text-xs">{sauvegarde.chemin}</code>. Elle est complete et s&apos;ouvre
            avec n&apos;importe quel outil SQLite.
          </p>
        ) : sauvegarde ? (
          <p className="text-sm leading-relaxed text-danger">
            La sauvegarde automatique du {sauvegarde.jour} <b>n&apos;a pas pu etre ecrite</b> —
            disque plein ou dossier non accessible en ecriture. Vos donnees ne sont pas perdues
            pour autant : exportez-les depuis l&apos;application, ou copiez le fichier de base
            apres avoir ferme SmartHealth.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-ink-soft">
            Elle sera posee automatiquement a l&apos;echeance, a cote du fichier de base, dans le
            dossier <code className="text-xs">sauvegardes</code>.
          </p>
        )}
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/patients" className="btn-primary">
          Consulter les dossiers
        </Link>
        <Link href="/interop" className="btn-ghost">
          Exporter (FHIR, HL7, DHIS2)
        </Link>
      </div>
    </div>
  );
}
