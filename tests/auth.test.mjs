/**
 * Tests du controle d'acces.
 *
 *   node --test tests/auth.test.mjs
 *
 * Portent sur la logique pure : hierarchie de validation, matrice de droits
 * par defaut, et hachage des mots de passe. Ce sont les regles dont une
 * regression ouvrirait un dossier medical a quelqu'un qui n'y a pas droit.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  ROLES,
  ROLE_DATA_SCOPE,
  SELF_REGISTRABLE_ROLES,
  canValidateRole,
  isRole,
} from '../lib/auth/roles.ts';
import { checkPasswordStrength, generateTemporaryPassword, hashPassword, verifyPassword } from '../lib/auth/password.ts';

describe('hierarchie des roles', () => {
  test('un medecin ne valide personne', () => {
    for (const role of ROLES) {
      assert.equal(canValidateRole('medecin', role), false, `medecin ne doit pas valider ${role}`);
    }
  });

  test('un etablissement ne valide que ses medecins', () => {
    assert.equal(canValidateRole('hopital', 'medecin'), true);
    for (const role of ['hopital', 'ministere', 'admin', 'super_admin']) {
      assert.equal(canValidateRole('hopital', role), false, `hopital ne doit pas valider ${role}`);
    }
  });

  test('un administrateur ne peut pas creer de super-administrateur', () => {
    assert.equal(canValidateRole('admin', 'super_admin'), false);
    assert.equal(canValidateRole('admin', 'admin'), false);
    assert.equal(canValidateRole('admin', 'hopital'), true);
  });

  test('seul le super-administrateur valide tous les roles', () => {
    for (const role of ROLES) {
      assert.equal(canValidateRole('super_admin', role), true, `super_admin doit valider ${role}`);
    }
  });

  test('le ministere ne valide personne : il pilote, il n administre pas', () => {
    for (const role of ROLES) {
      assert.equal(canValidateRole('ministere', role), false);
    }
  });

  test('on ne s inscrit jamais administrateur', () => {
    assert.equal(SELF_REGISTRABLE_ROLES.includes('admin'), false);
    assert.equal(SELF_REGISTRABLE_ROLES.includes('super_admin'), false);
    assert.deepEqual([...SELF_REGISTRABLE_ROLES].sort(), ['hopital', 'medecin', 'ministere']);
  });

  test('isRole rejette une valeur forgee', () => {
    assert.equal(isRole('super_admin'), true);
    assert.equal(isRole('root'), false);
    assert.equal(isRole(''), false);
    assert.equal(isRole(null), false);
    assert.equal(isRole({ toString: () => 'admin' }), false);
  });
});

describe('matrice de droits par defaut', () => {
  test('le ministere n a AUCUN acces au dossier nominatif', () => {
    const interdits = ['patient:read', 'patient:write', 'consultation:read', 'consultation:write'];
    for (const p of interdits) {
      assert.equal(
        DEFAULT_ROLE_PERMISSIONS.ministere.includes(p),
        false,
        `le ministere ne doit pas detenir ${p}`,
      );
    }
    assert.equal(ROLE_DATA_SCOPE.ministere, 'national');
  });

  test('seul le medecin peut signer et prescrire', () => {
    for (const role of ROLES) {
      const attendu = role === 'medecin' || role === 'super_admin';
      assert.equal(
        DEFAULT_ROLE_PERMISSIONS[role].includes('consultation:sign'),
        attendu,
        `signature : ${role}`,
      );
      assert.equal(
        DEFAULT_ROLE_PERMISSIONS[role].includes('prescription:validate'),
        attendu,
        `prescription : ${role}`,
      );
    }
  });

  test('base de donnees et serveurs sont reserves au super-administrateur', () => {
    for (const role of ROLES) {
      const attendu = role === 'super_admin';
      assert.equal(DEFAULT_ROLE_PERMISSIONS[role].includes('database:manage'), attendu, `base : ${role}`);
      assert.equal(DEFAULT_ROLE_PERMISSIONS[role].includes('server:manage'), attendu, `serveurs : ${role}`);
      assert.equal(DEFAULT_ROLE_PERMISSIONS[role].includes('permission:manage'), attendu, `droits : ${role}`);
    }
  });

  test('le super-administrateur detient tout le catalogue', () => {
    assert.deepEqual([...DEFAULT_ROLE_PERMISSIONS.super_admin].sort(), [...ALL_PERMISSIONS].sort());
  });

  test('aucun role ne reference une permission inexistante', () => {
    for (const role of ROLES) {
      for (const p of DEFAULT_ROLE_PERMISSIONS[role]) {
        assert.ok(ALL_PERMISSIONS.includes(p), `${role} reference une permission inconnue : ${p}`);
      }
    }
  });

  test('un etablissement gere ses comptes sans toucher a la plateforme', () => {
    assert.ok(DEFAULT_ROLE_PERMISSIONS.hopital.includes('user:validate'));
    assert.equal(DEFAULT_ROLE_PERMISSIONS.hopital.includes('org:write'), false);
    assert.equal(DEFAULT_ROLE_PERMISSIONS.hopital.includes('policy:manage'), false);
    assert.equal(ROLE_DATA_SCOPE.hopital, 'own-org');
  });
});

describe('mots de passe', () => {
  test('un mot de passe correct se verifie, un mauvais est rejete', () => {
    const stored = hashPassword('Kpanou7Zinsou2026');
    assert.equal(verifyPassword('Kpanou7Zinsou2026', stored), true);
    assert.equal(verifyPassword('Kpanou7Zinsou2027', stored), false);
    assert.equal(verifyPassword('', stored), false);
  });

  test('le meme mot de passe donne deux empreintes differentes (sel par compte)', () => {
    const a = hashPassword('MemeMotDePasse2026');
    const b = hashPassword('MemeMotDePasse2026');
    assert.notEqual(a.salt, b.salt);
    assert.notEqual(a.hash, b.hash);
    assert.equal(verifyPassword('MemeMotDePasse2026', a), true);
    assert.equal(verifyPassword('MemeMotDePasse2026', b), true);
  });

  test('le mot de passe en clair n apparait jamais dans ce qui est stocke', () => {
    const secret = 'PhraseSecrete2026';
    const stored = hashPassword(secret);
    assert.equal(JSON.stringify(stored).includes(secret), false);
  });

  test('une empreinte corrompue ou tronquee ne valide pas', () => {
    const stored = hashPassword('Kpanou7Zinsou2026');
    assert.equal(verifyPassword('Kpanou7Zinsou2026', { ...stored, hash: stored.hash.slice(0, 20) }), false);
    assert.equal(verifyPassword('Kpanou7Zinsou2026', { ...stored, salt: 'autre' }), false);
    assert.equal(verifyPassword('Kpanou7Zinsou2026', { hash: '', salt: '' }), false);
    assert.equal(verifyPassword('Kpanou7Zinsou2026', { ...stored, algo: 'md5' }), false);
  });

  test('la politique refuse court, sans majuscule, sans chiffre et trop previsible', () => {
    const policy = { minLength: 10, requireMixed: true };
    assert.ok(checkPasswordStrength('court1A', policy).length > 0, 'trop court');
    assert.ok(checkPasswordStrength('tropcourtsansmaj1', policy).length > 0, 'sans majuscule');
    assert.ok(checkPasswordStrength('SansAucunChiffre', policy).length > 0, 'sans chiffre');
    assert.ok(checkPasswordStrength('MonMotDePasse2026', policy).length > 0, 'terme previsible');
    assert.deepEqual(checkPasswordStrength('Kpanou7Zinsou2026', policy), [], 'doit etre accepte');
  });

  test('un mot de passe provisoire genere satisfait la politique par defaut', () => {
    const policy = { minLength: 10, requireMixed: true };
    for (let i = 0; i < 20; i++) {
      assert.deepEqual(checkPasswordStrength(generateTemporaryPassword(), policy), []);
    }
  });

  test('deux mots de passe provisoires ne sont jamais identiques', () => {
    const vus = new Set();
    for (let i = 0; i < 50; i++) vus.add(generateTemporaryPassword());
    assert.equal(vus.size, 50);
  });
});
