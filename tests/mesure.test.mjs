/**
 * Le compteur lui-meme.
 *
 *   npm test
 *
 * Les tests sur corpus (attribution-corpus.test.mjs) ne peuvent pas eprouver le
 * classement des erreurs : il n'y a aujourd'hui aucune confusion
 * medecin/non-medecin a classer, donc un classement casse y passerait inapercu
 * — et l'invariant deviendrait un test qui ne mesure plus rien.
 *
 * On lui donne donc des cas fabriques, ou l'erreur attendue est connue
 * d'avance. C'est le seul endroit du dossier ou des tours ne viennent pas d'une
 * consultation : ici on teste l'instrument, pas la detection.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mesurer } from '../lib/ai/mesure.ts';

/** Textes dont l'attribution reelle est stable et connue. */
const QUESTION_MEDECIN = 'Est-ce que vous avez de la fievre depuis longtemps ?';
const PLAINTE_PATIENT = 'Docteur, j ai mal au ventre depuis hier.';
const RECIT_ACCOMPAGNANT = 'Il a le corps chaud depuis trois jours, et il ne mange plus.';

describe('classement des erreurs d attribution', () => {
  test('medecin pris pour un patient : confusion de ROLE', () => {
    // On annote une question de medecin comme venant du patient : la detection
    // repondra « clinician », donc l ecart est medecin/non-medecin.
    const m = mesurer([{ seq: 1, gold: 'patient', text: QUESTION_MEDECIN }]);
    assert.equal(m.fausses, 1);
    assert.equal(m.confusionsRole, 1, 'un ecart medecin/non-medecin doit compter comme role');
    assert.equal(m.confusionsEntourage, 0);
    assert.equal(m.ecarts[0].classe, 'role');
  });

  test('patient pris pour un accompagnant : confusion d ENTOURAGE', () => {
    // Les deux sont du cote de celui qui consulte : l enonce ne change pas de
    // nature, et c est ce qui distingue cette erreur de la precedente.
    const m = mesurer([{ seq: 1, gold: 'patient', text: RECIT_ACCOMPAGNANT }]);
    assert.equal(m.fausses, 1);
    assert.equal(m.confusionsRole, 0, 'patient et accompagnant sont du meme cote');
    assert.equal(m.confusionsEntourage, 1);
    assert.equal(m.ecarts[0].classe, 'entourage');
  });

  test('accompagnant pris pour un medecin : confusion de ROLE aussi', () => {
    // Le sens compte dans les deux directions : attribuer au medecin des mots
    // qu il n a pas dits est aussi grave que l inverse.
    const m = mesurer([{ seq: 1, gold: 'companion', text: QUESTION_MEDECIN }]);
    assert.equal(m.confusionsRole, 1);
  });

  test('les deux classes s additionnent sans se recouvrir', () => {
    const m = mesurer([
      { seq: 1, gold: 'patient', text: QUESTION_MEDECIN }, // role
      { seq: 2, gold: 'patient', text: RECIT_ACCOMPAGNANT }, // entourage
      { seq: 3, gold: 'clinician', text: QUESTION_MEDECIN }, // juste
    ]);
    assert.equal(m.confusionsRole + m.confusionsEntourage, m.fausses);
    assert.equal(m.correctes, 1);
  });
});

describe('comptage', () => {
  test('un tour juste ne compte nulle part ailleurs', () => {
    const m = mesurer([{ seq: 1, gold: 'clinician', text: QUESTION_MEDECIN }]);
    assert.deepEqual(
      { correctes: m.correctes, fausses: m.fausses, indeterminees: m.indeterminees },
      { correctes: 1, fausses: 0, indeterminees: 0 },
    );
    assert.equal(m.couverture, 1);
    assert.equal(m.precision, 1);
  });

  test('un tour sans indice est un trou, pas une faute', () => {
    // La distinction est le coeur du dispositif : un trou se voit et se
    // corrige, une faute passe.
    const m = mesurer([{ seq: 1, gold: 'patient', text: 'Bon.' }]);
    assert.equal(m.indeterminees, 1);
    assert.equal(m.fausses, 0);
    assert.equal(m.couverture, 0);
  });

  test('un corpus vide ne rend pas une precision de 100 %', () => {
    // Une division par zero qui rendrait 1 laisserait croire a un systeme
    // parfait la ou il n a rien fait.
    const m = mesurer([]);
    assert.equal(m.precision, 0);
    assert.equal(m.couverture, 0);
  });

  test('la plainte a la premiere personne est bien attribuee au patient', () => {
    // Garde-fou du jeu d essai lui-meme : si ce texte cessait d etre reconnu,
    // les cas ci-dessus mesureraient autre chose que ce qu ils annoncent.
    const m = mesurer([{ seq: 1, gold: 'patient', text: PLAINTE_PATIENT }]);
    assert.equal(m.correctes, 1, 'le texte temoin doit rester attribue au patient');
  });
});
