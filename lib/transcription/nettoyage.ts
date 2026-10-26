/**
 * Nettoyage d'un extrait rendu par Whisper, avant qu'il n'entre au dossier.
 *
 * Whisper ne se tait pas quand on se tait. Sur du silence, du souffle de
 * ventilateur ou un brouhaha de salle d'attente, il produit du texte
 * parfaitement forme — et ce texte vient de ses donnees d'entrainement, pas
 * du micro. Sur du YouTube francais, cela donne des generiques de
 * sous-titrage et des formules de fin de video.
 *
 * LA LIGNE DE CONDUITE, et elle penche volontairement d'un cote :
 *
 *   On ne supprime que ce qu'aucun soignant ne dirait en consultation.
 *   « Sous-titres realises par la communaute d'Amara.org » n'a jamais ete
 *   prononce dans un cabinet. « Merci. » si — tout le temps. Supprimer une
 *   parole reelle est pire que laisser passer un artefact : l'artefact se
 *   voit a la relecture, le mot manquant non.
 *
 * C'est pourquoi la suppression exige que l'extrait ENTIER soit l'artefact,
 * et que l'artefact soit distinctif. Un extrait qui contient l'artefact au
 * milieu d'une vraie phrase est conserve tel quel : on ne devine pas ou la
 * parole s'arrete.
 *
 * Module PUR : il ne connait ni le micro ni le modele.
 */

export interface ExtraitNettoye {
  /** Texte a retenir. Vide si l'extrait est a jeter. */
  texte: string;
  /** Faux si l'extrait ne doit pas entrer au dossier. */
  garder: boolean;
  /**
   * Pourquoi il a ete modifie ou rejete. Toujours renseigne quand quelque
   * chose a change : un nettoyage silencieux est indistinguable d'un bogue.
   */
  motif:
    | null
    | 'vide'
    | 'ponctuation-seule'
    | 'artefact-de-silence'
    | 'echo-de-l-amorce'
    | 'repetitions-reduites';
}

/**
 * Formules que Whisper produit sur du silence, apprises sur des sous-titres.
 *
 * Chacune est DISTINCTIVE : aucune ne peut sortir de la bouche d'un
 * praticien pendant une consultation. La liste reste courte a dessein —
 * chaque ajout est une occasion de supprimer une vraie parole.
 */
const ARTEFACTS: RegExp[] = [
  /^sous-?titres?\s+(realises?|faits?)\s+par/i,
  /^sous-?titrage\s/i,
  /^amara\.org/i,
  /^merci\s+d['’]avoir\s+regarde/i,
  /^abonnez-?vous/i,
  /^n['’]oubliez\s+pas\s+de\s+vous\s+abonner/i,
  /^(a\s+)?la\s+prochaine\s+(video|fois)\b/i,
  /^generique\b/i,
  // Didascalies entre crochets ou parentheses, seules sur l'extrait :
  // « [Musique] », « (bruit de fond) ».
  /^[[(][^\])]*[\])]$/,
  // Les notes de musique seules — « ♪♪ » — n'arrivent pas ici : elles ne
  // portent ni lettre ni chiffre, et sont deja jetees plus haut.
];

/** Occurrences consecutives conservees ; au-dela, c'est une boucle du modele. */
export const REPETITIONS_MAX = 3;

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Nettoie un extrait.
 *
 * `amorce` est le prompt de biaisage, quand il y en a un : Whisper le
 * recrache parfois tel quel en tete d'extrait, et ce texte n'a jamais ete
 * prononce.
 */
export function nettoyer(brut: string, amorce?: string): ExtraitNettoye {
  const texte = brut.replace(/\s+/g, ' ').trim();

  if (texte === '') return { texte: '', garder: false, motif: 'vide' };

  // Que de la ponctuation : rien de prononce.
  if (!/[\p{L}\p{N}]/u.test(texte)) {
    return { texte: '', garder: false, motif: 'ponctuation-seule' };
  }

  if (amorce) {
    const sansEcho = retirerEcho(texte, amorce);
    if (sansEcho !== texte) {
      // L'amorce retiree, il peut ne rien rester.
      if (sansEcho === '') return { texte: '', garder: false, motif: 'echo-de-l-amorce' };
      const suite = nettoyer(sansEcho);
      return { ...suite, motif: suite.motif ?? 'echo-de-l-amorce' };
    }
  }

  // L'extrait ENTIER doit etre l'artefact. Un artefact noye dans une vraie
  // phrase reste : on ne sait pas ou la parole commence.
  //
  // La comparaison se fait sans accents : Whisper rend « realises » ou
  // « réalisés » selon l'extrait, et un filtre qui ne reconnait qu'une des
  // deux formes laisse passer l'autre un jour sur deux.
  if (ARTEFACTS.some((r) => r.test(sansAccents(texte)))) {
    return { texte: '', garder: false, motif: 'artefact-de-silence' };
  }

  const reduit = reduireRepetitions(texte);
  if (reduit !== texte) {
    return { texte: reduit, garder: true, motif: 'repetitions-reduites' };
  }

  return { texte, garder: true, motif: null };
}

/**
 * Retire l'amorce quand le modele la recrache en tete.
 *
 * Comparaison sur une forme normalisee, parce que Whisper reponctue : il
 * rend l'amorce avec des majuscules et des virgules qu'elle n'avait pas.
 */
function retirerEcho(texte: string, amorce: string): string {
  const cle = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const a = cle(amorce);
  if (a.length < 12) return texte;
  const t = cle(texte);
  if (!t.startsWith(a)) return texte;

  // On recoupe le texte d'origine au prorata des mots consommes, pour
  // conserver la ponctuation de ce qui suit.
  const motsAmorce = a.split(' ').length;
  const mots = texte.split(' ');
  return mots.slice(motsAmorce).join(' ').replace(/^[\s,.;:–—-]+/, '').trim();
}

/**
 * Reduit les boucles du modele.
 *
 * Whisper small, quantifie, part parfois en repetition : « oui oui oui oui
 * oui oui ». Trois occurrences restent plausibles a l'oral — « non, non,
 * non » — au-dela c'est la machine. On ramene a trois plutot qu'a une :
 * l'insistance etait peut-etre reelle, et la supprimer modifierait le sens
 * d'un propos rapporte.
 */
function reduireRepetitions(texte: string): string {
  const mots = texte.split(' ');
  const sortie: string[] = [];
  let precedent = '';
  let serie = 0;

  for (const mot of mots) {
    const cle = mot.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (cle !== '' && cle === precedent) {
      serie += 1;
      // On garde REPETITIONS_MAX occurrences ; la suivante est de trop.
      if (serie > REPETITIONS_MAX) continue;
    } else {
      precedent = cle;
      serie = 1;
    }
    sortie.push(mot);
  }

  return sortie.join(' ');
}
