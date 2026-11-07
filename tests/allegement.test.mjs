/**
 * Compteur d'allegement administratif.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE :
 *
 *   - qu'un fait constate et une deduction ne soient JAMAIS additionnes.
 *     C'est l'invariant central : un chiffre qui melange une mesure et une
 *     hypothese se fait demolir a la premiere question, et emporte le reste
 *     du dossier avec lui ;
 *   - qu'une information presente en base mais jamais presentee au soignant
 *     ne compte pas. Elle mesurerait le remplissage de la base, pas le
 *     service rendu ;
 *   - que la formulation ne surjoue pas : « resultats anterieurs
 *     disponibles » et non « examens evites ».
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIBELLES,
  NATURES,
  TYPES,
  agreger,
  formuler,
  qualifie,
} from '../lib/allegement/mesure.ts';

const candidat = (sur = {}) => ({
  type: 'resultat-anterieur-presente',
  disponible: true,
  presentee: true,
  quantite: 1,
  ...sur,
});

describe('ce qui merite d etre compte', () => {
  test('disponible et presentee : on compte', () => {
    assert.equal(qualifie(candidat()), true);
  });

  test('disponible mais jamais presentee : on ne compte pas', () => {
    // Sinon on mesure le remplissage de la base, pas l'allegement.
    assert.equal(qualifie(candidat({ presentee: false })), false);
  });

  test('presentee sans etre disponible : incoherent, donc refuse', () => {
    assert.equal(qualifie(candidat({ disponible: false })), false);
  });

  test('ni l un ni l autre : refuse', () => {
    assert.equal(qualifie(candidat({ disponible: false, presentee: false })), false);
  });

  test('une quantite nulle ou negative est refusee', () => {
    assert.equal(qualifie(candidat({ quantite: 0 })), false);
    assert.equal(qualifie(candidat({ quantite: -3 })), false);
  });

  test('une quantite non entiere est refusee', () => {
    assert.equal(qualifie(candidat({ quantite: 1.5 })), false);
  });

  test('un type inconnu est refuse', () => {
    assert.equal(qualifie(candidat({ type: 'economies-realisees' })), false);
  });
});

describe('la frontiere entre constate et infere', () => {
  test('chaque type declare sa nature, sans exception', () => {
    for (const t of TYPES) {
      assert.ok(['constate', 'infere'].includes(NATURES[t]), `${t} sans nature`);
    }
  });

  test('ce qui suppose un contrefactuel est infere, jamais constate', () => {
    // On n observe pas ce qui se serait passe sans l outil.
    assert.equal(NATURES['resultat-anterieur-presente'], 'infere');
    assert.equal(NATURES['antecedent-non-redemande'], 'infere');
  });

  test('ce dont le systeme est temoin direct est constate', () => {
    assert.equal(NATURES['consultation-a-distance'], 'constate');
    assert.equal(NATURES['rapport-produit-sans-ressaisie'], 'constate');
  });

  test('le resume ne propose AUCUN total general', () => {
    const r = agreger([
      { type: 'consultation-a-distance', quantite: 10 },
      { type: 'resultat-anterieur-presente', quantite: 90 },
    ]);
    assert.equal(r.totalConstate, 10);
    assert.equal(r.totalInfere, 90);
    // Le total de 100 ne doit exister nulle part : il melangerait un fait
    // et une hypothese, et c'est ce nombre-la qui serait cite partout.
    assert.equal('total' in r, false);
    assert.equal(Object.values(r).includes(100), false);
  });

  test('les deux familles restent separees dans le resume', () => {
    const r = agreger([
      { type: 'consultation-a-distance', quantite: 4 },
      { type: 'antecedent-non-redemande', quantite: 7 },
    ]);
    assert.deepEqual(r.constate.map((l) => l.type), ['consultation-a-distance']);
    assert.deepEqual(r.infere.map((l) => l.type), ['antecedent-non-redemande']);
  });
});

describe('agregation', () => {
  test('les quantites d un meme type s additionnent', () => {
    const r = agreger([
      { type: 'consultation-a-distance', quantite: 3 },
      { type: 'consultation-a-distance', quantite: 5 },
    ]);
    assert.equal(r.totalConstate, 8);
    assert.equal(r.constate.length, 1);
  });

  test('un type absent ne cree pas de ligne a zero', () => {
    const r = agreger([{ type: 'consultation-a-distance', quantite: 1 }]);
    assert.equal(r.infere.length, 0);
  });

  test('les entrees aberrantes sont ignorees, pas comptees de travers', () => {
    const r = agreger([
      { type: 'consultation-a-distance', quantite: 5 },
      { type: 'inconnu', quantite: 1000 },
      { type: 'consultation-a-distance', quantite: 0 },
      { type: 'consultation-a-distance', quantite: -2 },
      { type: 'consultation-a-distance', quantite: 2.5 },
    ]);
    assert.equal(r.totalConstate, 5);
  });

  test('aucun evenement donne un resume vide, pas une erreur', () => {
    const r = agreger([]);
    assert.equal(r.totalConstate, 0);
    assert.equal(r.totalInfere, 0);
    assert.deepEqual(r.constate, []);
  });
});

describe('la formulation ne surjoue pas', () => {
  test('on ne parle jamais d examens evites', () => {
    const phrases = formuler(
      agreger([{ type: 'resultat-anterieur-presente', quantite: 412 }]),
    ).join(' ');
    assert.doesNotMatch(phrases, /examens? evit/i);
    assert.match(phrases, /disponibles/i);
    assert.match(phrases, /412/);
  });

  test('toute ligne deduite est marquee SUR LA LIGNE, pas ailleurs', () => {
    // Premiere version de ce test : elle cherchait « deduit » n'importe ou
    // dans les phrases. La reserve finale contient ce mot, si bien que le
    // test passait meme quand la ligne perdait son marqueur. Une mutation
    // l'a montre en survivant.
    const phrases = formuler(agreger([{ type: 'antecedent-non-redemande', quantite: 9 }]));
    const ligne = phrases.find((p) => p.includes('9'));
    assert.ok(ligne, 'la ligne chiffree doit exister');
    assert.match(ligne, /deduit/i);
  });

  test('une ligne constatee n est pas marquee comme deduite', () => {
    const p = formuler(agreger([{ type: 'consultation-a-distance', quantite: 2 }]))[0];
    assert.match(p, /constate/i);
    assert.doesNotMatch(p, /deduit/i);
  });

  test('la reserve sur le contrefactuel est toujours rappelee', () => {
    const phrases = formuler(agreger([{ type: 'consultation-a-distance', quantite: 1 }])).join(' ');
    assert.match(phrases, /ne peut pas savoir ce qui se serait passe/i);
  });

  test('sans evenement, on le dit plutot que d afficher des zeros', () => {
    assert.deepEqual(formuler(agreger([])), ['Aucun allegement mesure sur la periode.']);
  });
});

describe('restitution', () => {
  test('chaque type a un libelle lisible', () => {
    for (const t of TYPES) {
      assert.ok(LIBELLES[t] && LIBELLES[t].length > 10, `${t} sans libelle`);
    }
  });
});
