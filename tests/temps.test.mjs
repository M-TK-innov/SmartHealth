/**
 * Normalisation des horodatages lus en base.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE : une heure entiere, sur tout ce que
 * l'application mesure.
 *
 * Les colonnes a defaut `datetime('now')` portent de l'UTC sans marqueur
 * de fuseau ; `new Date()` les lit comme des heures locales. A Cotonou —
 * UTC+1, le terrain vise — un tube preleve il y a trois minutes paraissait
 * en avoir soixante-trois, et le laboratoire demandait de repiquer le
 * patient. A l'ouest de Greenwich l'erreur s'inverse, et c'est pire : un
 * echantillon perime parait frais.
 *
 * Les cas ci-dessous forcent un fuseau, pour que le defaut se reproduise
 * ailleurs qu'a Cotonou.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  dansLeJour,
  jourCivil,
  jourPrecedent,
  jourSuivant,
  minutesEntre,
  versIso,
  versIsoRequis,
} from '../lib/temps.ts';

describe('conversion des formes', () => {
  test('la forme SQLite recoit son marqueur UTC', () => {
    assert.equal(versIso('2026-10-26 04:26:27'), '2026-10-26T04:26:27Z');
  });

  test('la forme ISO est laissee intacte', () => {
    assert.equal(versIso('2026-10-26T04:26:27.000Z'), '2026-10-26T04:26:27.000Z');
  });

  test('une forme ISO sans marqueur en recoit un', () => {
    // Meme piege que la forme SQLite, avec un T a la place de l espace.
    assert.equal(versIso('2026-10-26T04:26:27'), '2026-10-26T04:26:27Z');
  });

  test('les fractions de seconde sont conservees', () => {
    assert.equal(versIso('2026-10-26 04:26:27.123'), '2026-10-26T04:26:27.123Z');
  });

  test('le vide rend null, pas une date inventee', () => {
    // Une date de repli se propage en silence ; une date absente se voit.
    assert.equal(versIso(null), null);
    assert.equal(versIso(undefined), null);
    assert.equal(versIso('   '), null);
  });

  test('une valeur illisible est rendue telle quelle', () => {
    assert.equal(versIso('hier matin'), 'hier matin');
  });

  test('la variante requise ne rend jamais null', () => {
    assert.equal(versIsoRequis('2026-10-26 04:26:27'), '2026-10-26T04:26:27Z');
    assert.equal(versIsoRequis(''), '');
  });
});

describe('les deux formes designent le meme instant', () => {
  test('quel que soit le fuseau du poste', () => {
    // LE cas. Sans normalisation, l ecart vaut exactement le decalage du
    // poste : une heure a Cotonou, huit a Singapour, moins cinq a New York.
    //
    // Le fuseau est RESTAURE a la fin. Une premiere version le laissait a
    // UTC, et tous les cas suivants de ce fichier tournaient alors sous un
    // fuseau ou plusieurs defauts de fuseau sont invisibles — ils
    // passaient sans rien verifier.
    const avant = process.env.TZ;
    try {
      for (const fuseau of ['Africa/Porto-Novo', 'UTC', 'America/New_York', 'Asia/Singapore']) {
        process.env.TZ = fuseau;
        const sqlite = new Date(versIso('2026-10-26 04:26:27')).getTime();
        const iso = new Date('2026-10-26T04:26:27Z').getTime();
        assert.equal(sqlite, iso, `desaccord sous ${fuseau}`);
      }
    } finally {
      process.env.TZ = avant;
    }
  });

  test('sans normalisation, l ecart est bien celui du fuseau', () => {
    // On verifie que le defaut EXISTE : sinon ce fichier protegerait
    // quelque chose qui n a jamais ete casse, et personne ne saurait
    // pourquoi la normalisation est la.
    const avant = process.env.TZ;
    process.env.TZ = 'Africa/Porto-Novo';
    try {
      const brut = new Date('2026-10-26 04:26:27').getTime();
      const correct = new Date('2026-10-26T04:26:27Z').getTime();
      assert.equal(
        (correct - brut) / 60_000,
        60,
        'a Cotonou, lire la forme SQLite sans marqueur coute une heure',
      );
    } finally {
      process.env.TZ = avant;
    }
  });
});

describe('minutes entre deux instants', () => {
  test('elle marche entre formes melangees', () => {
    // Le cas reel : prelevee_le vient d un defaut SQLite, l instant du
    // rendu vient du code.
    assert.equal(minutesEntre('2026-10-26 04:00:00', '2026-10-26T04:30:00.000Z'), 30);
  });

  test('une attente ne descend pas sous zero', () => {
    // « -5 min » sur un ecran de file ne veut rien dire pour l agent qui
    // le lit.
    assert.equal(minutesEntre('2026-10-26T05:00:00Z', '2026-10-26T04:00:00Z'), 0);
  });

  test('une date manquante rend zero plutot que NaN', () => {
    assert.equal(minutesEntre(null, '2026-10-26T04:00:00Z'), 0);
    assert.equal(minutesEntre('2026-10-26T04:00:00Z', null), 0);
  });

  test('l arrondi est au plus proche', () => {
    assert.equal(minutesEntre('2026-10-26T04:00:00Z', '2026-10-26T04:00:40Z'), 1);
    assert.equal(minutesEntre('2026-10-26T04:00:00Z', '2026-10-26T04:00:20Z'), 0);
  });
});

describe('le jour civil de l etablissement', () => {
  // L'instant choisi tombe juste apres minuit UTC : c'est la seule fenetre
  // ou l'erreur se voit, et c'est precisement celle des gardes de nuit.
  const MINUIT_PASSE = '2026-10-27T00:30:00Z';

  test('a Cotonou, UTC+1, le jour est deja le 27', () => {
    assert.equal(jourCivil(MINUIT_PASSE, 'Africa/Porto-Novo'), '2026-10-27');
  });

  test('A LIMA, UTC-5, C EST ENCORE LA VEILLE', () => {
    // LE cas. Calculer « aujourd hui » sur minuit UTC faisait basculer le
    // programme operatoire a dix-neuf heures locales, en plein travail :
    // les interventions du soir se rangeaient sous le lendemain, et le
    // programme du jour paraissait vide a ceux qui y operaient encore.
    assert.equal(jourCivil(MINUIT_PASSE, 'America/Lima'), '2026-10-26');
  });

  test('a Singapour, UTC+8, on est deja en pleine matinee du 27', () => {
    assert.equal(jourCivil(MINUIT_PASSE, 'Asia/Singapore'), '2026-10-27');
  });

  test('en UTC, le jour suit l horodatage', () => {
    assert.equal(jourCivil(MINUIT_PASSE, 'UTC'), '2026-10-27');
  });

  test('la forme SQLite est lue comme de l UTC, pas comme une heure locale', () => {
    // Les deux formes cohabitent en base et designent le meme instant.
    // Sans normalisation, « 2026-10-27 00:30:00 » serait lu a l'heure de
    // la MACHINE : sur un serveur a Singapour, cela recule l'instant de
    // huit heures et fait tomber le jour civil la veille.
    //
    // On force donc un fuseau machine eloigne, sans quoi le cas passerait
    // partout et ne verifierait rien.
    const avant = process.env.TZ;
    process.env.TZ = 'Asia/Singapore';
    try {
      assert.equal(jourCivil('2026-10-27 00:30:00', 'UTC'), '2026-10-27');
      assert.equal(
        jourCivil('2026-10-27 00:30:00', 'UTC'),
        jourCivil('2026-10-27T00:30:00.000Z', 'UTC'),
      );
    } finally {
      process.env.TZ = avant;
    }
  });

  test('une valeur illisible ne rend pas une fausse date', () => {
    // Rendre « aujourd hui » sur une entree illisible masquerait la
    // donnee fautive derriere une journee qui a l air normale.
    assert.equal(jourCivil('hier matin', 'UTC'), '');
  });
});

describe('appartenance a une journee', () => {
  test('un passage de 23 h 30 local appartient bien a ce jour-la', () => {
    // A Cotonou, 23 h 30 le 26 vaut 22 h 30 UTC le 26 : les deux
    // concordent. Le piege est a 00 h 30 local le 27, soit 23 h 30 UTC le
    // 26 — le cas suivant.
    assert.equal(dansLeJour('2026-10-26T22:30:00Z', '2026-10-26', 'Africa/Porto-Novo'), true);
  });

  test('un passage de 00 h 30 local appartient au jour SUIVANT', () => {
    // 23 h 30 UTC le 26 = 00 h 30 le 27 a Cotonou. Compte sur le jour UTC,
    // ce patient serait reste dans la file de la veille.
    const utc = '2026-10-26T23:30:00Z';
    assert.equal(dansLeJour(utc, '2026-10-27', 'Africa/Porto-Novo'), true);
    assert.equal(dansLeJour(utc, '2026-10-26', 'Africa/Porto-Novo'), false);
  });

  test('une date absente n appartient a aucun jour', () => {
    assert.equal(dansLeJour(null, '2026-10-27', 'UTC'), false);
    assert.equal(dansLeJour('   ', '2026-10-27', 'UTC'), false);
  });
});

describe('bornes de fenetre', () => {
  // Hors UTC a dessein : un decalage calcule sur l'heure locale tombe
  // juste tant qu'on reste a Greenwich, et faux partout ailleurs. Sous UTC
  // ces cas ne prouveraient rien.
  let avant;
  before(() => {
    avant = process.env.TZ;
    process.env.TZ = 'Africa/Porto-Novo';
  });
  after(() => {
    process.env.TZ = avant;
  });

  test('la veille et le lendemain franchissent les mois', () => {
    assert.equal(jourPrecedent('2026-03-01'), '2026-02-28');
    assert.equal(jourSuivant('2026-02-28'), '2026-03-01');
  });

  test('ils franchissent aussi une annee bissextile', () => {
    assert.equal(jourSuivant('2028-02-28'), '2028-02-29');
    assert.equal(jourPrecedent('2028-03-01'), '2028-02-29');
  });

  test('ils franchissent le nouvel an', () => {
    assert.equal(jourSuivant('2026-12-31'), '2027-01-01');
    assert.equal(jourPrecedent('2027-01-01'), '2026-12-31');
  });

  test('une entree illisible est rendue telle quelle', () => {
    assert.equal(jourSuivant('pas-une-date'), 'pas-une-date');
  });
});
