/**
 * Application des lecons apprises a une transcription neuve.
 *
 * POURQUOI UNE PASSE A PART, et non une entree de plus dans le lexique.
 *
 * Le lexique clinique ne remplace pas les variantes qu'il connait : il les
 * PROTEGE. Une forme listee — « doliprane », « coartem » — y est declaree
 * acceptable, et la normalisation la laisse telle quelle pour qu'aucune
 * correction approchee ne vienne l'abimer de l'interieur. C'est le bon
 * comportement pour un formulaire.
 *
 * Une lecon apprise dit l'inverse : « ce mot-la, remplace-le ». Elle n'est pas
 * une orthographe acceptable de plus, c'est une substitution voulue par le
 * praticien. La glisser parmi les variantes la rendait simplement inerte —
 * elle protegeait la faute au lieu de la corriger.
 *
 * Module PUR : il recoit les lecons, il rend le texte et ce qui a bouge. Rien
 * n'est applique en silence, la liste des remplacements part avec le texte.
 */

import type { KeywordCorrection } from '../transcription/keywords.ts';
import { normaliser } from './corrections.ts';

export interface Lecon {
  /** Forme a remplacer, telle qu'elle a ete entendue. */
  avant: string;
  /** Forme a ecrire. */
  apres: string;
}

/** Majuscule d'origine conservee : « Arthemeter » ne doit pas devenir « artemether ». */
function memeCasse(original: string, remplacement: string): string {
  if (!original || !remplacement) return remplacement;
  const premiere = original[0];
  if (premiere === premiere.toUpperCase() && premiere !== premiere.toLowerCase()) {
    return remplacement[0].toUpperCase() + remplacement.slice(1);
  }
  return remplacement;
}

/**
 * Remplace les formes apprises dans un texte.
 *
 * Le decoupage se fait sur les frontieres de mots : sans cela, « palu »
 * apprise transformerait « paludisme » en « paludismedisme ». Les lecons les
 * plus longues passent en premier, pour qu'une lecon de deux mots ne soit pas
 * coupee par une lecon d'un mot qui en fait partie.
 */
export function appliquerLecons(
  texte: string,
  lecons: Lecon[],
): { text: string; corrections: KeywordCorrection[] } {
  if (!texte || lecons.length === 0) return { text: texte ?? '', corrections: [] };

  const triees = [...lecons].sort((a, b) => b.avant.split(/\s+/).length - a.avant.split(/\s+/).length);
  const corrections: KeywordCorrection[] = [];
  let resultat = texte;

  for (const lecon of triees) {
    const avant = lecon.avant.trim();
    const apres = lecon.apres.trim();
    if (!avant || !apres || normaliser(avant) === normaliser(apres)) continue;

    // On compare sur la forme normalisee — accents et casse mis de cote — mais
    // on remplace dans le texte d'origine, a la position trouvee.
    const motifs = avant
      .split(/\s+/)
      .map((mot) => echapper(mot).replace(/[eE]/g, '[eéèêëEÉÈÊË]').replace(/[aA]/g, '[aàâäAÀÂÄ]'))
      .join('\\s+');
    const regex = new RegExp(`(^|[^\\p{L}\\p{N}])(${motifs})(?![\\p{L}\\p{N}])`, 'giu');

    resultat = resultat.replace(regex, (entier, avantChar: string, trouve: string, position: number) => {
      corrections.push({
        from: trouve,
        to: apres,
        distance: 0,
        index: position + avantChar.length,
      });
      return avantChar + memeCasse(trouve, apres);
    });
  }

  return { text: resultat, corrections };
}

function echapper(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
