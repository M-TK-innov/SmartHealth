/**
 * Horodatages relatifs du jeu de demonstration.
 *
 * LE PROBLEME : un vidage SQL fige les dates a l'instant ou il a ete
 * produit. Une demonstration consultee trois semaines plus tard
 * afficherait « ce patient attend depuis 31 680 minutes », une
 * hospitalisation de vingt-deux jours et un programme operatoire date du
 * mois dernier. Tout ce que l'application sait mesurer deviendrait
 * absurde, et c'est precisement ce qu'une demonstration doit montrer.
 *
 * On remplace donc chaque horodatage par un JETON relatif au moment de la
 * generation, et on le resout au chargement. La demonstration est donc
 * toujours « aujourd'hui », quel que soit le jour ou on l'ouvre.
 *
 * Les dates qui ne doivent PAS bouger — une date de naissance — sont
 * laissees telles quelles : un patient ne rajeunit pas parce qu'on
 * redemarre le serveur.
 *
 * Module PUR.
 */

/**
 * Forme d'un jeton : {{D-35}}, {{T+90}} ou {{I+90}}.
 *
 * La lettre porte la FORME A RESTITUER, et pas seulement l'unite :
 *   D — date seule, « AAAA-MM-JJ »
 *   T — horodatage SQLite, « AAAA-MM-JJ HH:MM:SS »
 *   I — horodatage ISO, « AAAA-MM-JJTHH:MM:SS.sssZ »
 *
 * Sans cette distinction, un vidage rendait en forme SQLite ce que la
 * colonne contenait en ISO. Les deux designent le meme instant, mais ne
 * se comparent pas comme des chaines : l'espace precede le « T » dans
 * l'ordre lexical, et une requete de plage ne trouvait plus rien. Le
 * programme du bloc s'affichait vide.
 */
const JETON = /\{\{([DTI])([+-]\d+)\}\}/g;

/**
 * Colonnes dont la valeur est une date absolue, a ne jamais decaler.
 *
 * Liste explicite plutot qu'heuristique : se tromper dans ce sens
 * vieillirait ou rajeunirait un patient, ce qui change une posologie
 * pediatrique.
 */
export const COLONNES_FIGEES = new Set(['birth_date', 'death_date']);

/**
 * Au-dela de cet ecart, une date n'est pas « relative a la demonstration »
 * mais une donnee en propre, et reste intacte.
 */
export const HORIZON_JOURS = 1000;

const MINUTE = 60_000;
const JOUR = 86_400_000;

/** Fabrique un jeton pour une date, relativement a la reference. */
export function enJeton(valeur: string, reference: Date, colonne: string): string {
  if (COLONNES_FIGEES.has(colonne)) return valeur;

  const dateSeule = /^\d{4}-\d{2}-\d{2}$/.test(valeur);
  const instant = analyser(valeur);
  if (instant === null) return valeur;

  const ecartJours = Math.abs(instant - reference.getTime()) / JOUR;
  if (ecartJours > HORIZON_JOURS) return valeur;

  if (dateSeule) {
    // Une date sans heure se compte en jours : « perime dans 21 jours »
    // doit rester « dans 21 jours », pas « dans 20 jours et 7 heures ».
    const jours = Math.round((instant - minuit(reference)) / JOUR);
    return `{{D${signe(jours)}}}`;
  }

  const minutes = signe(Math.round((instant - reference.getTime()) / MINUTE));
  // On restitue la forme d'origine : ISO si la valeur etait en ISO.
  return /[Tt]\d{2}:/.test(valeur) ? `{{I${minutes}}}` : `{{T${minutes}}}`;
}

/**
 * Resout les jetons d'un vidage SQL a l'instant du chargement.
 *
 * La forme rendue suit celle d'origine : un jeton de jours rend une date
 * seule, un jeton de minutes rend un horodatage SQLite. Rendre partout de
 * l'ISO casserait les colonnes que le reste de l'application lit comme des
 * dates.
 */
export function resoudre(sql: string, maintenant: Date = new Date()): string {
  return sql.replace(JETON, (_tout, unite: string, decalage: string) => {
    const n = Number(decalage);
    if (unite === 'D') {
      const d = new Date(minuit(maintenant) + n * JOUR);
      return d.toISOString().slice(0, 10);
    }
    const d = new Date(maintenant.getTime() + n * MINUTE);
    if (unite === 'I') return d.toISOString();
    // Forme SQLite « AAAA-MM-JJ HH:MM:SS », celle que produit
    // datetime('now') : le reste de l'application la normalise deja.
    return d.toISOString().replace('T', ' ').slice(0, 19);
  });
}

function signe(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

/** Minuit UTC du jour d'une date. */
function minuit(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Analyse les deux formes que porte la base, et RIEN d'autre.
 *
 * Laisser `new Date()` deviner transformerait « 500 » ou « BJ-LIT-CSC-001 »
 * en dates sur certains moteurs, et le vidage se remplirait de jetons a la
 * place de codes d'etablissement.
 */
function analyser(valeur: string): number | null {
  // La forme ne suffit pas : « 2026-13-45 » la respecte et ne designe
  // aucun instant. Sans ce controle, il devenait un jeton {{DNaN}}, que
  // la resolution aurait recrache tel quel dans le SQL.
  if (/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
    return fini(Date.parse(`${valeur}T00:00:00Z`));
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(valeur)) {
    const iso = valeur.replace(' ', 'T');
    return fini(Date.parse(/[Zz]|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`));
  }
  return null;
}

const fini = (n: number): number | null => (Number.isFinite(n) ? n : null);
