/**
 * Periode d'essai de sept jours.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE :
 *
 *   - qu'un essai dure SEPT jours civils, premier compris, et pas six ni
 *     huit. Un decalage d'un jour au profit du testeur passe inapercu ;
 *     a son detriment, il coupe une evaluation en cours ;
 *   - qu'une echeance n'enferme JAMAIS un dossier. Lecture et export
 *     restent ouverts, y compris si un testeur a saisi un vrai patient
 *     malgre les avertissements ;
 *   - que l'autorisation apres echeance reste une liste BLANCHE. Une
 *     permission ajoutee plus tard doit etre refusee par defaut : c'est
 *     l'oubli dans l'autre sens qui ouvrirait l'ecriture a vie ;
 *   - qu'aucune entree de cette liste ne designe une permission disparue,
 *     ce qui retirerait un acces de LECTURE sans que rien ne le dise ;
 *   - que reculer l'horloge ne rende pas des jours.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DUREE_ESSAI_JOURS,
  PERMISSIONS_APRES_ECHEANCE,
  entreesOrphelines,
  etatEssai,
  jourFinEssai,
  messageEcheance,
  messageRestant,
  permissionAutorisee,
} from '../lib/essai.ts';
import { ALL_PERMISSIONS } from '../lib/auth/roles.ts';

const DEBUT = '2026-03-02';

/** Etat au jour dit, sans horloge reculee. */
const au = (jourCourant, jourVu = null) => etatEssai({ jourDebut: DEBUT, jourVu, jourCourant });

describe('duree', () => {
  test('sept jours civils, le premier compris', () => {
    assert.equal(DUREE_ESSAI_JOURS, 7);
    assert.equal(jourFinEssai(DEBUT), '2026-03-08');
  });

  test('le premier jour laisse sept jours, pas six', () => {
    assert.equal(au(DEBUT).joursRestants, 7);
    assert.equal(au(DEBUT).phase, 'actif');
  });

  test('le dernier jour est encore ouvert', () => {
    const etat = au('2026-03-08');
    assert.equal(etat.phase, 'actif');
    assert.equal(etat.joursRestants, 1);
  });

  test('le lendemain du dernier jour est clos', () => {
    const etat = au('2026-03-09');
    assert.equal(etat.phase, 'expire');
    assert.equal(etat.joursRestants, 0);
  });

  test('bien plus tard, le compte ne devient pas negatif', () => {
    assert.equal(au('2027-01-01').joursRestants, 0);
  });

  test('le decompte baisse d un par jour', () => {
    const suite = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08'];
    assert.deepEqual(
      suite.map((j) => au(j).joursRestants),
      [7, 6, 5, 4, 3, 2, 1],
    );
  });

  test('un essai ouvert en fin de mois franchit le mois', () => {
    assert.equal(jourFinEssai('2026-02-25'), '2026-03-03');
  });

  test('une annee bissextile ne decale rien', () => {
    assert.equal(jourFinEssai('2028-02-26'), '2028-03-03');
  });
});

describe('horloge reculee', () => {
  test('reculer la date ne rend pas de jours', () => {
    // Vu jusqu'au 10 mars, la machine annonce le 3 : l'essai reste clos.
    const etat = au('2026-03-03', '2026-03-10');
    assert.equal(etat.phase, 'expire');
    assert.equal(etat.joursRestants, 0);
    assert.equal(etat.horlogeReculee, true);
    assert.equal(etat.jourEffectif, '2026-03-10');
  });

  test('avancer la date est pris tel quel : on ne rallonge pas non plus', () => {
    const etat = au('2026-03-20', '2026-03-04');
    assert.equal(etat.phase, 'expire');
    assert.equal(etat.horlogeReculee, false);
  });

  test('le meme jour que le dernier vu ne compte pas comme un recul', () => {
    const etat = au('2026-03-05', '2026-03-05');
    assert.equal(etat.horlogeReculee, false);
    assert.equal(etat.phase, 'actif');
  });

  test('sans jour deja vu, la machine fait foi', () => {
    const etat = etatEssai({ jourDebut: DEBUT, jourVu: null, jourCourant: '2026-03-04' });
    assert.equal(etat.horlogeReculee, false);
    assert.equal(etat.jourEffectif, '2026-03-04');
  });
});

describe('ce que l echeance laisse ouvert', () => {
  test('pendant l essai, tout s exerce', () => {
    for (const p of ALL_PERMISSIONS) {
      assert.equal(permissionAutorisee('actif', p), true, `${p} refusee pendant l'essai`);
    }
  });

  test('la lecture d un dossier reste possible apres echeance', () => {
    assert.equal(permissionAutorisee('expire', 'patient:read'), true);
    assert.equal(permissionAutorisee('expire', 'consultation:read'), true);
  });

  test('l export reste possible : sinon le verrou retient les donnees', () => {
    assert.equal(permissionAutorisee('expire', 'export:read'), true);
  });

  test('l ecriture est refusee apres echeance', () => {
    for (const p of ['patient:write', 'consultation:write', 'caisse:write', 'plateau:write', 'bloc:write']) {
      assert.equal(permissionAutorisee('expire', p), false, `${p} encore permise apres echeance`);
    }
  });

  test('les actes cliniques engageants sont refuses', () => {
    for (const p of ['consultation:sign', 'prescription:validate', 'pharmacie:dispense', 'plateau:acquitter']) {
      assert.equal(permissionAutorisee('expire', p), false, `${p} encore permise apres echeance`);
    }
  });

  test('la transmission vers un tiers est refusee, la recuperation non', () => {
    assert.equal(permissionAutorisee('expire', 'export:send'), false);
    assert.equal(permissionAutorisee('expire', 'export:read'), true);
  });

  test('l administration fait partie de ce que l essai cesse d offrir', () => {
    for (const p of ['database:manage', 'server:manage', 'permission:manage', 'policy:manage', 'session:manage']) {
      assert.equal(permissionAutorisee('expire', p), false, `${p} encore permise apres echeance`);
    }
  });
});

describe('la liste blanche tient dans le temps', () => {
  test('aucune entree ne designe une permission disparue', () => {
    assert.deepEqual(entreesOrphelines(), []);
  });

  test('elle ne contient que de la lecture, ou un export nomme', () => {
    const exceptions = new Set(['export:read', 'stats:facility', 'stats:national']);
    for (const p of PERMISSIONS_APRES_ECHEANCE) {
      assert.ok(
        p.endsWith(':read') || exceptions.has(p),
        `${p} n'est ni une lecture ni une exception assumee`,
      );
    }
  });

  test('une permission inconnue de la liste est refusee par defaut', () => {
    // C'est l'invariant qui protege les permissions a venir : on ne les
    // enumere pas, on verifie que l'appartenance a la liste est la seule
    // voie d'autorisation.
    const hors = ALL_PERMISSIONS.filter((p) => !PERMISSIONS_APRES_ECHEANCE.includes(p));
    assert.ok(hors.length > 0, 'la liste blanche ne doit pas tout contenir');
    for (const p of hors) {
      assert.equal(permissionAutorisee('expire', p), false, `${p} autorisee sans figurer dans la liste`);
    }
  });
});

describe('ce qui est dit au testeur', () => {
  test('le refus nomme le remede, pas seulement le probleme', () => {
    const m = messageEcheance(au('2026-03-09'));
    assert.match(m, /exportable/i);
    assert.match(m, /sauvegarde/i);
    assert.match(m, /version compl/i);
  });

  test('le refus donne la date de fin, pas une duree abstraite', () => {
    assert.match(messageEcheance(au('2026-03-09')), /2026-03-08/);
  });

  test('le dernier jour est annonce comme tel', () => {
    assert.match(messageRestant(au('2026-03-08')), /[Dd]ernier jour/);
  });

  test('en cours d essai, on annonce les jours et la date de fin', () => {
    const m = messageRestant(au('2026-03-04'));
    assert.match(m, /5 jours/);
    assert.match(m, /2026-03-08/);
  });

  test('le bandeau decrit un etat, il ne reprend pas le texte du refus', () => {
    // Un bandeau qui annonce « cette action modifie des donnees » alors
    // qu'aucune action n'a ete demandee apprend a ne plus lire les bandeaux.
    const bandeau = messageRestant(au('2026-03-09'));
    assert.notEqual(bandeau, messageEcheance(au('2026-03-09')));
    assert.doesNotMatch(bandeau, /cette action/i);
    assert.match(bandeau, /2026-03-08/);
    assert.match(bandeau, /lecture/i);
    assert.match(bandeau, /sauvegarde/i);
  });
});
