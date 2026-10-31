/**
 * Compatibilite avec l'ancien nom du produit.
 *
 * La plateforme s'est appelee « Parle » + « Docteur » et s'appelle
 * SmartHealth. Changer le nom affiche ne coute rien ; changer les
 * identifiants techniques qui en derivent coute une base de donnees.
 *
 * TROIS ENDROITS OU LE RENOMMAGE EST DANGEREUX :
 *
 *   1. Les variables d'environnement. Un etablissement dont le script de
 *      demarrage porte l'ancien prefixe verrait, du jour au lendemain,
 *      l'application ignorer sa base et en creer une vide a cote. Elle
 *      demarrerait sans erreur, sans dossier, et personne ne saurait
 *      pourquoi.
 *
 *   2. Le nom du fichier de base. Renommer le fichier attendu laisse
 *      l'ancien sur le disque et ouvre un fichier neuf. Meme symptome :
 *      une application qui marche, et plus aucun patient.
 *
 *   3. Le dossier de donnees de l'application de bureau, qui porte le nom
 *      du produit. Meme consequence, avec en plus un fichier qu'un
 *      utilisateur ne retrouvera pas seul.
 *
 * On lit donc les deux, on ecrit sous le nouveau nom, et on ne supprime
 * jamais l'ancien : c'est a un responsable de decider de son sort, pas a
 * une mise a jour.
 *
 * NOTE POUR UN RENOMMAGE FUTUR : les deux prefixes ci-dessous sont
 * assembles a partir de morceaux, et ce n'est pas une coquetterie. Un
 * remplacement de texte applique a tout le depot a deja efface ce module
 * une premiere fois — il y lisait l'ancien nom et l'a remplace par le
 * nouveau, laissant deux prefixes identiques et une compatibilite qui ne
 * compatibilisait plus rien. Ecrits en morceaux, ils survivent.
 *
 * Module PUR : il decide, il ne touche ni au disque ni a l'environnement.
 */

/** Prefixe historique des variables d'environnement. */
export const PREFIXE_ANCIEN = ['PARLE', 'DOCTEUR'].join('');
/** Prefixe courant. */
export const PREFIXE_COURANT = ['SMART', 'HEALTH'].join('');

/** Radical historique du nom de fichier de base. */
export const FICHIER_ANCIEN = PREFIXE_ANCIEN.toLowerCase();
/** Radical courant. */
export const FICHIER_COURANT = PREFIXE_COURANT.toLowerCase();

/**
 * Valeur d'un reglage, en acceptant l'ancien nom de variable.
 *
 * Le nouveau nom l'emporte quand les deux sont poses : un operateur qui a
 * pose le nouveau a fait un geste delibere, l'ancien peut n'etre qu'un
 * reste dans un profil.
 */
export function reglage(
  suffixe: string,
  env: Record<string, string | undefined>,
): string | undefined {
  const nouveau = env[`${PREFIXE_COURANT}_${suffixe}`];
  if (nouveau !== undefined && nouveau !== '') return nouveau;
  const ancien = env[`${PREFIXE_ANCIEN}_${suffixe}`];
  return ancien !== undefined && ancien !== '' ? ancien : undefined;
}

export interface ChoixBase {
  /** Chemin a ouvrir. */
  chemin: string;
  /** Vrai si l'on a repris la base portant l'ancien nom. */
  heritee: boolean;
}

/**
 * Quel fichier de base ouvrir, entre l'ancien nom et le nouveau.
 *
 * L'ordre n'est pas negociable :
 *   - une base au nouveau nom existe       -> on l'ouvre ;
 *   - sinon une base a l'ancien nom existe -> ON L'OUVRE, et on le dit ;
 *   - sinon                                -> on cree au nouveau nom.
 *
 * Le cas du milieu est le seul qui compte. Sans lui, la premiere mise a
 * jour apres le renommage ouvre une base vide a cote d'un fichier plein,
 * et l'etablissement decouvre la perte en cherchant un patient.
 *
 * On n'ouvre PAS l'ancienne quand les deux existent : cela signifie que
 * l'application a deja tourne sous le nouveau nom, et la base recente est
 * celle du nouveau.
 */
export function choisirBase(
  nouveau: string,
  ancien: string,
  existe: (chemin: string) => boolean,
): ChoixBase {
  if (existe(nouveau)) return { chemin: nouveau, heritee: false };
  if (existe(ancien)) return { chemin: ancien, heritee: true };
  return { chemin: nouveau, heritee: false };
}

/**
 * Message a journaliser quand une base heritee est reprise.
 *
 * Il NOMME le fichier. Un operateur qui lit « base heritee reprise » sans
 * chemin ne saura pas lequel sauvegarder le jour ou il faudra.
 */
export function messageHeritage(chemin: string): string {
  return (
    `Base reprise sous son ancien nom : ${chemin}. ` +
    'Elle continue de servir telle quelle. Pour adopter le nouveau nom, arretez ' +
    'l application et renommez le fichier — apres sauvegarde.'
  );
}
