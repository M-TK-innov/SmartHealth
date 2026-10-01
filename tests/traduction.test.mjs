/**
 * Tests de l etage de traduction.
 *
 *   npm test
 *
 * Ce qui est verifie ici n'est pas la qualite d'une traduction — elle depend du
 * modele declare par la structure, et elle n'a pas ete evaluee sur des
 * consultations reelles. C'est la REGLE DE COMPOSITION : quelle phrase le
 * medecin relit, et surtout quelle phrase reste a cote pour qu'il puisse
 * verifier. Une negation inversee par la traduction n'est rattrapable nulle
 * part ailleurs dans la chaine.
 *
 * Le module evalue est pur : il est teste tel qu'il tourne.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { doitTraduire, estFrancais, resoudreSortie } from '../lib/transcription/traduction.ts';

const FON = 'Un se do wutu ce me';
const FR = "J'ai de la fievre depuis trois jours";

describe('quand demander une traduction', () => {
  test('une consultation en fon sur Griot : oui', () => {
    assert.equal(doitTraduire('griot', 'fon'), true);
  });

  test('une consultation en francais : non, il n y a rien a traduire', () => {
    // Traduire du francais vers le francais ferait un aller-retour de modele
    // pour reecrire une phrase correcte — avec le risque de l abimer.
    assert.equal(doitTraduire('griot', 'fr'), false);
    assert.equal(doitTraduire('griot', 'fr-FR'), false);
  });

  test('Whisper ne traduit pas, quelle que soit la langue', () => {
    assert.equal(doitTraduire('whisper', 'fon'), false);
  });

  test('le code de langue est lu sur deux lettres, casse comprise', () => {
    assert.equal(estFrancais('FR-CA'), true);
    assert.equal(estFrancais('fon'), false);
    assert.equal(estFrancais(''), false);
  });
});

describe('ce que le medecin relit, et ce qui reste a cote', () => {
  test('traduit : le francais est affiche, le fon est conserve', () => {
    const s = resoudreSortie({ brut: FON, traduction: FR, langueParlee: 'fon' });
    assert.equal(s.text, FR, 'le medecin doit lire le francais');
    assert.equal(s.language, 'fr');
    assert.equal(s.translated, true);
    // Le point qui compte : la phrase prononcee ne disparait pas. Sans elle,
    // une negation inversee par la traduction serait invisible et irrattrapable.
    assert.equal(s.sourceText, FON);
    assert.equal(s.sourceLanguage, 'fon');
  });

  test('sans traduction : la transcription passe telle quelle', () => {
    const s = resoudreSortie({ brut: FON, traduction: '', langueParlee: 'fon' });
    assert.equal(s.text, FON);
    assert.equal(s.language, 'fon');
    assert.equal(s.translated, false);
    assert.equal(s.sourceText, null);
  });

  test('traduction absente : on rend le fon plutot que rien', () => {
    // Un service sans modele de traduction, ou une traduction en echec, ne doit
    // pas faire perdre la parole du patient : elle est irremplacable, la
    // traduction ne l est pas.
    const s = resoudreSortie({ brut: FON, traduction: null, langueParlee: 'fon' });
    assert.equal(s.text, FON);
    assert.equal(s.translated, false);
  });

  test('une traduction identique a la source n en est pas une', () => {
    // Sinon l ecran afficherait deux fois la meme phrase, et annoncerait une
    // traduction la ou il n y en a pas eu.
    const s = resoudreSortie({ brut: FON, traduction: FON, langueParlee: 'fon' });
    assert.equal(s.translated, false);
    assert.equal(s.sourceText, null);
  });

  test('les espaces de bord ne creent pas une fausse traduction', () => {
    const s = resoudreSortie({ brut: `  ${FON}  `, traduction: `${FON}\n`, langueParlee: 'fon' });
    assert.equal(s.translated, false);
    assert.equal(s.text, FON);
  });

  test('un extrait vide reste vide, sans se declarer traduit', () => {
    const s = resoudreSortie({ brut: '', traduction: '', langueParlee: 'fon' });
    assert.equal(s.text, '');
    assert.equal(s.translated, false);
  });
});
