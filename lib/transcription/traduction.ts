/**
 * Ce que le medecin va relire, et ce qui doit rester a cote.
 *
 * Un extrait peut revenir du service de transcription sous deux formes : le
 * texte tel qu'il a ete prononce, ou ce texte accompagne de sa traduction. Le
 * choix de ce qui devient « la transcription » et de ce qui est conserve a
 * cote n'a rien de mecanique, et se teste donc a part.
 *
 * LA REGLE : la traduction remplace le texte affiche, jamais le texte garde.
 *
 * Une traduction automatique est une interpretation. Elle peut inverser une
 * negation — « pas de fievre » devenant « fievre » —, deplacer une posologie ou
 * perdre une duree. Rien en aval ne saurait le reperer : l'extraction clinique,
 * le compte rendu et l'ordonnance heriteraient de l'erreur en la tenant pour la
 * parole du patient. Le seul garde-fou possible est que le praticien ait la
 * phrase prononcee sous les yeux au moment ou il valide, et que le dossier la
 * garde pour qu'on puisse verifier apres coup.
 */

export interface SortieTranscription {
  /** Texte a afficher et a analyser. */
  text: string;
  /** Langue de `text` apres l'etape de traduction. */
  language: string;
  translated: boolean;
  /** Phrase prononcee, uniquement si `text` en est une traduction. */
  sourceText: string | null;
  sourceLanguage: string | null;
}

/**
 * Faut-il demander une traduction pour cet extrait ?
 *
 * Seul Griot sait rendre autre chose que du francais, et une consultation deja
 * tenue en francais n'a rien a traduire — le demander ferait un aller-retour de
 * modele pour reecrire une phrase correcte, avec le risque de l'abimer.
 */
export function doitTraduire(backend: string, langueParlee: string): boolean {
  return backend === 'griot' && !estFrancais(langueParlee);
}

export function estFrancais(langue: string): boolean {
  return (langue ?? '').slice(0, 2).toLowerCase() === 'fr';
}

/**
 * Compose la sortie a partir de ce que le service a rendu.
 *
 * `traduction` vide — service sans modele de traduction, echec de traduction,
 * ou extrait deja francais — laisse passer la transcription telle quelle. Perdre
 * la parole du patient serait pire que de la rendre dans une langue que le
 * medecin ne lit pas : dans le second cas il peut encore demander, dans le
 * premier il n'y a plus rien.
 */
export function resoudreSortie(params: {
  brut: string;
  traduction?: string | null;
  langueParlee: string;
}): SortieTranscription {
  const brut = (params.brut ?? '').trim();
  const traduction = (params.traduction ?? '').trim();

  // Une traduction identique a la source n'en est pas une : l'annoncer comme
  // telle afficherait deux fois la meme phrase au praticien, pour rien.
  if (!traduction || traduction === brut) {
    return {
      text: brut,
      language: params.langueParlee,
      translated: false,
      sourceText: null,
      sourceLanguage: null,
    };
  }

  return {
    text: traduction,
    language: 'fr',
    translated: true,
    sourceText: brut,
    sourceLanguage: params.langueParlee,
  };
}
