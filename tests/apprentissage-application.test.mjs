/**
 * Application des lecons apprises a une transcription neuve.
 *
 *   npm test
 *
 * La lecon est une SUBSTITUTION VOULUE, pas une orthographe acceptable de plus.
 * C'est la difference avec le lexique clinique, qui protege les formes qu'il
 * connait au lieu de les remplacer — une lecon glissee parmi ses variantes
 * serait inerte, elle protegerait la faute au lieu de la corriger.
 *
 * Ce qui est verifie ici tient surtout aux DEGATS a ne pas faire : remplacer
 * au milieu d'un mot, ecraser une majuscule, ou appliquer une lecon partielle
 * la ou une lecon plus longue s'applique.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { appliquerLecons } from '../lib/apprentissage/application.ts';

const L = (avant, apres) => ({ avant, apres });

describe('remplacement', () => {
  test('la forme apprise est remplacee, et le remplacement est declare', () => {
    const r = appliquerLecons('Je prescris de l arthemeter ce soir', [L('arthemeter', 'artemether')]);
    assert.equal(r.text, 'Je prescris de l artemether ce soir');
    assert.equal(r.corrections.length, 1);
    assert.equal(r.corrections[0].from, 'arthemeter');
    assert.equal(r.corrections[0].to, 'artemether');
  });

  test('rien n est corrige en silence : la position est rendue', () => {
    // Le praticien doit pouvoir voir ce qui a bouge, et ou.
    const r = appliquerLecons('Le paludysme est confirme', [L('paludysme', 'paludisme')]);
    assert.equal(r.text.slice(r.corrections[0].index, r.corrections[0].index + 9), 'paludisme');
  });

  test('toutes les occurrences sont traitees', () => {
    const r = appliquerLecons('paludysme puis paludysme', [L('paludysme', 'paludisme')]);
    assert.equal(r.text, 'paludisme puis paludisme');
    assert.equal(r.corrections.length, 2);
  });

  test('la majuscule d origine est conservee', () => {
    // « Arthemeter » en debut de phrase ne doit pas devenir « artemether ».
    const r = appliquerLecons('Arthemeter en debut de phrase', [L('arthemeter', 'artemether')]);
    assert.equal(r.text, 'Artemether en debut de phrase');
  });

  test('les accents ne font pas manquer la forme', () => {
    const r = appliquerLecons('une fievre tifoide', [L('tifoide', 'typhoide')]);
    assert.equal(r.text, 'une fievre typhoide');
  });

  test('une lecon de plusieurs mots fonctionne', () => {
    const r = appliquerLecons('le test rapide palu est positif', [L('test rapide palu', 'TDR paludisme')]);
    assert.equal(r.text, 'le TDR paludisme est positif');
  });
});

describe('degats a ne pas faire', () => {
  test('jamais au milieu d un mot', () => {
    // Sans frontiere de mot, « palu » apprise transformerait « paludisme » en
    // « paludismedisme ». C est le degat le plus facile a commettre.
    const r = appliquerLecons('le paludisme grave', [L('palu', 'paludisme')]);
    assert.equal(r.text, 'le paludisme grave');
    assert.equal(r.corrections.length, 0);
  });

  test('un mot isole identique est bien pris, lui', () => {
    const r = appliquerLecons('un palu simple', [L('palu', 'paludisme')]);
    assert.equal(r.text, 'un paludisme simple');
  });

  test('la lecon la plus longue passe avant celle qui en fait partie', () => {
    // Sinon « palu » couperait « palu grave » et la seconde lecon ne trouverait
    // plus rien a corriger. Les deux cibles sont volontairement differentes :
    // avec des cibles voisines, le resultat serait le meme dans les deux ordres
    // et le test ne prouverait rien.
    const r = appliquerLecons('un palu grave', [L('palu', 'acces palustre'), L('palu grave', 'paludisme grave')]);
    assert.equal(r.text, 'un paludisme grave');
    assert.equal(r.corrections.length, 1);
  });

  test('une lecon qui ne change rien est ignoree', () => {
    const r = appliquerLecons('le paludisme', [L('paludisme', 'Paludisme')]);
    assert.equal(r.corrections.length, 0);
  });

  test('un texte vide ou sans lecon ressort intact', () => {
    assert.equal(appliquerLecons('', [L('a', 'b')]).text, '');
    assert.equal(appliquerLecons('un texte', []).text, 'un texte');
    assert.equal(appliquerLecons('un texte', []).corrections.length, 0);
  });

  test('un caractere special dans la lecon ne casse pas la recherche', () => {
    // Une forme apprise peut contenir une parenthese ou un point : elle doit
    // etre traitee comme du TEXTE, pas comme une expression reguliere. Une
    // parenthese non echappee ouvrirait un groupe de capture, decalerait les
    // arguments du remplacement, et corromprait le texte du praticien.
    const r = appliquerLecons('une perf (iv) ce matin', [L('perf (iv)', 'perfusion intraveineuse')]);
    assert.equal(r.text, 'une perfusion intraveineuse ce matin');
    assert.equal(r.corrections[0].from, 'perf (iv)');
  });

  test('un point dans la lecon ne joue pas le joker', () => {
    // Un point non echappe accepterait n importe quel caractere : « c.a.s »
    // attraperait « cXaYs », et remplacerait du texte qui n a rien a voir.
    const r = appliquerLecons('prendre 1 cXaYs le matin', [L('c.a.s', 'cuillere a soupe')]);
    assert.equal(r.text, 'prendre 1 cXaYs le matin', 'le point ne doit pas se comporter en joker');
  });
});
