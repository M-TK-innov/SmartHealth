/**
 * Jeton de session signe de la demonstration en ligne.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE :
 *
 *   - qu'une signature fausse, tronquee ou absente soit REFUSEE. C'est la
 *     seule chose qui separe le jeton d'un simple texte que l'on se donne
 *     a soi-meme ;
 *   - qu'un jeton perime soit refuse, et que la peremption se juge sur
 *     l'instant passe en parametre et non sur l'horloge du module ;
 *   - qu'un secret vide fasse echouer la signature plutot que de produire
 *     un jeton que n'importe qui peut recalculer ;
 *   - qu'un identifiant portant le separateur ne puisse pas deplacer la
 *     frontiere avec l'expiration — sans quoi une date se lirait comme
 *     une identite.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { signerJeton, verifierJeton } from '../lib/demo/jeton.ts';

const SECRET = 'secret-de-demonstration-pour-les-tests';
const AUTRE_SECRET = 'un-autre-secret';
const MAINTENANT = new Date('2026-03-02T10:00:00Z');
const PLUS_TARD = '2026-03-02T22:00:00.000Z';

const jetonValide = () =>
  signerJeton({ identifiant: 'utilisateur-1', expireLe: PLUS_TARD }, SECRET);

describe('aller-retour', () => {
  test('un jeton signe se verifie et rend son identifiant', () => {
    const v = verifierJeton(jetonValide(), SECRET, MAINTENANT);
    assert.equal(v?.identifiant, 'utilisateur-1');
    assert.equal(v?.expireLe, PLUS_TARD);
  });

  test('la charge utile est lisible : rien n y est cache', () => {
    const [charge] = jetonValide().split('.');
    assert.equal(Buffer.from(charge, 'base64url').toString('utf8'), `utilisateur-1|${PLUS_TARD}`);
  });

  test('deux signatures du meme contenu sont identiques', () => {
    assert.equal(jetonValide(), jetonValide());
  });
});

describe('ce qui doit etre refuse', () => {
  test('un autre secret', () => {
    assert.equal(verifierJeton(jetonValide(), AUTRE_SECRET, MAINTENANT), null);
  });

  test('une signature modifiee', () => {
    const [charge, sig] = jetonValide().split('.');
    const altere = sig.slice(0, -1) + (sig.at(-1) === 'A' ? 'B' : 'A');
    assert.equal(verifierJeton(`${charge}.${altere}`, SECRET, MAINTENANT), null);
  });

  test('une charge modifiee, signature d origine conservee', () => {
    // La tentative evidente : changer l identite sans toucher a la signature.
    const [, sig] = jetonValide().split('.');
    const autreCharge = Buffer.from(`administrateur|${PLUS_TARD}`, 'utf8').toString('base64url');
    assert.equal(verifierJeton(`${autreCharge}.${sig}`, SECRET, MAINTENANT), null);
  });

  test('une signature tronquee', () => {
    const [charge, sig] = jetonValide().split('.');
    assert.equal(verifierJeton(`${charge}.${sig.slice(0, 10)}`, SECRET, MAINTENANT), null);
  });

  test('une signature absente', () => {
    const [charge] = jetonValide().split('.');
    assert.equal(verifierJeton(charge, SECRET, MAINTENANT), null);
    assert.equal(verifierJeton(`${charge}.`, SECRET, MAINTENANT), null);
  });

  test('un jeton vide, nul ou indefini', () => {
    for (const j of ['', null, undefined]) {
      assert.equal(verifierJeton(j, SECRET, MAINTENANT), null);
    }
  });

  test('un secret vide a la verification', () => {
    assert.equal(verifierJeton(jetonValide(), '', MAINTENANT), null);
  });

  test('trop de separateurs', () => {
    assert.equal(verifierJeton(`${jetonValide()}.encore`, SECRET, MAINTENANT), null);
  });

  test('une expiration illisible', () => {
    const jeton = signerJeton({ identifiant: 'u', expireLe: 'pas-une-date' }, SECRET);
    assert.equal(verifierJeton(jeton, SECRET, MAINTENANT), null);
  });
});

describe('peremption', () => {
  test('un jeton expire est refuse', () => {
    const jeton = signerJeton({ identifiant: 'u', expireLe: '2026-03-02T09:00:00.000Z' }, SECRET);
    assert.equal(verifierJeton(jeton, SECRET, MAINTENANT), null);
  });

  test('l instant exact de l expiration est deja trop tard', () => {
    const jeton = signerJeton({ identifiant: 'u', expireLe: MAINTENANT.toISOString() }, SECRET);
    assert.equal(verifierJeton(jeton, SECRET, MAINTENANT), null);
  });

  test('une seconde avant, il passe encore', () => {
    const jeton = signerJeton(
      { identifiant: 'u', expireLe: new Date(MAINTENANT.getTime() + 1000).toISOString() },
      SECRET,
    );
    assert.equal(verifierJeton(jeton, SECRET, MAINTENANT)?.identifiant, 'u');
  });

  test('la peremption se juge sur l instant passe, pas sur l horloge', () => {
    const jeton = signerJeton({ identifiant: 'u', expireLe: PLUS_TARD }, SECRET);
    assert.equal(verifierJeton(jeton, SECRET, new Date('2027-01-01T00:00:00Z')), null);
    assert.ok(verifierJeton(jeton, SECRET, new Date('2026-03-02T00:00:00Z')));
  });
});

describe('refus a la signature', () => {
  test('un secret vide ne produit pas de jeton', () => {
    assert.throws(() => signerJeton({ identifiant: 'u', expireLe: PLUS_TARD }, ''), /[Ss]ecret/);
  });

  test('un identifiant vide ne produit pas de jeton', () => {
    assert.throws(() => signerJeton({ identifiant: '', expireLe: PLUS_TARD }, SECRET), /[Ii]dentifiant/);
  });

  test('un identifiant portant le separateur est refuse', () => {
    // Sinon « u|2099-01-01T00:00:00Z » deplacerait la frontiere : on lirait
    // une expiration choisie par l appelant comme si elle etait signee.
    assert.throws(
      () => signerJeton({ identifiant: 'u|2099-01-01T00:00:00.000Z', expireLe: PLUS_TARD }, SECRET),
      /[Ii]dentifiant/,
    );
  });
});
