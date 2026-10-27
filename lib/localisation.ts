/**
 * Localisation de l'etablissement : son fuseau, et l'heure qu'il est chez lui.
 *
 * LA PLATEFORME SE LOCALISE SEULE. Personne ne saisit un fuseau a
 * l'installation : le serveur tourne dans l'etablissement, donc la machine
 * sait ou elle est. Le reglage existe pour le cas inverse — un serveur
 * mutualise, ou une demonstration servie depuis un centre de donnees
 * lointain — et il l'emporte quand il est pose.
 *
 * UN SEUL FUSEAU POUR TOUT L'ETABLISSEMENT, et c'est la regle qui compte.
 *
 * Il serait tentant de prendre le fuseau du NAVIGATEUR : il est encore
 * plus automatique, et il suit l'agent en deplacement. Ce serait une
 * erreur. Deux agents du meme service verraient alors deux journees
 * differentes — l'un verrait la file d'hier, l'autre celle d'aujourd'hui,
 * et le programme operatoire changerait de jour selon le poste depuis
 * lequel on le regarde. Un etablissement a UNE journee.
 *
 * Le fuseau du poste sert donc a autre chose : a REMARQUER un ecart. Un
 * ordinateur regle sur un autre fuseau affiche des heures fausses dans
 * toute l'interface, et le soignant n'a aucun moyen de s'en apercevoir —
 * sauf si on le lui dit.
 *
 * Module PUR : il decide, il ne lit ni la base ni l'horloge systeme.
 */

export type SourceFuseau = 'configure' | 'detecte' | 'defaut';

export interface Localisation {
  fuseau: string;
  source: SourceFuseau;
}

/** Fuseau de repli quand rien n'est connu. Jamais devine. */
export const FUSEAU_DEFAUT = 'UTC';

/**
 * Ce fuseau est-il connu du moteur de dates ?
 *
 * On ne retient jamais un fuseau non reconnu : toutes les dates de
 * l'application seraient alors calculees sur un repli silencieux, et
 * l'etablissement croirait tourner a son heure.
 */
export function fuseauValide(fuseau: string | null | undefined): boolean {
  if (!fuseau || typeof fuseau !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: fuseau });
    return true;
  } catch {
    return false;
  }
}

/**
 * Le fuseau de l'etablissement, et d'ou il vient.
 *
 * L'ordre : ce qu'un responsable a pose, puis ce que la machine a
 * detecte, puis UTC. Chaque candidat est VALIDE avant d'etre retenu — un
 * reglage mal saisi doit se voir dans la source rendue, pas se substituer
 * en silence au fuseau detecte.
 */
export function resoudreFuseau(candidats: {
  configure?: string | null;
  detecte?: string | null;
}): Localisation {
  if (fuseauValide(candidats.configure)) {
    return { fuseau: candidats.configure as string, source: 'configure' };
  }
  if (fuseauValide(candidats.detecte)) {
    return { fuseau: candidats.detecte as string, source: 'detecte' };
  }
  return { fuseau: FUSEAU_DEFAUT, source: 'defaut' };
}

/**
 * Ecart, en minutes, entre deux fuseaux a un instant donne.
 *
 * A un INSTANT donne, parce que l'ecart entre deux fuseaux n'est pas
 * constant : l'heure d'ete le fait varier dans l'annee. Un ecart calcule
 * une fois pour toutes serait faux la moitie de l'annee pour la moitie du
 * monde.
 */
export function ecartMinutes(a: string, b: string, instant: Date = new Date()): number {
  if (!fuseauValide(a) || !fuseauValide(b)) return 0;
  return Math.round((decalage(instant, a) - decalage(instant, b)) / 60_000);
}

/** Decalage d'un fuseau par rapport a UTC, en millisecondes. */
function decalage(instant: Date, fuseau: string): number {
  // On relit l'instant tel que ce fuseau l'affiche, puis on le reconstruit
  // comme s'il etait en UTC : la difference est le decalage. Passer par
  // une table de decalages serait faux des le prochain changement d'heure.
  const vu = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuseau,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const p: Record<string, string> = {};
  for (const { type, value } of vu) p[type] = value;

  const commeUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    // Certains moteurs rendent « 24 » pour minuit ; on le ramene a zero.
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return commeUtc - instant.getTime();
}

export interface RemarqueFuseau {
  niveau: 'remarque' | 'limitant';
  message: string;
  remede: string;
  ecartMinutes: number;
}

/**
 * Le poste est-il a l'heure de l'etablissement ?
 *
 * On ne corrige rien et on ne bascule rien : on le DIT. Un ordinateur
 * regle sur un autre fuseau affiche des heures fausses partout — l'heure
 * d'une admission, celle d'un prelevement, celle d'une incision — et le
 * soignant n'a aucun moyen de s'en apercevoir par lui-meme.
 *
 * Au-dela d'une heure d'ecart, le constat passe de « remarque » a
 * « limitant » : une demi-heure se repere a l'oeil sur une journee de
 * travail, deux heures ne se reperent pas, et c'est alors la chronologie
 * du dossier qui devient trompeuse.
 */
export function remarquerEcart(
  etablissement: string,
  poste: string | null | undefined,
  instant: Date = new Date(),
): RemarqueFuseau | null {
  // Pas de garde sur la validite des deux fuseaux : ecartMinutes rend
  // zero des que l'un d'eux lui est inconnu, et un ecart nul ne declenche
  // rien. Une garde de plus ici ne changerait aucun comportement — elle
  // donnerait seulement l'impression d'en proteger un.
  const ecart = ecartMinutes(poste ?? '', etablissement, instant);
  if (ecart === 0) return null;

  const sens = ecart > 0 ? 'en avance' : 'en retard';
  const heures = Math.abs(ecart) / 60;
  const duree =
    Math.abs(ecart) % 60 === 0
      ? `${heures} h`
      : `${Math.floor(Math.abs(ecart) / 60)} h ${Math.abs(ecart) % 60} min`;

  return {
    niveau: Math.abs(ecart) > 60 ? 'limitant' : 'remarque',
    message: `Ce poste est regle sur ${poste}, ${duree} ${sens} de l etablissement (${etablissement}).`,
    remede:
      'Regler le fuseau du poste sur celui de l etablissement. En attendant, les heures ' +
      'affichees ici ne sont pas celles du service.',
    ecartMinutes: ecart,
  };
}

/**
 * Une date, telle qu'on la lit DANS l'etablissement.
 *
 * Toute l'interface passe par ici. Sans cela, chaque ecran formate a
 * l'heure du navigateur : un poste mal regle afficherait des heures
 * d'admission, de prelevement et d'incision decalees, tout en partageant
 * la meme journee que les autres. Les dates seraient incoherentes entre
 * elles sans que rien ne cloche a l'ecran.
 */
export function formaterInstant(
  valeur: string | Date | null | undefined,
  fuseau: string,
  style: 'date' | 'heure' | 'complet' = 'complet',
): string {
  if (!valeur) return '';
  const d = typeof valeur === 'string' ? new Date(normaliser(valeur)) : valeur;
  if (!Number.isFinite(d.getTime())) return '';

  const zone = fuseauValide(fuseau) ? fuseau : FUSEAU_DEFAUT;
  const options: Intl.DateTimeFormatOptions = { timeZone: zone, hour12: false };

  if (style !== 'heure') {
    options.day = '2-digit';
    options.month = '2-digit';
    options.year = 'numeric';
  }
  if (style !== 'date') {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }

  return new Intl.DateTimeFormat('fr-FR', options).format(d);
}

/** Les deux formes d'horodatage que porte la base designent de l'UTC. */
function normaliser(valeur: string): string {
  const v = valeur.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(v)) return `${v.replace(' ', 'T')}Z`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(v)) return `${v}Z`;
  return v;
}
