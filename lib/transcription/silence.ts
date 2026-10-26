/**
 * Detection de parole a seuil adaptatif.
 *
 * LE DEFAUT QUE CE MODULE CORRIGE : un seuil fixe.
 *
 * Decouper la parole aux silences suppose qu'on sache reconnaitre un
 * silence. Avec un seuil d'energie constant, cela marche dans un bureau
 * ferme et echoue partout ailleurs :
 *
 *   - salle de consultation avec ventilateur, groupe electrogene, cour
 *     bruyante : le bruit de fond depasse le seuil en permanence, aucun
 *     silence n'est jamais detecte, et l'extrait n'est decoupe qu'au bout
 *     des vingt secondes de securite. Le praticien voit la transcription
 *     arriver par blocs, avec vingt secondes de retard ;
 *   - patient qui parle bas, ou enfant : la parole passe sous le seuil et
 *     l'extrait est jete comme du silence. C'est le sens inverse, et c'est
 *     le plus grave — on perd des mots.
 *
 * CE QUI DISTINGUE UN VENTILATEUR D'UNE VOIX : la stationnarite.
 *
 * Un premier dessin de ce module n'alimentait l'estimation du fond que sur
 * les trames jugees silencieuses. Il se bloquait sur le cas le plus
 * courant : un bruit qui apparait en cours de consultation depasse le
 * seuil, est donc classe « parole », et n'alimente donc jamais le fond —
 * le detecteur reste sourd jusqu'a la fin.
 *
 * On observe donc aussi les longues plages d'energie CONSTANTE. Une voix
 * fluctue d'une syllabe a l'autre ; une machine ne fluctue pas. Une plage
 * assez longue et assez plate est un bruit de fond, quel que soit son
 * niveau, et devient le nouveau plancher.
 *
 * Module PUR : il recoit des energies, pas de l'audio.
 */

/** Plancher absolu : en dessous, c'est du silence numerique quoi qu'il arrive. */
export const PLANCHER_RMS = 0.002;

/**
 * Facteur de detachement au-dessus du bruit de fond.
 *
 * Trois fois : en dessous, le souffle d'un ventilateur passe pour de la
 * parole ; au-dessus, une voix basse passe pour du silence. La valeur est
 * modeste a dessein — en cas de doute, mieux vaut transcrire du bruit, qui
 * se relit, que perdre un mot, qui ne se devine pas.
 */
export const FACTEUR_DETACHEMENT = 3;

/** Trames consecutives au-dessus du seuil avant de soupconner un bruit. */
export const TRAMES_STATIONNAIRES = 40;

/**
 * Ecart relatif maximal, sur une telle plage, pour la juger stationnaire.
 *
 * Un quart : la parole varie bien davantage d'une trame a l'autre, ne
 * serait-ce qu'entre une voyelle et une consonne. Une valeur plus large
 * finirait par prendre un monologue pour une machine, et couperait la fin
 * des phrases longues — celles qui portent la conduite a tenir.
 */
export const VARIATION_MAX = 0.25;

/** Inertie de l'estimation du fond, par trame : lente a monter, rapide a descendre. */
const MONTEE = 0.002;
const DESCENTE = 0.05;

export class DetecteurParole {
  private fond: number | null = null;
  private trames = 0;

  /** Plage courante au-dessus du seuil, pour juger de sa stationnarite. */
  private serie = 0;
  private serieMin = 0;
  private serieMax = 0;

  // Propriete declaree puis affectee, et non une propriete de parametre :
  // le mode « strip-only » de Node, qui fait tourner les tests, ne sait pas
  // lire `constructor(private readonly x)`. Un module de regles doit rester
  // executable par le banc de test sans etape de compilation.
  private readonly tramesAvantAdaptation: number;

  constructor(tramesAvantAdaptation = 10) {
    this.tramesAvantAdaptation = tramesAvantAdaptation;
  }

  /** Seuil courant, utile a l'affichage et aux tests. */
  get seuil(): number {
    if (this.fond === null || this.trames < this.tramesAvantAdaptation) return PLANCHER_RMS;
    return Math.max(PLANCHER_RMS, this.fond * FACTEUR_DETACHEMENT);
  }

  get bruitDeFond(): number {
    return this.fond ?? 0;
  }

  /** Cette trame porte-t-elle de la parole ? */
  observer(rms: number): boolean {
    if (!Number.isFinite(rms) || rms < 0) return false;

    this.trames += 1;
    if (this.fond === null) {
      this.fond = rms;
      return rms >= PLANCHER_RMS;
    }

    const parle = rms >= this.seuil;

    if (!parle) {
      // Chemin rapide : une trame sous le seuil est du fond, sans discussion.
      this.serie = 0;
      const alpha = rms > this.fond ? MONTEE : DESCENTE;
      this.fond = this.fond + alpha * (rms - this.fond);
      return false;
    }

    // Au-dessus du seuil : on suit la plage pour voir si elle est plate.
    if (this.serie === 0) {
      this.serieMin = rms;
      this.serieMax = rms;
    } else {
      this.serieMin = Math.min(this.serieMin, rms);
      this.serieMax = Math.max(this.serieMax, rms);
    }
    this.serie += 1;

    if (this.serie >= TRAMES_STATIONNAIRES) {
      const etendue = this.serieMax === 0 ? 0 : (this.serieMax - this.serieMin) / this.serieMax;
      if (etendue <= VARIATION_MAX) {
        // Assez long et assez plat pour etre une machine : on adopte le
        // creux de la plage comme nouveau fond, et on repart.
        this.fond = this.serieMin;
        this.serie = 0;
        return false;
      }
      // Plage longue mais vivante : c'est de la parole. On repart le
      // compteur pour juger la suite sur ses propres merites.
      this.serie = 0;
    }

    return true;
  }

  reset(): void {
    this.fond = null;
    this.trames = 0;
    this.serie = 0;
  }
}
