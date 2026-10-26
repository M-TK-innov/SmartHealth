/**
 * Detection de parole a seuil adaptatif.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE, dans les deux sens :
 *
 *   - en salle bruyante — ventilateur, groupe electrogene, cour — un seuil
 *     fixe ne detecte plus jamais de silence. L'extrait n'est decoupe
 *     qu'au bout des vingt secondes de securite, et le praticien voit la
 *     transcription arriver par blocs, tres en retard ;
 *   - a l'inverse, une voix basse ou un enfant passent sous un seuil trop
 *     haut, et leurs mots sont jetes comme du silence. C'est le plus
 *     grave : un mot perdu ne se devine pas.
 *
 * Module pur : il recoit des energies, pas de l'audio.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DetecteurParole,
  FACTEUR_DETACHEMENT,
  PLANCHER_RMS,
  TRAMES_STATIONNAIRES,
} from '../lib/transcription/silence.ts';

/** Fait observer n trames d'une meme energie, et rend la derniere decision. */
function tenir(d, rms, n) {
  let dernier = false;
  for (let i = 0; i < n; i++) dernier = d.observer(rms);
  return dernier;
}

describe('bureau calme', () => {
  test('le silence numerique reste du silence', () => {
    const d = new DetecteurParole();
    assert.equal(tenir(d, 0.0005, 40), false);
  });

  test('une parole ordinaire est detectee', () => {
    const d = new DetecteurParole();
    tenir(d, 0.001, 40);
    assert.equal(d.observer(0.05), true);
  });
});

describe('salle bruyante — ventilateur et cour', () => {
  test('le bruit de fond cesse d etre pris pour de la parole', () => {
    // LE cas. Avec un seuil fixe a 0,008, un fond a 0,02 est « de la
    // parole » en permanence : plus aucun silence n est detecte, et rien
    // n est decoupe avant la limite de securite.
    const d = new DetecteurParole();
    const fond = 0.02;
    assert.equal(
      tenir(d, fond, 200),
      false,
      'un fond constant doit finir par etre reconnu comme du fond',
    );
    assert.ok(d.seuil > fond, `le seuil (${d.seuil}) doit passer au-dessus du fond (${fond})`);
  });

  test('et la parole reste detectee par-dessus ce bruit', () => {
    // Le seuil ne doit pas monter au point de rendre le detecteur sourd.
    const d = new DetecteurParole();
    tenir(d, 0.02, 200);
    assert.equal(d.observer(0.02 * FACTEUR_DETACHEMENT * 1.2), true);
  });

  test('le seuil suit un bruit qui apparait en cours de consultation', () => {
    // Quelqu un allume le ventilateur au milieu de la consultation.
    const d = new DetecteurParole();
    tenir(d, 0.001, 50);
    const avant = d.seuil;
    tenir(d, 0.015, 400);
    assert.ok(d.seuil > avant, 'le seuil doit avoir suivi le nouveau fond');
  });
});

describe('voix basse', () => {
  test('une voix faible dans le calme est entendue', () => {
    // Un enfant, ou un patient epuise. Un seuil fixe calibre sur une voix
    // d adulte jetterait ses mots comme du silence.
    const d = new DetecteurParole();
    tenir(d, 0.0008, 60);
    assert.equal(d.observer(0.006), true, 'une voix a 0,006 doit passer dans une piece calme');
  });
});

describe('le seuil ne derive pas pendant qu on parle', () => {
  /**
   * Un monologue, avec la variation d'une voix reelle.
   *
   * Une energie CONSTANTE ne modeliserait rien : aucune voix n'en produit,
   * et le detecteur a precisement pour regle de prendre une energie plate
   * pour une machine. Tester avec une constante reviendrait a verifier
   * qu'on confond une voix avec un ventilateur.
   */
  function monologue(d, trames) {
    let dernier = false;
    for (let i = 0; i < trames; i++) {
      // Alternance voyelle / consonne : du simple au triple.
      const rms = 0.04 + 0.08 * Math.abs(Math.sin(i / 2));
      dernier = d.observer(rms);
    }
    return dernier;
  }

  test('un long monologue ne fait pas monter le seuil', () => {
    // Si la parole alimentait l estimation du fond, le seuil monterait
    // pendant la phrase et la fin serait coupee. C est le defaut le plus
    // insidieux : il ne se voit que sur les phrases longues, celles qui
    // portent la conduite a tenir.
    const d = new DetecteurParole();
    tenir(d, 0.001, 40);
    const seuilAvant = d.seuil;
    const encoreParole = monologue(d, 500);
    assert.equal(d.seuil, seuilAvant, 'le fond ne doit pas bouger pendant la parole');
    assert.equal(encoreParole, true, 'la fin du monologue doit encore etre de la parole');
  });

  test('une energie longue et PLATE est reconnue comme une machine', () => {
    // La contrepartie de la regle precedente, et la raison d etre du
    // critere de stationnarite : un groupe electrogene qui demarre est
    // fort, constant, et n est pas de la parole.
    const d = new DetecteurParole();
    tenir(d, 0.001, 40);
    assert.equal(
      tenir(d, 0.06, 200),
      false,
      'une plage plate, meme forte, doit finir par devenir le fond',
    );
    assert.ok(d.bruitDeFond >= 0.05, `fond adopte : ${d.bruitDeFond}`);
  });

  test('le fond adopte le CREUX de la plage, pas son sommet', () => {
    // Un bruit de machine n est jamais parfaitement constant. Prendre son
    // sommet comme plancher placerait le seuil un cran trop haut, et les
    // syllabes les plus faibles tomberaient dans le silence.
    //
    // On observe JUSTE apres l'adoption : au-dela, les trames suivantes
    // passent sous le seuil et tirent le fond vers la moyenne de la
    // plage, ce qui effacerait la difference qu'on cherche a mesurer.
    const d = new DetecteurParole();
    tenir(d, 0.001, 40);
    for (let i = 0; i < TRAMES_STATIONNAIRES; i++) d.observer(i % 2 === 0 ? 0.05 : 0.06);
    assert.equal(
      d.bruitDeFond,
      0.05,
      `le fond doit etre le creux de la plage, pas son sommet — obtenu ${d.bruitDeFond}`,
    );
  });
});

describe('garde-fous', () => {
  test('le plancher absolu tient quel que soit le fond', () => {
    // Dans un silence numerique total, le fond tend vers zero et le seuil
    // adaptatif aussi : sans plancher, la moindre fluctuation deviendrait
    // de la parole et le modele transcrirait du souffle en boucle.
    const d = new DetecteurParole();
    tenir(d, 0, 300);
    assert.ok(d.seuil >= PLANCHER_RMS);
    assert.equal(d.observer(PLANCHER_RMS / 2), false);
  });

  test('les premieres trames ne pilotent pas le seuil', () => {
    // Un seuil adaptatif calibre sur trois trames vaut moins qu un seuil
    // fixe : si la consultation commence pendant que quelqu un parle, le
    // fond serait estime sur de la voix.
    const d = new DetecteurParole(10);
    d.observer(0.09);
    assert.equal(d.seuil, PLANCHER_RMS, 'avant adaptation, on s en tient au plancher');
  });

  test('une energie aberrante ne casse pas le detecteur pour la suite', () => {
    // Ce qui compte n est pas la reponse rendue sur la trame aberrante —
    // elle vaudrait « faux » de toute facon — mais le fait que le
    // detecteur FONCTIONNE ENCORE apres. Sans garde, un seul NaN
    // contamine l estimation du fond, le seuil devient NaN, et plus
    // aucune parole n est jamais detectee jusqu a la fin de la
    // consultation.
    const d = new DetecteurParole();
    tenir(d, 0.001, 40);

    assert.equal(d.observer(Number.NaN), false);
    assert.equal(d.observer(-1), false);

    assert.ok(Number.isFinite(d.seuil), `seuil corrompu : ${d.seuil}`);
    assert.ok(Number.isFinite(d.bruitDeFond), `fond corrompu : ${d.bruitDeFond}`);
    assert.equal(d.observer(0.05), true, 'la parole doit encore etre detectee apres l aberration');
  });

  test('reset repart de zero', () => {
    const d = new DetecteurParole();
    tenir(d, 0.03, 200);
    d.reset();
    assert.equal(d.seuil, PLANCHER_RMS);
    assert.equal(d.bruitDeFond, 0);
  });
});
