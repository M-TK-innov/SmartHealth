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

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { minutesEntre, versIso, versIsoRequis } from '../lib/temps.ts';

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
    for (const fuseau of ['Africa/Porto-Novo', 'UTC', 'America/New_York', 'Asia/Singapore']) {
      process.env.TZ = fuseau;
      const sqlite = new Date(versIso('2026-10-26 04:26:27')).getTime();
      const iso = new Date('2026-10-26T04:26:27Z').getTime();
      assert.equal(sqlite, iso, `desaccord sous ${fuseau}`);
    }
    process.env.TZ = 'UTC';
  });

  test('sans normalisation, l ecart est bien celui du fuseau', () => {
    // On verifie que le defaut EXISTE : sinon ce fichier protegerait
    // quelque chose qui n a jamais ete casse, et personne ne saurait
    // pourquoi la normalisation est la.
    process.env.TZ = 'Africa/Porto-Novo';
    const brut = new Date('2026-10-26 04:26:27').getTime();
    const correct = new Date('2026-10-26T04:26:27Z').getTime();
    assert.equal(
      (correct - brut) / 60_000,
      60,
      'a Cotonou, lire la forme SQLite sans marqueur coute une heure',
    );
    process.env.TZ = 'UTC';
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
