import Link from 'next/link';

/**
 * Les pieces communes aux postes de travail.
 *
 * CE QU'UN POSTE DE TRAVAIL N'EST PAS : un tableau de bord. Un tableau de bord
 * repond a « comment va l'etablissement » ; un poste de travail repond a
 * « qu'est-ce que je fais maintenant ». La difference se voit a ce qui occupe
 * le haut de l'ecran : des compteurs d'un cote, une liste de gens a voir de
 * l'autre.
 *
 * D'ou la hierarchie imposee ici : ce qui ATTEND UN GESTE vient en premier,
 * nomme et cliquable. Les chiffres viennent apres, et seulement ceux sur
 * lesquels la personne peut agir dans sa journee.
 */

/** Ce qui ouvre un poste : qui je suis, et ce qui m'attend a l'instant. */
export function Entete({
  titre,
  sous,
  urgent,
}: {
  titre: string;
  sous: string;
  /** Ce qui ne peut pas attendre. Absent la plupart du temps, et c'est bien. */
  urgent?: { libelle: string; href: string } | null;
}) {
  return (
    <header className="card-pad">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{titre}</h1>
          <p className="mt-1 text-sm text-ink-soft">{sous}</p>
        </div>
      </div>
      {urgent && (
        <Link
          href={urgent.href}
          className="mt-3 flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger hover:underline"
        >
          {urgent.libelle}
        </Link>
      )}
    </header>
  );
}

/**
 * Une pile de choses a faire.
 *
 * Le compte figure dans le titre plutot qu'a cote : « A signer (3) » se lit
 * d'un coup d'oeil, la ou un chiffre pose ailleurs oblige a faire le lien.
 * Une pile vide le dit en toutes lettres, parce qu'une liste vide sans phrase
 * ressemble a un chargement qui n'a pas abouti.
 */
export function Pile({
  titre,
  vide,
  tout,
  children,
  compte,
}: {
  titre: string;
  vide: string;
  tout?: { libelle: string; href: string };
  compte: number;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="section-title">
          {titre}
          {compte > 0 && <span className="ml-2 text-ink-soft">({compte})</span>}
        </h2>
        {tout && (
          <Link href={tout.href} className="text-xs text-brand-dark hover:underline">
            {tout.libelle}
          </Link>
        )}
      </header>
      {compte === 0 ? (
        <p className="p-5 text-sm text-ink-soft">{vide}</p>
      ) : (
        <ul className="divide-y divide-line">{children}</ul>
      )}
    </section>
  );
}

/** Une ligne cliquable : ce qu'on voit, et ou l'on va. */
export function Ligne({
  href,
  titre,
  sous,
  marque,
}: {
  href: string;
  titre: string;
  sous?: string | null;
  marque?: { texte: string; classe?: string } | null;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-5 py-3 hover:bg-paper">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{titre}</div>
          {sous && <div className="truncate text-xs text-ink-soft">{sous}</div>}
        </div>
        {marque && <span className={`chip shrink-0 ${marque.classe ?? ''}`}>{marque.texte}</span>}
      </Link>
    </li>
  );
}

/**
 * Un chiffre, et ou il mene.
 *
 * TOUJOURS CLIQUABLE. Un compteur qui ne mene nulle part laisse la personne
 * devant un nombre sans moyen d'agir dessus, et elle ira le chercher a la
 * main dans un menu.
 */
export function Chiffre({
  valeur,
  libelle,
  href,
  alerte,
}: {
  valeur: number | string;
  libelle: string;
  href: string;
  alerte?: boolean;
}) {
  return (
    <Link href={href} className={`card-pad block hover:bg-paper ${alerte ? 'border-l-4 border-danger' : ''}`}>
      <div className={`text-3xl font-bold ${alerte ? 'text-danger' : 'text-brand-dark'}`}>{valeur}</div>
      <div className="mt-1 text-sm font-medium">{libelle}</div>
    </Link>
  );
}

/** Les gestes du poste, a portee de main plutot qu'au fond d'un menu. */
export function Gestes({ enfants }: { enfants: { libelle: string; href: string }[] }) {
  if (enfants.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {enfants.map((g) => (
        <Link key={g.href} href={g.href} className="btn-ghost btn-sm">
          {g.libelle}
        </Link>
      ))}
    </div>
  );
}

/** « 2026-11-13 09:30:00 » devient « 09:30 ». */
export const heure = (iso: string) => iso.slice(11, 16);

/** Le jour civil, pour les requetes qui en prennent un. */
export const aujourdhui = () => new Date().toISOString().slice(0, 10);
