/**
 * Rapport mensuel de surveillance.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE :
 *
 *   - qu'un diagnostic ECARTE par le praticien ne soit jamais compte comme
 *     un cas. Le compter serait le contraire de ce qu'il a conclu, et le
 *     chiffre partirait vers le systeme national ;
 *   - qu'un diagnostic issu d'une consultation NON SIGNEE n'y entre pas :
 *     il peut etre une proposition de modele que personne n'a relue ;
 *   - que les cas confirmes et les cas suspects ne soient JAMAIS
 *     additionnes, ni dans le rapport, ni au moment de partir vers DHIS2.
 *     La distinction se perdrait a l'instant precis ou elle quitte
 *     l'etablissement, et nul en aval ne pourrait la retrouver ;
 *   - que le rapport dise combien de diagnostics il a laisses de cote. Un
 *     rapport qui ne le dit pas ne peut pas etre relu.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  caseDuRapport,
  construireRapport,
  periodeDhis2,
  versDhis2,
} from '../lib/interop/rapport-mensuel.ts';

const entree = (sur = {}) => ({
  certitude: 'confirmed',
  consultationSignee: true,
  cim10: 'B54',
  dataElement: 'PD_MAL_CONF',
  libelle: 'Cas de paludisme',
  ...sur,
});

describe('ce qui compte comme un cas', () => {
  test('un diagnostic confirme sur consultation signee est un cas confirme', () => {
    assert.equal(caseDuRapport({ certitude: 'confirmed', consultationSignee: true, cim10: 'B54' }), 'confirme');
  });

  test('un diagnostic suspecte est un cas suspect, pas un cas confirme', () => {
    assert.equal(caseDuRapport({ certitude: 'suspected', consultationSignee: true, cim10: 'B54' }), 'suspect');
  });

  test('un diagnostic ECARTE ne compte nulle part', () => {
    // Le compter serait le contraire de ce que le praticien a conclu.
    assert.equal(caseDuRapport({ certitude: 'ruled-out', consultationSignee: true, cim10: 'B54' }), null);
  });

  test('un diagnostic differentiel ne compte nulle part', () => {
    assert.equal(caseDuRapport({ certitude: 'differential', consultationSignee: true, cim10: 'B54' }), null);
  });

  test('aucune certitude ne sauve une consultation non signee', () => {
    for (const certitude of ['confirmed', 'suspected', 'differential', 'ruled-out']) {
      assert.equal(
        caseDuRapport({ certitude, consultationSignee: false, cim10: 'B54' }),
        null,
        `${certitude} non signe`,
      );
    }
  });
});

describe('construction du rapport', () => {
  test('confirmes et suspects sont comptes separement sur la meme ligne', () => {
    const r = construireRapport({
      periode: '202603',
      orgUnit: 'CSC',
      entrees: [
        entree({ certitude: 'confirmed' }),
        entree({ certitude: 'confirmed' }),
        entree({ certitude: 'suspected' }),
      ],
    });
    assert.equal(r.lignes.length, 1);
    assert.equal(r.lignes[0].confirmes, 2);
    assert.equal(r.lignes[0].suspects, 1);
  });

  test('le rapport ne propose aucun total melangeant les deux', () => {
    const r = construireRapport({
      periode: '202603',
      orgUnit: 'CSC',
      entrees: [entree({ certitude: 'confirmed' }), entree({ certitude: 'suspected' })],
    });
    assert.equal('total' in r.lignes[0], false);
    assert.equal('cas' in r.lignes[0], false);
  });

  test('les ecarts sont comptes et motives', () => {
    const r = construireRapport({
      periode: '202603',
      orgUnit: 'CSC',
      entrees: [
        entree(),
        entree({ consultationSignee: false }),
        entree({ certitude: 'differential' }),
        entree({ certitude: 'ruled-out' }),
        entree({ dataElement: '' }),
      ],
    });
    assert.equal(r.examines, 5);
    assert.equal(r.retenus, 1);
    assert.equal(r.ecartes.nonSignes, 1);
    assert.equal(r.ecartes.differentiels, 1);
    assert.equal(r.ecartes.ecartes, 1);
    assert.equal(r.ecartes.sansCodeSuivi, 1);
  });

  test('un rapport vide reste un rapport, pas une erreur', () => {
    const r = construireRapport({ periode: '202603', orgUnit: 'CSC', entrees: [] });
    assert.deepEqual(r.lignes, []);
    assert.equal(r.examines, 0);
    assert.equal(r.retenus, 0);
  });

  test('les lignes sortent dans un ordre stable', () => {
    const r = construireRapport({
      periode: '202603',
      orgUnit: 'CSC',
      entrees: [
        entree({ dataElement: 'PD_TB_PULM', libelle: 'Tuberculose' }),
        entree({ dataElement: 'PD_CHOLERA', libelle: 'Cholera' }),
        entree({ dataElement: 'PD_HIV', libelle: 'VIH' }),
      ],
    });
    assert.deepEqual(r.lignes.map((l) => l.dataElement), ['PD_CHOLERA', 'PD_HIV', 'PD_TB_PULM']);
  });
});

describe('depart vers DHIS2', () => {
  const rapport = () =>
    construireRapport({
      periode: '202603',
      orgUnit: 'CSC',
      entrees: [
        entree({ certitude: 'confirmed' }),
        entree({ certitude: 'confirmed' }),
        entree({ certitude: 'suspected' }),
      ],
    });

  test('confirmes et suspects partent dans deux elements distincts', () => {
    const d = versDhis2(rapport());
    const codes = d.dataValues.map((v) => v.dataElement).sort();
    assert.deepEqual(codes, ['PD_MAL_CONF_CONF', 'PD_MAL_CONF_SUSP']);
  });

  test('les valeurs ne sont pas fusionnees', () => {
    const d = versDhis2(rapport());
    const parCode = Object.fromEntries(d.dataValues.map((v) => [v.dataElement, v.value]));
    assert.equal(parCode.PD_MAL_CONF_CONF, '2');
    assert.equal(parCode.PD_MAL_CONF_SUSP, '1');
    // 3 ne doit apparaitre nulle part : ce serait la somme interdite.
    assert.equal(d.dataValues.some((v) => v.value === '3'), false);
  });

  test('une case a zero ne produit pas de ligne', () => {
    const r = construireRapport({
      periode: '202603',
      orgUnit: 'CSC',
      entrees: [entree({ certitude: 'confirmed' })],
    });
    const d = versDhis2(r);
    assert.equal(d.dataValues.length, 1);
    assert.equal(d.dataValues[0].dataElement, 'PD_MAL_CONF_CONF');
  });

  test('le commentaire dit laquelle des deux cases on lit', () => {
    const d = versDhis2(rapport());
    assert.ok(d.dataValues.every((v) => /confirmes|suspects/.test(v.comment)));
  });

  test('la periode est au format DHIS2', () => {
    assert.equal(periodeDhis2(2026, 3), '202603');
    assert.equal(periodeDhis2(2026, 12), '202612');
  });
});
