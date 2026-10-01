/**
 * Mesure de l'attribution des tours de parole, sur corpus annote.
 *
 * Ce module existe pour une raison precise : une affirmation du type « zero
 * attribution fausse » ne vaut que si elle est RECALCULEE. Un chiffre compte a
 * la main devient faux au premier changement de la detection, et personne ne
 * s'en apercoit — surtout pas celui qui le montre sur une diapositive.
 *
 * DISTINCTION QUI COMMANDE TOUT LE RESTE :
 *
 *   - `confusionsRole` est un INVARIANT. Confondre le medecin avec quelqu'un
 *     d'autre change la NATURE de l'enonce : une plainte du patient devient une
 *     observation du medecin, et entre au dossier sans rien reveiller. C'est
 *     l'erreur que personne ne voit. Elle doit rester a zero.
 *
 *   - `confusionsEntourage` est une MESURE, suivie mais non nulle. Confondre le
 *     patient et son accompagnant garde l'enonce du bon cote — c'est toujours
 *     une personne qui vient se faire soigner qui parle, pas le soignant. Le
 *     texte seul ne distingue pas toujours les deux, et pretendre le contraire
 *     serait plus faux que de l'admettre.
 *
 *   - `correctes` et `indeterminees` sont des MESURES. Elles bougent quand la
 *     detection change, et c'est legitime.
 *
 * Le piege de cette distinction : « zero faute » s'obtient trivialement en ne
 * tranchant jamais. D'ou `couverture`, qui doit etre tenue par ailleurs — un
 * systeme qui n'attribue rien est sans erreur et sans usage.
 */

import { attributeSpeakers, type Speaker } from './speakers.ts';

export interface TourAnnote {
  seq: number;
  /** Locuteur attendu, pose a la main par un relecteur. */
  gold: Speaker;
  text: string;
  /** Hauteur mediane, si le corpus la porte. */
  pitchHz?: number;
}

export interface Ecart {
  seq: number;
  attendu: Speaker;
  obtenu: Speaker;
  text: string;
  /**
   * `role` : le medecin a ete confondu avec quelqu'un d'autre, ou l'inverse.
   * `entourage` : patient et accompagnant confondus entre eux.
   */
  classe: 'role' | 'entourage';
}

/** Le medecin d'un cote, ceux qui viennent se faire soigner de l'autre. */
function estSoignant(s: Speaker): boolean {
  return s === 'clinician';
}

export interface Mesure {
  total: number;
  correctes: number;
  /** Laisse « unknown » alors que le corpus tranche : un trou, visible. */
  indeterminees: number;
  /** Attribue a un AUTRE locuteur que l'attendu, toutes classes confondues. */
  fausses: number;
  /** Medecin confondu avec un autre role : l'erreur qui change le sens. INVARIANT a zero. */
  confusionsRole: number;
  /** Patient et accompagnant confondus : l'enonce reste du bon cote. Suivi, non nul. */
  confusionsEntourage: number;
  /** Part des tours sur lesquels le systeme s'est prononce, 0 a 1. */
  couverture: number;
  /** Part de decisions justes parmi celles qui ont ete prises, 0 a 1. */
  precision: number;
  /** Le detail des erreurs, pour qu'elles soient lisibles et pas seulement comptees. */
  ecarts: Ecart[];
  /** Les tours laisses indetermines, pour savoir ce que le systeme n'ose pas trancher. */
  trous: { seq: number; attendu: Speaker; text: string }[];
}

/**
 * Passe le corpus dans la detection reelle et compte.
 *
 * On appelle `attributeSpeakers`, pas une reimplementation : mesurer autre
 * chose que ce qui tourne ne mesurerait rien.
 */
export function mesurer(tours: TourAnnote[]): Mesure {
  const attribues = attributeSpeakers(
    tours.map((t) => ({ text: t.text, hint: t.pitchHz === undefined ? undefined : { pitchHz: t.pitchHz } })),
  );

  const ecarts: Ecart[] = [];
  const trous: { seq: number; attendu: Speaker; text: string }[] = [];
  let correctes = 0;

  tours.forEach((tour, i) => {
    const obtenu = attribues[i].speaker;
    if (obtenu === tour.gold) correctes += 1;
    else if (obtenu === 'unknown') trous.push({ seq: tour.seq, attendu: tour.gold, text: tour.text });
    else {
      const classe = estSoignant(obtenu) === estSoignant(tour.gold) ? 'entourage' : 'role';
      ecarts.push({ seq: tour.seq, attendu: tour.gold, obtenu, text: tour.text, classe });
    }
  });

  const total = tours.length;
  const tranchees = correctes + ecarts.length;
  return {
    total,
    correctes,
    indeterminees: trous.length,
    fausses: ecarts.length,
    confusionsRole: ecarts.filter((e) => e.classe === 'role').length,
    confusionsEntourage: ecarts.filter((e) => e.classe === 'entourage').length,
    couverture: total === 0 ? 0 : tranchees / total,
    precision: tranchees === 0 ? 0 : correctes / tranchees,
    ecarts,
    trous,
  };
}

/** Rendu lisible pour la console — c'est ce qu'on relit avant d'annoncer un chiffre. */
export function formater(mesure: Mesure, titre = 'Attribution des tours de parole'): string {
  const pc = (x: number) => `${Math.round(x * 100)} %`;
  const lignes = [
    titre,
    '='.repeat(titre.length),
    '',
    `  tours annotes        ${mesure.total}`,
    `  correctement attribues ${mesure.correctes}`,
    `  laisses indetermines   ${mesure.indeterminees}   (trous visibles)`,
    `  attributions fausses   ${mesure.fausses}`,
    `    dont MEDECIN/AUTRE   ${mesure.confusionsRole}   (change le sens de l enonce — doit rester a zero)`,
    `    dont patient/accompagnant ${mesure.confusionsEntourage}   (reste du cote de celui qui consulte)`,
    '',
    `  couverture           ${pc(mesure.couverture)}   part des tours tranches`,
    `  precision            ${pc(mesure.precision)}   justesse parmi les tours tranches`,
  ];

  if (mesure.ecarts.length > 0) {
    lignes.push('', '  Erreurs :');
    for (const e of mesure.ecarts) {
      lignes.push(
        `    tour ${e.seq} [${e.classe}] : attendu ${e.attendu}, obtenu ${e.obtenu}`,
        `      « ${e.text.slice(0, 72)} »`,
      );
    }
  }

  if (mesure.trous.length > 0) {
    lignes.push('', '  Laisses au praticien :');
    for (const t of mesure.trous) {
      lignes.push(`    tour ${t.seq} (${t.attendu}) « ${t.text.slice(0, 66)} »`);
    }
  }

  return lignes.join('\n');
}
