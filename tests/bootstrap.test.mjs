/**
 * Tests de l'amorcage d'une installation.
 *
 *   npm test
 *
 * L'enjeu de ces tests n'est pas l'ergonomie de l'ecran, c'est UN verrou :
 * la route qui cree un super-administrateur sans authentification ne doit
 * fonctionner que sur une base vierge. Si elle reste ouverte une fois
 * l'application en service, n'importe qui sur le reseau se fabrique un compte
 * super-administrateur et lit tous les dossiers.
 *
 * On teste donc la fonction de garde sur une vraie base SQLite temporaire,
 * pas sur une simulation.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SCHEMA_SQL } from '../lib/schema.ts';

let dir;
let dbPath;

/** Reproduit la garde de lib/auth/bootstrap.ts sur une base donnee. */
function needsBootstrap(file) {
  const db = new DatabaseSync(file);
  try {
    return db.prepare('SELECT COUNT(*) n FROM user_account').get().n === 0;
  } catch {
    return true;
  } finally {
    db.close();
  }
}

before(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'pd-bootstrap-'));
  dbPath = path.join(dir, 'test.db');
});

after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* le fichier peut rester verrouille sous Windows : sans consequence */
  }
});

describe('amorcage — verrou de creation du premier compte', () => {
  test('une base sans aucune table est a amorcer', () => {
    const vierge = path.join(dir, 'vide.db');
    assert.equal(needsBootstrap(vierge), true);
  });

  test('une base au schema installe mais sans compte est a amorcer', () => {
    const db = new DatabaseSync(dbPath);
    db.exec(SCHEMA_SQL);
    db.close();
    assert.equal(needsBootstrap(dbPath), true);
  });

  // LE test. Si celui-ci tombe, la route d'amorcage devient une porte ouverte.
  test('des qu un compte existe, l amorcage est definitivement ferme', () => {
    const db = new DatabaseSync(dbPath);
    db.exec(SCHEMA_SQL);
    db.prepare(
      `INSERT INTO user_account (id, email, password_hash, password_salt, full_name, role, status)
       VALUES ('u1', 'admin@test.bj', 'h', 's', 'Admin', 'super_admin', 'active')`,
    ).run();
    db.close();

    assert.equal(needsBootstrap(dbPath), false, "l'amorcage doit se fermer des le premier compte");
  });

  test('un compte suspendu ou refuse ferme aussi l amorcage', () => {
    // Sinon il suffirait de suspendre le seul administrateur pour rouvrir la
    // creation d'un super-administrateur sans authentification.
    const file = path.join(dir, 'suspendu.db');
    const db = new DatabaseSync(file);
    db.exec(SCHEMA_SQL);
    for (const [id, statut] of [
      ['u1', 'suspended'],
      ['u2', 'rejected'],
      ['u3', 'pending'],
    ]) {
      db.prepare(
        `INSERT INTO user_account (id, email, password_hash, password_salt, full_name, role, status)
         VALUES (?, ?, 'h', 's', 'X', 'medecin', ?)`,
      ).run(id, `${id}@test.bj`, statut);
    }
    db.close();

    assert.equal(needsBootstrap(file), false, 'un compte inactif compte quand meme comme un compte existant');
  });
});

describe('amorcage — adresses reseau', () => {
  test('la boucle locale est toujours proposee', async () => {
    const { networkAddresses } = await import('../lib/auth/network.ts');
    const addresses = networkAddresses(3000);
    assert.ok(
      addresses.some((a) => a.local && a.url === 'http://localhost:3000'),
      'l acces depuis le poste lui-meme doit toujours figurer',
    );
  });

  test('le port demande est bien celui affiche', async () => {
    const { networkAddresses } = await import('../lib/auth/network.ts');
    // L'application desktop tire un port au hasard : l'ecran doit afficher
    // celui-la, pas 3000 en dur.
    for (const a of networkAddresses(51234)) {
      assert.ok(a.url.endsWith(':51234'), `port absent de ${a.url}`);
    }
  });

  test('aucune adresse d auto-configuration n est proposee', async () => {
    const { networkAddresses } = await import('../lib/auth/network.ts');
    // 169.254.x.x = interface sans bail DHCP : aucun appareil ne joindra
    // le serveur par la, l afficher enverrait l installateur dans le mur.
    for (const a of networkAddresses(3000)) {
      assert.ok(!a.url.includes('169.254.'), `adresse inutilisable proposee : ${a.url}`);
    }
  });
});
