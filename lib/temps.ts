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

// --------------------------------------------------------------- jour civil

/**
 * Le jour tel que le vit l'etablissement, et non tel que le compte UTC.
 *
 * LE DEFAUT QUE CECI CORRIGE : « aujourd'hui » etait calcule sur minuit
 * UTC. Une file d'attente, un programme operatoire ou un rayon de
 * pharmacie se comptent pourtant sur la journee du service, qui commence
 * a minuit CHEZ LUI.
 *
 * A Cotonou — UTC+1, le terrain vise — la journee basculait donc a une
 * heure du matin : entre minuit et une heure, les ecrans montraient encore
 * les patients de la veille. A Lima — UTC-5 — la bascule tombe a dix-neuf
 * heures, en plein programme operatoire du soir : les interventions de la
 * fin de journee se rangeaient sous le lendemain, et le programme du jour
 * paraissait vide a ceux qui y travaillaient encore.
 *
 * Le fuseau est celui de la MACHINE par defaut, parce qu'un serveur de
 * dispensaire tourne dans le dispensaire. Il se force par reglage pour le
 * cas inverse — une demonstration servie depuis un centre de donnees
 * lointain, ou un serveur mutualise.
 */
export function jourCivil(instant: Date | string = new Date(), fuseau?: string): string {
  const d = typeof instant === 'string' ? new Date(versIso(instant) ?? instant) : instant;
  if (!Number.isFinite(d.getTime())) return '';

  // « en-CA » rend AAAA-MM-JJ, la forme que porte la base. Construire la
  // date a la main a partir des composantes locales serait faux des que le
  // serveur et l'etablissement ne sont pas dans le meme fuseau.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fuseau || fuseauMachine(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Cet horodatage tombe-t-il dans la journee civile indiquee ? */
export function dansLeJour(horodatage: string | null, jour: string, fuseau?: string): boolean {
  const iso = versIso(horodatage);
  if (!iso) return false;
  return jourCivil(iso, fuseau) === jour;
}

/** Le jour civil precedent, pour border une fenetre de requete. */
export function jourPrecedent(jour: string): string {
  return decaler(jour, -1);
}

/** Le jour civil suivant. */
export function jourSuivant(jour: string): string {
  return decaler(jour, 1);
}

function decaler(jour: string, jours: number): string {
  // Lecture et arithmetique en UTC explicite, de bout en bout : le fuseau
  // de la machine n'entre jamais dans le calcul, et le resultat est le
  // meme partout. Une premiere version decalait depuis midi « par
  // securite » — une precaution contre un danger qui n'existait pas, le
  // « Z » suffisant a l'ecarter.
  const d = new Date(`${jour}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return jour;
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

/**
 * Fuseau de la machine, ou UTC si l'environnement n'en declare aucun.
 *
 * Seul endroit impur de ce module, isole a dessein : toutes les fonctions
 * ci-dessus acceptent un fuseau explicite, et les tests le passent.
 */
export function fuseauMachine(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
