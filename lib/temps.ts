/**
 * Normalisation des horodatages lus en base.
 *
 * LE DEFAUT QUE CE MODULE CORRIGE, et il faut le lire en entier parce
 * qu'il est invisible :
 *
 * La base porte deux formes d'horodatage. Les colonnes qui ont un defaut
 * `datetime('now')` recoivent « 2026-10-26 04:26:27 » : c'est de l'UTC,
 * mais SANS marqueur de fuseau. Les colonnes ecrites depuis le code
 * recoivent « 2026-10-26T04:26:27.000Z » : de l'UTC, marque.
 *
 * `new Date()` lit la premiere forme comme une heure LOCALE. Sur un poste
 * a Cotonou — UTC+1 — toute date venue d'un defaut SQLite est donc lue
 * avec une heure de retard. Les consequences ne sont pas theoriques :
 *
 *   - un tube preleve il y a trois minutes parait en avoir soixante-trois,
 *     et le laboratoire refuse de rendre le resultat en demandant de
 *     repiquer le patient ;
 *   - un patient arrive il y a dix minutes affiche soixante-dix minutes
 *     d'attente, et la regle d'anciennete le fait remonter devant ceux qui
 *     attendent vraiment ;
 *   - une duree de sejour gagne un jour.
 *
 * A l'ouest de Greenwich, l'erreur s'inverse : un echantillon perime
 * parait frais. C'est la direction qui fait rendre un faux resultat.
 *
 * La regle est donc : TOUTE date qui sort de la base passe par ici avant
 * d'atteindre un module de regles.
 */

/**
 * Rend une date de base sous forme ISO UTC.
 *
 * Accepte les deux formes et n'en casse aucune :
 *   « 2026-10-26 04:26:27 »       -> « 2026-10-26T04:26:27Z »
 *   « 2026-10-26T04:26:27.000Z »  -> inchangee
 *
 * Une valeur vide ou illisible est rendue telle quelle plutot que
 * remplacee par une date de repli : une date inventee se propage en
 * silence, une date illisible se voit.
 */
export function versIso(valeur: string | null | undefined): string | null {
  if (valeur === null || valeur === undefined) return null;
  const v = valeur.trim();
  if (v === '') return null;

  // Forme SQLite : « AAAA-MM-JJ HH:MM:SS », eventuellement avec fractions.
  const sqlite = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/.exec(v);
  if (sqlite) return `${sqlite[1]}T${sqlite[2]}Z`;

  // Forme « AAAA-MM-JJTHH:MM:SS » sans marqueur : meme piege, meme remede.
  const sansZone = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/.exec(v);
  if (sansZone) return `${sansZone[1]}Z`;

  return v;
}

/** Variante pour les colonnes NOT NULL, qui ne peuvent pas rendre null. */
export function versIsoRequis(valeur: string): string {
  return versIso(valeur) ?? valeur;
}

/**
 * Minutes ecoulees entre deux horodatages, quelles que soient leurs formes.
 *
 * Jamais negatif : une date future rend zero. Une attente negative
 * s'afficherait comme « -5 min » sur un ecran de file, et personne ne
 * saurait quoi en faire.
 */
export function minutesEntre(depuis: string | null, jusqua: string | null): number {
  const a = new Date(versIso(depuis) ?? '').getTime();
  const b = new Date(versIso(jusqua) ?? '').getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 60_000));
}
