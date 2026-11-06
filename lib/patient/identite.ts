/**
 * Identifiant de connexion d'un patient : telephone ou NPI.
 *
 * POURQUOI UN MODULE A PART, ET POURQUOI IL EST PUR
 *
 * L'enrolement et la connexion doivent normaliser EXACTEMENT de la meme
 * facon. Sinon un patient inscrit au guichet avec « 01 97 07 39 00 » ne se
 * reconnaitra jamais en tapant « +229 0197073900 », et personne ne saura
 * pourquoi : la base contiendra bien son compte, et la recherche ne le
 * trouvera pas. C'est le defaut classique de ces systemes, et il se repare
 * en n'ayant qu'un seul endroit ou la regle existe.
 *
 * L'AMBIGUITE EST ASSUMEE, PAS DEVINEE
 *
 * Depuis la renumerotation, un numero beninois tient en dix chiffres. Le NPI
 * aussi. « 0197073900 » peut donc etre l'un ou l'autre, et aucune heuristique
 * ne tranche honnetement. Le type est donc EXIGE de l'appelant ; `deviner`
 * existe pour aider une saisie, et repond « ambigu » quand il l'est — jamais
 * au hasard. Rattacher un dossier medical au mauvais identifiant n'est pas
 * une erreur d'ergonomie.
 *
 * CE QUI N'EST PAS VERIFIE, ET QUI EST DIT
 *
 * Le NPI est accepte sur sa seule forme — dix chiffres. Nous n'avons pas la
 * specification de sa cle de controle, et inventer une verification qui
 * rejetterait des numeros valides serait pire que de n'en faire aucune.
 */

export type TypeIdentifiant = 'telephone' | 'npi';

export type Resolution =
  | { ok: true; type: TypeIdentifiant; valeur: string }
  | { ok: false; motif: string };

/** Indicatif du Benin. */
const INDICATIF = '229';

/** Longueur d'un numero national depuis la renumerotation de 2024. */
const LONGUEUR_NATIONALE = 10;

/** Longueur des anciens numeros, auxquels la renumerotation a prefixe « 01 ». */
const LONGUEUR_ANCIENNE = 8;

const LONGUEUR_NPI = 10;

/** Ne garde que les chiffres. Espaces, points, tirets et parentheses sautent. */
function chiffres(brut: string): string {
  return brut.replace(/\D+/g, '');
}

/**
 * Normalise un numero de telephone beninois en forme internationale.
 *
 * Accepte, et ramene tous au meme resultat :
 *   +229 01 97 07 39 00 · 0022901..., 229 01... · 0197073900 · 97073900
 *
 * Le dernier cas applique la renumerotation : les anciens numeros a huit
 * chiffres ont recu le prefixe « 01 ». On l'applique plutot que de refuser,
 * parce que c'est le numero que les gens connaissent encore par coeur et
 * qu'ils donneront au guichet.
 */
export function normaliserTelephone(brut: string): Resolution {
  const n = chiffres(brut ?? '');
  if (!n) return { ok: false, motif: 'Numero vide. Attendu : dix chiffres, par exemple 01 97 07 39 00.' };

  let national: string;

  if (n.startsWith('00' + INDICATIF)) national = n.slice(2 + INDICATIF.length);
  else if (n.startsWith(INDICATIF) && n.length === INDICATIF.length + LONGUEUR_NATIONALE) {
    national = n.slice(INDICATIF.length);
  } else national = n;

  if (national.length === LONGUEUR_ANCIENNE) national = '01' + national;

  if (national.length !== LONGUEUR_NATIONALE) {
    return {
      ok: false,
      motif: `Numero a ${national.length} chiffres. Attendu : dix, par exemple 01 97 07 39 00.`,
    };
  }

  return { ok: true, type: 'telephone', valeur: `+${INDICATIF}${national}` };
}

/** Normalise un NPI : dix chiffres, sans espaces. */
export function normaliserNpi(brut: string): Resolution {
  const n = chiffres(brut ?? '');
  if (!n) return { ok: false, motif: 'NPI vide. Attendu : dix chiffres.' };
  if (n.length !== LONGUEUR_NPI) {
    return { ok: false, motif: `NPI a ${n.length} chiffres. Attendu : dix.` };
  }
  return { ok: true, type: 'npi', valeur: n };
}

/** Normalise selon le type que l'appelant declare. */
export function normaliser(type: TypeIdentifiant, brut: string): Resolution {
  return type === 'telephone' ? normaliserTelephone(brut) : normaliserNpi(brut);
}

/**
 * Aide a la saisie : propose un type, ou avoue ne pas savoir.
 *
 * Un « + », un indicatif ou huit chiffres designent un telephone sans
 * hesitation possible. Dix chiffres nus ne designent rien : les deux formes
 * se ressemblent, et c'est a l'utilisateur de dire laquelle il a tapee.
 */
export function deviner(brut: string): TypeIdentifiant | 'ambigu' | 'inconnu' {
  const texte = (brut ?? '').trim();
  const n = chiffres(texte);
  if (!n) return 'inconnu';
  if (texte.startsWith('+') || n.startsWith('00' + INDICATIF)) return 'telephone';
  if (n.startsWith(INDICATIF) && n.length === INDICATIF.length + LONGUEUR_NATIONALE) return 'telephone';
  if (n.length === LONGUEUR_ANCIENNE) return 'telephone';
  if (n.length === LONGUEUR_NATIONALE) return 'ambigu';
  return 'inconnu';
}

/**
 * Forme lisible d'un numero, pour l'afficher sans le rendre imprononcable.
 *
 * Un numero colle ne se relit pas au telephone, et c'est souvent ainsi qu'on
 * le dicte a un patient.
 */
export function formaterTelephone(valeur: string): string {
  const n = chiffres(valeur);
  if (!n.startsWith(INDICATIF) || n.length !== INDICATIF.length + LONGUEUR_NATIONALE) return valeur;
  const national = n.slice(INDICATIF.length);
  return `+${INDICATIF} ` + (national.match(/.{1,2}/g) ?? []).join(' ');
}

// ------------------------------------------------------ code d enrolement

/**
 * Alphabet du code remis au guichet.
 *
 * Sans O, 0, I, 1, L ni S : ce code est lu a voix haute, recopie sur un bout
 * de papier, puis tape sur un clavier de telephone. Chacune de ces lettres
 * se confond avec un chiffre, et une confusion coute un retour au guichet.
 */
export const ALPHABET_CODE = 'ABCDEFGHJKMNPQRTUVWXYZ23456789';

export const LONGUEUR_CODE = 8;

/** Met un code saisi sous sa forme de comparaison. */
export function normaliserCode(brut: string): string {
  return (brut ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Un code est-il encore utilisable ?
 *
 * L'instant est un parametre : la peremption se teste comme elle s'execute.
 * Un code deja consomme ne vaut plus rien, meme avant sa date — sinon un
 * code lu par-dessus l'epaule resservirait.
 */
export function codeUtilisable(
  etat: { expireLe: string; consommeLe: string | null },
  instant: Date,
): boolean {
  if (etat.consommeLe) return false;
  const fin = new Date(etat.expireLe.replace(' ', 'T') + (etat.expireLe.endsWith('Z') ? '' : 'Z'));
  if (!Number.isFinite(fin.getTime())) return false;
  return fin.getTime() > instant.getTime();
}

// ---------------------------------------------------------------- secret

export const LONGUEUR_PIN = 6;

/**
 * Le secret du patient est un code a six chiffres, et c'est un choix.
 *
 * Un mot de passe long est la bonne reponse sur un clavier d'ordinateur. Sur
 * un telephone d'entree de gamme, partage, parfois tenu par quelqu'un qui lit
 * mal, il devient un mur : le patient renonce, ou l'ecrit au dos de sa carte.
 *
 * Ce qui tient le risque n'est donc pas la longueur, c'est le VERROUILLAGE
 * apres quelques essais — six chiffres se devinent en un million de
 * tentatives, pas en cinq. La regle de verrouillage vit dans la politique
 * d'acces de l'etablissement, comme pour les soignants.
 *
 * On refuse les suites evidentes : elles ne sont pas un detail statistique,
 * ce sont les premieres essayees.
 */
const PIN_TROP_SIMPLES = new Set([
  '000000', '111111', '222222', '333333', '444444',
  '555555', '666666', '777777', '888888', '999999',
  '123456', '654321', '012345', '543210', '121212', '123123',
]);

export type VerdictPin = { ok: true } | { ok: false; motif: string };

export function pinAcceptable(pin: string): VerdictPin {
  if (!/^\d+$/.test(pin ?? '')) {
    return { ok: false, motif: `Le code doit etre fait de ${LONGUEUR_PIN} chiffres.` };
  }
  if (pin.length !== LONGUEUR_PIN) {
    return { ok: false, motif: `Le code doit avoir ${LONGUEUR_PIN} chiffres, pas ${pin.length}.` };
  }
  if (PIN_TROP_SIMPLES.has(pin)) {
    return { ok: false, motif: 'Ce code est trop courant. Choisissez-en un autre.' };
  }
  return { ok: true };
}
