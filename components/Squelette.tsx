/**
 * Squelettes d'attente.
 *
 * POURQUOI, ET POURQUOI PAS UN ROND QUI TOURNE
 *
 * Sans eux, cliquer sur un lien ne change RIEN a l'ecran tant que le serveur
 * n'a pas fini de rendre la page : l'ancienne reste affichee, figee. Mesure
 * sur le deploiement en ligne : 326 ms de mediane a chaud, plusieurs secondes
 * a froid. Pendant tout ce temps, l'utilisateur ne sait pas si son geste a
 * ete pris en compte, et il retape.
 *
 * Un squelette a la BONNE FORME vaut mieux qu'un rond qui tourne pour deux
 * raisons : il annonce ce qui arrive, et la page ne saute pas quand les
 * donnees le remplacent.
 *
 * CE QU'IL NE DOIT JAMAIS FAIRE
 *
 * Afficher du contenu plausible. Dans un dossier medical, un faux nombre
 * entrevu une demi-seconde peut etre lu, retenu, et agir. Ces blocs sont
 * donc gris et vides — ils dessinent une place, jamais une valeur.
 *
 * Ils sont masques aux lecteurs d'ecran : l'attente se dit une fois, par la
 * region vivante de `Attente`, et non par trente blocs sans nom.
 */

/** Un bloc gris, a la place d'un futur texte. */
export function Bloc({ className = '' }: { className?: string }) {
  return <span className={`block rounded bg-line/70 ${className}`} />;
}

/** Une ligne de liste : rond d'avatar, deux lignes, une action a droite. */
export function LigneListe() {
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <Bloc className="h-9 w-9 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Bloc className="h-3.5 w-48 max-w-full" />
        <Bloc className="h-3 w-64 max-w-full" />
      </div>
      <Bloc className="h-8 w-24 shrink-0 rounded-lg" />
    </li>
  );
}

/** Une carte avec en-tete et quelques lignes. */
export function CarteListe({ lignes = 6, titre = 'w-40' }: { lignes?: number; titre?: string }) {
  return (
    <section className="card">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <Bloc className={`h-5 ${titre}`} />
        <Bloc className="h-8 w-56 max-w-[40%] rounded-lg" />
      </header>
      <ul className="divide-y divide-line">
        {Array.from({ length: lignes }, (_, i) => (
          <LigneListe key={i} />
        ))}
      </ul>
    </section>
  );
}

/** Un panneau lateral : titre et quelques champs. */
export function Panneau({ champs = 3 }: { champs?: number }) {
  return (
    <section className="card-pad space-y-4">
      <Bloc className="h-4 w-32" />
      {Array.from({ length: champs }, (_, i) => (
        <div key={i} className="space-y-2">
          <Bloc className="h-3 w-24" />
          <Bloc className="h-9 w-full rounded-lg" />
        </div>
      ))}
      <Bloc className="h-9 w-full rounded-lg" />
    </section>
  );
}

/** Une rangee de compteurs, comme sur le tableau de bord. */
export function Compteurs({ n = 4 }: { n?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card-pad space-y-3">
          <Bloc className="h-7 w-12" />
          <Bloc className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

/**
 * Enveloppe commune.
 *
 * `aria-busy` et une region vivante disent l'attente UNE fois. Sans cela, un
 * lecteur d'ecran enumererait des dizaines de blocs anonymes, ce qui est pire
 * que le silence.
 *
 * L'animation est retiree pour qui demande moins de mouvement — une
 * pulsation plein ecran declenche des migraines, et ce reglage existe pour
 * cela.
 */
export function Attente({ quoi, children }: { quoi: string; children: React.ReactNode }) {
  return (
    <div aria-busy="true" className="motion-reduce:[&_*]:animate-none">
      <p className="sr-only" role="status">
        {quoi}
      </p>
      <div aria-hidden="true" className="animate-pulse space-y-6">
        {children}
      </div>
    </div>
  );
}
