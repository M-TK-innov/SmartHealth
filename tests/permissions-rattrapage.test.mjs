/**
 * Rattrapage des permissions a la mise a jour.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE : une version qui ajoute un module ajoute ses
 * permissions. Sur une base deja installee, la matrice role -> permissions
 * n'est plus vide, et l'amorcage d'origine s'arretait la. L'etablissement
 * decouvrait alors le nouveau module par un refus d'acces que personne ne
 * savait expliquer — un defaut qui ne se voit qu'apres livraison, chez le
 * client, et jamais sur une base neuve de developpement.
 *
 * Et la contrepartie, aussi importante : le rattrapage ne doit JAMAIS
 * reaccorder un droit qu'un administrateur a retire. Une mise a jour qui
 * defait une decision d'administration dans le dos de celui qui l'a prise
 * est pire que le module muet.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  ROLES,
  rattrapage,
} from '../lib/auth/roles.ts';

/** Les permissions ajoutees par la version hospitaliere. */
const NOUVELLES = ['flux:read', 'flux:write', 'caisse:read', 'caisse:write'];

/** La matrice telle qu'elle existait AVANT ces permissions. */
function matriceAncienne(retraits = []) {
  const couples = [];
  for (const role of ROLES) {
    for (const p of DEFAULT_ROLE_PERMISSIONS[role]) {
      if (NOUVELLES.includes(p)) continue;
      if (retraits.some((r) => r.role === role && r.permission === p)) continue;
      couples.push({ role, permission: p });
    }
  }
  return couples;
}

const etatDepuis = (couples, dejaAmorcees = []) => ({
  dejaAmorcees,
  presentesEnBase: [...new Set(couples.map((c) => c.permission))],
});

const accorde = (plan, role, permission) =>
  plan.aAccorder.some((c) => c.role === role && c.permission === permission);

describe('mise a jour d une base deja installee', () => {
  test('les nouvelles permissions sont accordees aux roles qui doivent les avoir', () => {
    const plan = rattrapage(etatDepuis(matriceAncienne()));

    assert.ok(accorde(plan, 'hopital', 'caisse:write'), 'l etablissement doit pouvoir encaisser');
    assert.ok(accorde(plan, 'hopital', 'flux:read'));
    assert.ok(accorde(plan, 'medecin', 'flux:write'), 'le medecin appelle son patient suivant');
    assert.ok(accorde(plan, 'medecin', 'caisse:read'), 'il voit le reste a charge');
    assert.ok(accorde(plan, 'super_admin', 'caisse:write'));
  });

  test('le medecin ne recoit pas le droit d encaisser', () => {
    // La separation entre celui qui soigne et celui qui tient la caisse est
    // une regle de controle interne. Un rattrapage automatique est
    // exactement le genre de mecanisme qui la dissout sans que personne ne
    // l'ait decide.
    const plan = rattrapage(etatDepuis(matriceAncienne()));
    assert.equal(accorde(plan, 'medecin', 'caisse:write'), false);
    assert.equal(accorde(plan, 'ministere', 'flux:read'), false, 'le ministere ne voit pas de file nominative');
  });

  test('un droit retire par un administrateur ne revient pas', () => {
    // L'export reste porte par d'autres roles : il est donc reconnu comme
    // deja amorce, et son absence chez le medecin est une decision, pas un
    // oubli de version.
    const couples = matriceAncienne([{ role: 'medecin', permission: 'export:read' }]);
    const plan = rattrapage(etatDepuis(couples));

    assert.equal(accorde(plan, 'medecin', 'export:read'), false);
    // Et le rattrapage fait quand meme son travail par ailleurs.
    assert.ok(accorde(plan, 'medecin', 'flux:read'));
  });

  test('rien a rattraper : aucune ecriture de droits', () => {
    // Le cas de tous les demarrages ordinaires. Il doit etre inerte, sinon
    // chaque lancement rejoue des ecritures sur la matrice d acces.
    const couples = ROLES.flatMap((role) =>
      DEFAULT_ROLE_PERMISSIONS[role].map((permission) => ({ role, permission })),
    );
    const plan = rattrapage(etatDepuis(couples, [...ALL_PERMISSIONS]));

    assert.deepEqual(plan.aAccorder, []);
    assert.deepEqual(plan.aMarquer, []);
  });

  test('une permission deja amorcee puis retiree n est jamais reaccordee', () => {
    // Deuxieme demarrage apres la mise a jour : l administrateur a retire
    // caisse:write a l etablissement. La table de suivi la connait, donc
    // elle ne doit plus jamais revenir.
    const couples = ROLES.flatMap((role) =>
      DEFAULT_ROLE_PERMISSIONS[role]
        .filter((p) => !(role === 'hopital' && p === 'caisse:write'))
        .map((permission) => ({ role, permission })),
    );
    const plan = rattrapage(etatDepuis(couples, [...ALL_PERMISSIONS]));

    assert.equal(accorde(plan, 'hopital', 'caisse:write'), false);
    assert.deepEqual(plan.aAccorder, []);
  });

  test('un droit retire de TOUS les roles ne revient pas non plus', () => {
    // C'est ce cas, et lui seul, qui justifie la table de suivi.
    //
    // Tant qu'un droit subsiste quelque part, on pourrait deduire son
    // anciennete de la matrice elle-meme. Retire PARTOUT — super-admin
    // compris — il devient indiscernable d'une nouveaute, et une deduction
    // par la matrice le rendrait a tout le monde au redemarrage suivant.
    // Ici la table dit qu'il a deja ete amorce, et la decision tient.
    const couples = ROLES.flatMap((role) =>
      DEFAULT_ROLE_PERMISSIONS[role]
        .filter((p) => p !== 'surveillance:read')
        .map((permission) => ({ role, permission })),
    );
    const etat = etatDepuis(couples, [...ALL_PERMISSIONS]);
    assert.equal(
      etat.presentesEnBase.includes('surveillance:read'),
      false,
      'preconditions : le droit ne doit subsister nulle part',
    );

    const plan = rattrapage(etat);
    assert.equal(accorde(plan, 'ministere', 'surveillance:read'), false);
    assert.deepEqual(plan.aAccorder, []);
  });
});

describe('premiere installation', () => {
  test('une base vide recoit la matrice par defaut, et tout est marque amorce', () => {
    const plan = rattrapage({ dejaAmorcees: [], presentesEnBase: [] });

    for (const role of ROLES) {
      for (const p of DEFAULT_ROLE_PERMISSIONS[role]) {
        assert.ok(accorde(plan, role, p), `${role} doit recevoir ${p}`);
      }
    }
    // Y compris celles qu'aucun role par defaut ne porte : sans cela, le
    // demarrage suivant les prendrait pour des nouveautes a rattraper.
    for (const p of ALL_PERMISSIONS) {
      assert.ok(plan.aMarquer.includes(p), `${p} doit etre marquee amorcee`);
    }
  });
});

describe('base anterieure a la table de suivi', () => {
  test('l historique se reconstitue a partir des droits encore presents', () => {
    const couples = matriceAncienne();
    const plan = rattrapage(etatDepuis(couples, []));

    // Les anciennes permissions sont marquees sans etre reaccordees...
    assert.ok(plan.aMarquer.includes('patient:read'));
    assert.equal(accorde(plan, 'medecin', 'patient:read'), false);
    // ...et les nouvelles sont accordees ET marquees.
    assert.ok(plan.aMarquer.includes('caisse:write'));
    assert.ok(accorde(plan, 'hopital', 'caisse:write'));
  });
});
