/**
 * Migrations additives de la base.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE : l'ouverture d'une base DEJA INSTALLEE.
 *
 * Le defaut qu'il a nomme : un index declare dans le schema portait sur une
 * colonne qui n'arrive qu'a la migration. Le schema s'appliquant AVANT les
 * ALTER TABLE, l'index echouait sur une colonne inexistante et la base ne
 * s'ouvrait plus du tout. Invisible en developpement — la base y est
 * toujours neuve — et bloquant pour chaque etablissement deja equipe.
 *
 * Les cas ci-dessous rejouent donc la sequence reelle d'ouverture sur une
 * base d'avant, et non sur une base vide.
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SCHEMA_SQL } from '../lib/schema.ts';
import {
  COLONNES_AJOUTEES,
  INDEX_APRES_MIGRATION,
  appliquerMigrations,
} from '../lib/migrations.ts';

const dossier = mkdtempSync(path.join(os.tmpdir(), 'pd-migrations-'));
let n = 0;
const nouvelleBase = () => new DatabaseSync(path.join(dossier, `t${n++}.db`));

after(() => rmSync(dossier, { recursive: true, force: true }));

/** La sequence exacte de lib/db.ts : schema, puis migrations. */
function ouvrir(db) {
  db.exec(SCHEMA_SQL);
  return appliquerMigrations(db);
}

const colonnes = (db, table) =>
  db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

describe('base neuve', () => {
  test('elle s ouvre, et la migration n a rien a faire', () => {
    const db = nouvelleBase();
    const faites = ouvrir(db);
    assert.deepEqual(faites, [], 'une base creee par le schema a deja toutes ses colonnes');
    assert.ok(colonnes(db, 'consultation').includes('sejour_id'));
    db.close();
  });

  test('ouvrir deux fois ne casse rien', () => {
    const db = nouvelleBase();
    ouvrir(db);
    assert.deepEqual(ouvrir(db), [], 'la migration doit etre idempotente');
    db.close();
  });
});

describe('base deja installee', () => {
  /**
   * Le schema tel qu'il etait AVANT ces colonnes : on retire leur
   * declaration du texte du schema, plutot que de recreer les tables apres
   * coup. Recreer une table rompt les cles etrangeres qui la visent, et
   * l'on finirait par tester le simulateur au lieu de la migration.
   */
  function schemaAncien() {
    let sql = SCHEMA_SQL;
    for (const [table, colonne] of COLONNES_AJOUTEES) {
      const bloc = new RegExp(`(CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);)`);
      sql = sql.replace(bloc, (texte) =>
        texte.replace(new RegExp(`^[ \\t]*${colonne}\\s+[^\\n]*\\n`, 'm'), ''),
      );
    }
    return sql;
  }

  function baseAncienne() {
    const db = nouvelleBase();
    db.exec(schemaAncien());
    return db;
  }

  test('elle s ouvre, et les colonnes manquantes sont ajoutees', () => {
    const db = baseAncienne();
    assert.equal(
      colonnes(db, 'consultation').includes('sejour_id'),
      false,
      'preconditions : la colonne ne doit pas exister avant',
    );

    // C'est ICI que le defaut se manifestait : exec(SCHEMA_SQL) levait
    // « no such column: sejour_id » sur l'index, avant tout ALTER TABLE.
    const faites = ouvrir(db);

    assert.ok(colonnes(db, 'consultation').includes('sejour_id'));
    assert.ok(faites.includes('consultation.sejour_id'), faites.join(', '));
    db.close();
  });

  test('toutes les colonnes declarees sont effectivement ajoutees', () => {
    const db = baseAncienne();
    ouvrir(db);
    for (const [table, colonne] of COLONNES_AJOUTEES) {
      assert.ok(colonnes(db, table).includes(colonne), `${table}.${colonne} manque apres migration`);
    }
    db.close();
  });

  test('une deuxieme ouverture ne refait rien', () => {
    const db = baseAncienne();
    ouvrir(db);
    assert.deepEqual(ouvrir(db), []);
    db.close();
  });
});

describe('le schema n index jamais une colonne migree', () => {
  test('sinon aucune base installee ne s ouvre', () => {
    // Verification statique, en plus du cas fonctionnel ci-dessus : elle
    // nomme la regle au lieu de la laisser deduire d'un echec SQL, et elle
    // couvre les colonnes futures qu'on ajoutera sans y penser.
    for (const [table, colonne] of COLONNES_AJOUTEES) {
      const motif = new RegExp(`CREATE\\s+INDEX[^;]*\\bON\\s+${table}\\s*\\([^)]*\\b${colonne}\\b`, 'i');
      assert.equal(
        motif.test(SCHEMA_SQL),
        false,
        `le schema indexe ${table}.${colonne}, qui n'existe qu'apres migration : ` +
          'deplacer cet index dans INDEX_APRES_MIGRATION',
      );
    }
  });

  test('les index d apres-migration sont bien poses', () => {
    const db = nouvelleBase();
    ouvrir(db);
    const poses = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all()
      .map((r) => r.name);
    for (const sql of INDEX_APRES_MIGRATION) {
      const nom = /CREATE INDEX IF NOT EXISTS (\w+)/.exec(sql)?.[1];
      assert.ok(nom && poses.includes(nom), `${nom} absent apres ouverture`);
    }
    db.close();
  });
});
