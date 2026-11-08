/**
 * Validation et depouillement de l'enquete usagers.
 *
 *   npm test
 *
 * Ce module garde une route PUBLIQUE, appelee depuis une page que nous
 * n'hebergeons pas. Les tests ci-dessous valent donc moins pour ce qu'ils
 * acceptent que pour ce qu'ils refusent.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAMPS_LIBRES,
  CLES,
  QUESTIONS,
  depouiller,
  nettoyerTexte,
  valider,
} from '../lib/enquete/questionnaire.ts';

describe('declaration du questionnaire', () => {
  test('aucune cle en double', () => {
    assert.equal(new Set(CLES).size, CLES.length);
  });

  test('aucune option en double dans une question', () => {
    for (const q of QUESTIONS) {
      const valeurs = q.options.map((o) => o.valeur);
      assert.equal(new Set(valeurs).size, valeurs.length, q.cle);
    }
  });

  test('toute question a au moins deux options', () => {
    for (const q of QUESTIONS) assert.ok(q.options.length >= 2, q.cle);
  });

  test('LES CLES DEJA EN BASE NE BOUGENT PLUS, quel que soit leur numero', () => {
    // LE PIEGE QUE CE TEST FERME. Une question inseree au milieu donne envie
    // de renumeroter les cles pour « faire propre ». Les reponses deja
    // enregistrees seraient alors relues sous une autre question : un examen
    // redemande deviendrait une assurance appliquee, sans que rien ne plante
    // ni qu aucun total ne paraisse anormal.
    //
    // La cle se conserve, le numero s affiche. Les deux n ont aucune raison
    // de coincider, et ce test interdit de les faire coincider apres coup.
    const attendu = {
      q1: 'Carnet de sante lors de la derniere visite',
      q2: 'Informations deja donnees et redemandees',
      q3: 'Documents a apporter ou presenter',
      q4: 'Examen redemande faute de resultat sous la main',
      q5: 'Deplacement uniquement pour un papier',
      q6: 'Ordonnances et factures consultables sur le telephone',
    };
    for (const [cle, intitule] of Object.entries(attendu)) {
      const q = QUESTIONS.find((x) => x.cle === cle);
      assert.ok(q, `la cle ${cle} a disparu : les reponses deja en base deviendraient illisibles`);
      assert.equal(q.intitule, intitule, `${cle} ne porte plus la meme question`);
    }
  });

  test('une question ajoutee prend une cle neuve, jamais une cle liberee', () => {
    // Recycler une cle est pire que la supprimer : les anciennes reponses se
    // melangent aux nouvelles sans laisser de trace.
    const cles = QUESTIONS.map((q) => q.cle);
    assert.ok(cles.includes('q7'), "l assurance sante doit porter sa propre cle");
    assert.ok(cles.includes('a6'), "la verification des droits doit porter sa propre cle");
    // `a5` est un champ libre : aucune question ne doit le reprendre.
    assert.equal(cles.includes('a5'), false);
  });

  test('les numeros affiches se suivent, sans trou ni doublon', () => {
    const usagers = QUESTIONS.filter((q) => q.groupe === 'usager').map((q) => Number(q.numero));
    assert.deepEqual(usagers, [1, 2, 3, 4, 5, 6, 7]);
  });

  test('le centre ne vaut pas, a lui seul, une reponse', () => {
    const centre = CHAMPS_LIBRES.find((c) => c.cle === 'centre');
    assert.equal(centre.compteCommeReponse, false);
  });
});

describe('validation', () => {
  test('accepte une reponse usager ordinaire', () => {
    const v = valider({ q1: 'oublie', q2: 'partie', centre: 'CS Calavi' });
    assert.equal(v.ok, true);
    assert.equal(v.resultat.q1, 'oublie');
    assert.equal(v.resultat.centre, 'CS Calavi');
    // Les cles non envoyees existent quand meme, a null : l'insertion les
    // attend toutes, et une cle absente deviendrait un `undefined` en base.
    assert.equal(v.resultat.a1, null);
    for (const cle of CLES) assert.ok(cle in v.resultat, cle);
  });

  test('refuse une option qui ne figure pas au questionnaire', () => {
    assert.equal(valider({ q1: 'peut-etre' }).ok, false);
  });

  test('refuse une cle inconnue plutot que de l ignorer', () => {
    const v = valider({ q1: 'avait', role: 'admin' });
    assert.equal(v.ok, false);
    assert.match(v.motif, /role/);
  });

  test('refuse un formulaire sans aucune reponse', () => {
    assert.equal(valider({}).ok, false);
    assert.equal(valider({ centre: 'CS Calavi' }).ok, false);
    assert.equal(valider({ q1: '', q2: null }).ok, false);
  });

  test('refuse autre chose qu un objet', () => {
    for (const charge of [null, 'q1=avait', 42, ['q1'], undefined]) {
      assert.equal(valider(charge).ok, false, String(charge));
    }
  });

  test('refuse une valeur non textuelle sur une question', () => {
    assert.equal(valider({ q1: ['avait'] }).ok, false);
    assert.equal(valider({ q1: { valeur: 'avait' } }).ok, false);
  });

  test('refuse un texte libre trop long, sans le tronquer', () => {
    const v = valider({ q1: 'avait', libre: 'x'.repeat(201) });
    assert.equal(v.ok, false);
    // Si la regle devenait une troncature, ce test tomberait : c'est bien
    // le refus que l'on veut, pas une phrase coupee attribuee a quelqu'un.
    assert.match(v.motif, /200/);
  });

  test('accepte un texte libre a la limite exacte', () => {
    const v = valider({ libre: 'x'.repeat(200) });
    assert.equal(v.ok, true);
    assert.equal(v.resultat.libre.length, 200);
  });

  test('un texte libre seul suffit comme reponse', () => {
    assert.equal(valider({ libre: 'Trop de papiers.' }).ok, true);
    assert.equal(valider({ a5: 'Moins de registres.' }).ok, true);
  });

  test('les caracteres de controle disparaissent du texte libre', () => {
    const v = valider({ libre: 'deux\u0000lignes\nici' });
    assert.equal(v.ok, true);
    assert.equal(v.resultat.libre, 'deux lignes ici');
  });

  test('un texte libre reduit a des espaces vaut une absence', () => {
    const v = valider({ q1: 'avait', libre: '   \u0000 ' });
    assert.equal(v.ok, true);
    assert.equal(v.resultat.libre, null);
  });

  test('nettoyerTexte resserre les espaces et coupe les bords', () => {
    assert.equal(nettoyerTexte('  CS   Calavi  '), 'CS Calavi');
  });
});

describe('depouillement', () => {
  const lignes = [
    { q1: 'oublie', q2: 'tout', a1: 'deux' },
    { q1: 'oublie', q2: null },
    { q1: 'avait' },
    { q1: 'option-retiree' },
  ];

  test('chaque question a sa propre base', () => {
    const d = depouiller(lignes);
    const q1 = d.find((x) => x.cle === 'q1');
    const q2 = d.find((x) => x.cle === 'q2');
    const a1 = d.find((x) => x.cle === 'a1');
    // q1 : trois valeurs connues sur quatre lignes, la quatrieme etant une
    // option qui n'existe plus au questionnaire.
    assert.equal(q1.exprimees, 3);
    assert.equal(q2.exprimees, 1);
    assert.equal(a1.exprimees, 1);
  });

  test('une valeur hors liste n est pas inventee dans les decomptes', () => {
    const q1 = depouiller(lignes).find((x) => x.cle === 'q1');
    const somme = q1.decomptes.reduce((t, d) => t + d.nombre, 0);
    assert.equal(somme, q1.exprimees);
    assert.ok(!q1.decomptes.some((d) => d.valeur === 'option-retiree'));
  });

  test('toutes les options paraissent, y compris a zero', () => {
    const q1 = depouiller(lignes).find((x) => x.cle === 'q1');
    assert.equal(q1.decomptes.length, 5);
    assert.equal(q1.decomptes.find((d) => d.valeur === 'plein').nombre, 0);
  });

  test('sur rien, tout vaut zero et rien ne divise par zero', () => {
    for (const q of depouiller([])) {
      assert.equal(q.exprimees, 0);
      for (const d of q.decomptes) assert.equal(d.nombre, 0);
    }
  });
});
