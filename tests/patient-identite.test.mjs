/**
 * Identifiant de connexion d'un patient.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE :
 *
 *   - que toutes les formes d'un meme numero donnent le MEME resultat.
 *     C'est l'invariant central : si l'enrolement et la connexion
 *     normalisent differemment, le compte existe et reste introuvable ;
 *   - qu'un nombre de dix chiffres nus ne soit JAMAIS devine. Telephone et
 *     NPI ont la meme longueur, et rattacher un dossier medical au mauvais
 *     identifiant n'est pas une erreur d'ergonomie ;
 *   - qu'un code d'enrolement deja consomme ne resserve pas, meme avant sa
 *     date de peremption ;
 *   - que les suites evidentes de six chiffres soient refusees.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALPHABET_CODE,
  LONGUEUR_PIN,
  codeUtilisable,
  deviner,
  formaterTelephone,
  normaliser,
  normaliserCode,
  normaliserNpi,
  normaliserTelephone,
  pinAcceptable,
} from '../lib/patient/identite.ts';

const CANONIQUE = '+2290197073900';

describe('telephone : toutes les formes convergent', () => {
  test('les ecritures d un meme numero donnent le meme resultat', () => {
    const formes = [
      '+2290197073900',
      '+229 01 97 07 39 00',
      '00229 01 97 07 39 00',
      '229 0197073900',
      '0197073900',
      '01 97 07 39 00',
      '01-97-07-39-00',
      '(01) 97 07 39 00',
      '97073900',
      '97 07 39 00',
    ];
    for (const f of formes) {
      const r = normaliserTelephone(f);
      assert.equal(r.ok, true, `refuse : ${f}`);
      assert.equal(r.valeur, CANONIQUE, `${f} ne converge pas`);
    }
  });

  test('un ancien numero a huit chiffres recoit le prefixe de la renumerotation', () => {
    assert.equal(normaliserTelephone('97073900').valeur, CANONIQUE);
  });

  test('un numero trop court est refuse, et le refus dit ce qui est attendu', () => {
    const r = normaliserTelephone('9707');
    assert.equal(r.ok, false);
    assert.match(r.motif, /dix/i);
  });

  test('un numero trop long est refuse', () => {
    assert.equal(normaliserTelephone('019707390012345').ok, false);
  });

  test('une saisie vide est refusee', () => {
    assert.equal(normaliserTelephone('').ok, false);
    assert.equal(normaliserTelephone('   ').ok, false);
  });

  test('le type rendu est bien telephone', () => {
    assert.equal(normaliserTelephone(CANONIQUE).type, 'telephone');
  });
});

describe('NPI', () => {
  test('dix chiffres passent, espaces compris', () => {
    const r = normaliserNpi('12 34 56 78 90');
    assert.equal(r.ok, true);
    assert.equal(r.valeur, '1234567890');
    assert.equal(r.type, 'npi');
  });

  test('neuf ou onze chiffres sont refuses', () => {
    assert.equal(normaliserNpi('123456789').ok, false);
    assert.equal(normaliserNpi('12345678901').ok, false);
  });

  test('un NPI ne recoit aucun prefixe : ce n est pas un telephone', () => {
    // Huit chiffres passeraient en telephone ; en NPI, ils sont refuses.
    assert.equal(normaliserTelephone('12345678').ok, true);
    assert.equal(normaliserNpi('12345678').ok, false);
  });
});

describe('on ne devine pas ce qui est ambigu', () => {
  test('dix chiffres nus sont declares ambigus, jamais tranches', () => {
    assert.equal(deviner('0197073900'), 'ambigu');
    assert.equal(deviner('1234567890'), 'ambigu');
  });

  test('un plus ou un indicatif leve l ambiguite', () => {
    assert.equal(deviner('+2290197073900'), 'telephone');
    assert.equal(deviner('002290197073900'), 'telephone');
    assert.equal(deviner('2290197073900'), 'telephone');
  });

  test('huit chiffres ne peuvent etre qu un ancien numero', () => {
    assert.equal(deviner('97073900'), 'telephone');
  });

  test('une saisie vide ou aberrante ne propose rien', () => {
    assert.equal(deviner(''), 'inconnu');
    assert.equal(deviner('abc'), 'inconnu');
    assert.equal(deviner('123'), 'inconnu');
  });

  test('le type declare par l appelant fait foi, sans heuristique', () => {
    assert.equal(normaliser('npi', '0197073900').valeur, '0197073900');
    assert.equal(normaliser('telephone', '0197073900').valeur, CANONIQUE);
  });
});

describe('affichage', () => {
  test('un numero se relit par groupes de deux', () => {
    assert.equal(formaterTelephone(CANONIQUE), '+229 01 97 07 39 00');
  });

  test('une valeur non reconnue est rendue telle quelle, sans invention', () => {
    assert.equal(formaterTelephone('inconnu'), 'inconnu');
  });
});

describe('code d enrolement', () => {
  const instant = new Date('2026-03-02T10:00:00Z');

  test('l alphabet ecarte les caracteres qui se confondent a l oral', () => {
    for (const c of ['O', '0', 'I', '1', 'L', 'S']) {
      assert.equal(ALPHABET_CODE.includes(c), false, `${c} ne devrait pas y etre`);
    }
  });

  test('la saisie est mise en majuscules et debarrassee des separateurs', () => {
    assert.equal(normaliserCode(' ab-cd ef9 '), 'ABCDEF9');
  });

  test('un code non expire et non consomme est utilisable', () => {
    assert.equal(codeUtilisable({ expireLe: '2026-03-02 11:00:00', consommeLe: null }, instant), true);
  });

  test('un code expire ne l est plus', () => {
    assert.equal(codeUtilisable({ expireLe: '2026-03-02 09:00:00', consommeLe: null }, instant), false);
  });

  test('un code deja consomme ne ressert pas, meme avant sa date', () => {
    // Un code lu par-dessus l epaule ne doit pas valoir une seconde fois.
    assert.equal(
      codeUtilisable({ expireLe: '2026-03-02 11:00:00', consommeLe: '2026-03-02 10:05:00' }, instant),
      false,
    );
  });

  test('une date illisible vaut refus, jamais acceptation', () => {
    assert.equal(codeUtilisable({ expireLe: 'n importe quoi', consommeLe: null }, instant), false);
  });
});

describe('code secret du patient', () => {
  test('six chiffres passent', () => {
    assert.equal(pinAcceptable('483920').ok, true);
    assert.equal(LONGUEUR_PIN, 6);
  });

  test('autre chose que des chiffres est refuse', () => {
    assert.equal(pinAcceptable('48a920').ok, false);
    assert.equal(pinAcceptable('').ok, false);
  });

  test('une mauvaise longueur est refusee, et le refus la nomme', () => {
    const r = pinAcceptable('4839');
    assert.equal(r.ok, false);
    assert.match(r.motif, /6|six/i);
  });

  test('les suites evidentes sont refusees : ce sont les premieres essayees', () => {
    for (const p of ['000000', '123456', '111111', '654321', '121212']) {
      assert.equal(pinAcceptable(p).ok, false, `${p} accepte`);
    }
  });
});
