/**
 * Ce que l application apprend des corrections du praticien.
 *
 *   npm test
 *
 * L'enjeu de ces tests n'est pas d'apprendre beaucoup : c'est de N'APPRENDRE
 * QUE CE QUI SE GENERALISE. Une lecon retenue a tort s'appliquerait en silence
 * a toutes les consultations suivantes, sans que rien ne la signale — le
 * praticien relirait un texte deja abime. La moitie de ces cas verifie donc ce
 * que le module REFUSE d'apprendre.
 *
 * Le module evalue est pur : il est teste tel qu'il tourne.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { couplesCorriges, regrouper, normaliser } from '../lib/apprentissage/corrections.ts';

const couples = (a, b) => couplesCorriges(a, b).map((c) => `${c.avant}>${c.apres}`);

describe('ce qui merite d etre appris', () => {
  test('une molecule mal entendue est retenue', () => {
    // Le gisement d erreurs le plus couteux : une molecule mal transcrite
    // devient une ligne d ordonnance.
    assert.deepEqual(
      couples(
        'Je prescris de l arthemeter lumefantrine deux fois par jour',
        'Je prescris de l artemether lumefantrine deux fois par jour',
      ),
      ['arthemeter>artemether'],
    );
  });

  test('plusieurs corrections dans la meme phrase sont toutes vues', () => {
    const c = couples(
      'Le paludysme est confirme par le TDR palu',
      'Le paludisme est confirme par le TDR paludisme',
    );
    assert.equal(c.length, 2);
    assert.ok(c.includes('paludysme>paludisme'));
    assert.ok(c.includes('palu>paludisme'));
  });

  test('une correction de deux mots est retenue', () => {
    assert.deepEqual(
      couples('Il a une fievre tifoide depuis peu', 'Il a une fievre typhoide depuis peu'),
      ['tifoide>typhoide'],
    );
  });

  test('le contexte accompagne le couple, pour qu un relecteur juge sans rouvrir le dossier', () => {
    const [c] = couplesCorriges(
      'Le patient prend du paracetamole depuis hier soir',
      'Le patient prend du paracetamol depuis hier soir',
    );
    assert.ok(c.contexte.includes('paracetamol'));
    assert.ok(c.contexte.includes('depuis'), 'le contexte doit porter les mots qui suivent');
  });
});

describe('ce qu il ne faut surtout pas apprendre', () => {
  test('un chiffre qui change n est jamais retenu', () => {
    // Une posologie, une temperature, un age : ce sont des DONNEES de patient.
    // Les apprendre replaquerait la valeur d un patient sur les suivants.
    assert.deepEqual(couples('Sa temperature est a 38,2 degres', 'Sa temperature est a 39,2 degres'), []);
    assert.deepEqual(couples('paracetamol 250 milligrammes', 'paracetamol 500 milligrammes'), []);
  });

  test('une reecriture de phrase n est pas une correction de terme', () => {
    // Au-dela de quelques mots, c est une tournure propre a UNE consultation.
    assert.deepEqual(
      couples(
        'Il faudrait revenir me voir assez rapidement pour un controle',
        'Revenez me voir dans trois jours pour un controle',
      ),
      [],
    );
  });

  test('une difference de casse ou d accent n apprend rien', () => {
    assert.deepEqual(couples('le Paludisme est confirme', 'le paludisme est confirme'), []);
    assert.deepEqual(couples('la fievre typhoide', 'la fievre typhoïde'), []);
  });

  test('un ajout pur n est pas une substitution', () => {
    // Le praticien a complete, il n a rien corrige : il n y a pas de « avant ».
    assert.deepEqual(couples('Le patient tousse', 'Le patient tousse beaucoup la nuit'), []);
  });

  test('une suppression pure non plus', () => {
    assert.deepEqual(couples('Le patient tousse beaucoup la nuit', 'Le patient tousse'), []);
  });

  test('un mot trop court est ecarte', () => {
    // « a » -> « la » n est pas distinctif : l appliquer partout ferait des
    // degats sans rien apporter.
    assert.deepEqual(couples('il a mal', 'il la mal'), []);
  });

  test('deux textes identiques n apprennent rien', () => {
    assert.deepEqual(couples('Le paludisme est confirme', 'Le paludisme est confirme'), []);
  });

  test('un texte vide ne fait pas tomber le module', () => {
    assert.deepEqual(couples('', 'quelque chose'), []);
    assert.deepEqual(couples('quelque chose', ''), []);
  });
});

describe('regroupement', () => {
  test('une meme faute corrigee trois fois reste un seul enseignement', () => {
    // Sinon elle franchirait le seuil de confirmation a elle seule, alors que
    // rien ne dit qu elle se reproduira dans une autre consultation.
    const c = couplesCorriges(
      'le paludysme puis le paludysme et encore le paludysme',
      'le paludisme puis le paludisme et encore le paludisme',
    );
    assert.ok(c.length >= 2, 'le diff doit bien voir plusieurs occurrences');
    assert.equal(regrouper(c).length, 1);
  });

  test('deux corrections differentes restent deux', () => {
    const c = regrouper([
      { avant: 'palu', apres: 'paludisme', contexte: '' },
      { avant: 'tifoide', apres: 'typhoide', contexte: '' },
    ]);
    assert.equal(c.length, 2);
  });
});

describe('normalisation', () => {
  test('la casse, les accents et la ponctuation sont ignores pour comparer', () => {
    assert.equal(normaliser('Paludisme,'), normaliser('paludisme'));
    assert.equal(normaliser('typhoïde'), normaliser('typhoide'));
  });
});
