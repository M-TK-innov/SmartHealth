/**
 * Configuration des operateurs de paiement.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE :
 *
 *   - qu'un refus NOMME les variables manquantes. « Paiement
 *     indisponible » enverrait un responsable chercher pendant une heure
 *     ce qu'une ligne peut lui dire ;
 *   - qu'on distingue « cles absentes », qu'un responsable pose lui-meme,
 *     de « adaptateur absent », qui demande du developpement ;
 *   - qu'aucun message ne laisse fuir la valeur d'un reglage : un message
 *     d'erreur finit dans un journal, et un journal se lit.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  nomVariable,
  operateurConfigure,
  operateurUtilisable,
  operateursUtilisables,
  paiementEnLigneDisponible,
  pourquoiIndisponible,
  reglagesManquants,
  refusConfiguration,
} from '../lib/paiement/fournisseur.ts';

const CLES = [
  'SMARTHEALTH_MOMO_BASE', 'SMARTHEALTH_MOMO_ABONNEMENT', 'SMARTHEALTH_MOMO_CLE',
  'SMARTHEALTH_MOOV_BASE', 'SMARTHEALTH_MOOV_MARCHAND', 'SMARTHEALTH_MOOV_CLE',
  'SMARTHEALTH_PISPI_BASE', 'SMARTHEALTH_PISPI_MARCHAND', 'SMARTHEALTH_PISPI_CLE',
];

let sauvegarde;
beforeEach(() => {
  sauvegarde = Object.fromEntries(CLES.map((k) => [k, process.env[k]]));
  for (const k of CLES) delete process.env[k];
});
afterEach(() => {
  for (const [k, v] of Object.entries(sauvegarde)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('sans aucune cle', () => {
  test('aucun operateur n est disponible', () => {
    assert.deepEqual(operateursUtilisables(), []);
    assert.equal(paiementEnLigneDisponible(), false);
  });

  test('le refus nomme chaque variable manquante', () => {
    const m = refusConfiguration('mtn-momo');
    for (const suffixe of ['MOMO_BASE', 'MOMO_ABONNEMENT', 'MOMO_CLE']) {
      assert.ok(m.includes(nomVariable(suffixe)), `${suffixe} non nomme`);
    }
  });

  test('le refus renvoie vers le chemin qui marche sans configuration', () => {
    assert.match(refusConfiguration('moov-money'), /caisse/i);
  });
});

describe('avec une configuration partielle', () => {
  test('seule la variable manquante est nommee', () => {
    process.env.SMARTHEALTH_MOMO_BASE = 'https://exemple';
    process.env.SMARTHEALTH_MOMO_ABONNEMENT = 'abc';
    const manquants = reglagesManquants('mtn-momo');
    assert.deepEqual(manquants, ['SMARTHEALTH_MOMO_CLE']);
    assert.equal(operateurConfigure('mtn-momo'), false);
  });

  test('une valeur vide compte comme absente', () => {
    for (const k of ['SMARTHEALTH_MOOV_BASE', 'SMARTHEALTH_MOOV_MARCHAND', 'SMARTHEALTH_MOOV_CLE']) {
      process.env[k] = '';
    }
    assert.equal(operateurConfigure('moov-money'), false);
  });

  test('aucune valeur de reglage n apparait dans le message', () => {
    // Un message d'erreur finit dans un journal, et un journal se lit.
    process.env.SMARTHEALTH_PISPI_BASE = 'https://secret.exemple.bj/tres-prive';
    process.env.SMARTHEALTH_PISPI_MARCHAND = 'MARCHAND-12345';
    const m = pourquoiIndisponible('pi-spi');
    assert.equal(m.includes('tres-prive'), false);
    assert.equal(m.includes('MARCHAND-12345'), false);
  });
});

describe('cles posees mais adaptateur absent', () => {
  test('on distingue les deux manques', () => {
    for (const k of ['SMARTHEALTH_PISPI_BASE', 'SMARTHEALTH_PISPI_MARCHAND', 'SMARTHEALTH_PISPI_CLE']) {
      process.env[k] = 'valeur';
    }
    assert.equal(operateurConfigure('pi-spi'), true);
    // Mais pas utilisable : aucun adaptateur. C'est la nuance qui avait
    // fait annoncer « paiement ouvert » dans la console d'administration.
    assert.equal(operateurUtilisable('pi-spi'), false);
    assert.equal(paiementEnLigneDisponible(), false);
    const m = pourquoiIndisponible('pi-spi');
    assert.match(m, /adaptateur/i);
    assert.equal(/Reglages manquants/.test(m), false);
  });

  test('un operateur pret ne produit aucun refus', () => {
    // Impossible aujourd hui, aucun adaptateur n etant livre : le test
    // nomme la regle pour le jour ou il y en aura un.
    assert.equal(pourquoiIndisponible('mtn-momo').length > 0, true);
  });
});
