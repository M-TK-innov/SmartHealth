import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import { startServices, modulesManquants, trouverPython, ecouteDeja } from '../scripts/services.mjs';

/**
 * Le superviseur decide de lancer ou non un processus, et cette decision se
 * teste pour de vrai : on ouvre une vraie socket, on interroge un vrai
 * interprete. Ce qu'on ne teste pas ici, c'est le chargement de Griot lui-meme
 * — plusieurs gigaoctets de poids, ce n'est pas l'affaire d'un test unitaire.
 */

function serviceFactice(extra = {}) {
  return {
    id: 'factice',
    libelle: 'Service factice',
    dossier: path.join('services', 'inexistant-' + Math.random().toString(36).slice(2)),
    script: 'server.py',
    hote: '127.0.0.1',
    port: 0,
    modules: [],
    variable: 'FACTICE_ENDPOINT',
    installation: 'sans objet',
    ...extra,
  };
}

/** Ouvre un vrai serveur TCP et rend son port. */
function ecouteur() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => resolve({ port: srv.address().port, fermer: () => srv.close() }));
  });
}

describe('lancement des services auxiliaires', () => {
  test('un service deja en ecoute est adopte, pas relance', async () => {
    const { port, fermer } = await ecouteur();
    try {
      const muet = [];
      const res = await startServices({
        log: (m) => muet.push(m),
        services: [serviceFactice({ port })],
      });
      // L'adresse est rendue a l'application...
      assert.equal(res.variables.FACTICE_ENDPOINT, `http://127.0.0.1:${port}/`);
      // ...mais rien n'a ete lance : sinon deux processus se disputeraient le port.
      assert.deepEqual(res.lances, []);
      // Et l'arret ne doit pas toucher un service qui ne nous appartient pas.
      res.stop();
      assert.equal(await ecouteDeja('127.0.0.1', port), true);
    } finally {
      fermer();
    }
  });

  test('un service absent du poste est ignore en silence', async () => {
    const res = await startServices({ log: () => {}, services: [serviceFactice({ port: 59_999 })] });
    assert.deepEqual(res.variables, {});
    assert.deepEqual(res.lances, []);
  });

  test("l'echec d'un service n'empeche pas les autres d'etre rendus", async () => {
    const { port, fermer } = await ecouteur();
    try {
      const res = await startServices({
        log: () => {},
        services: [
          serviceFactice({ id: 'absent', port: 59_998 }),
          serviceFactice({ id: 'vivant', port, variable: 'VIVANT_ENDPOINT' }),
        ],
      });
      assert.equal(res.variables.VIVANT_ENDPOINT, `http://127.0.0.1:${port}/`);
      assert.equal(res.variables.FACTICE_ENDPOINT, undefined);
    } finally {
      fermer();
    }
  });

  test('un service sans dependances installees est ecarte, pas lance', async () => {
    // Dossier reel avec un script reel, mais un module requis introuvable :
    // le superviseur doit renoncer AVANT de lancer un processus qui planterait.
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-service-'));
    fs.writeFileSync(path.join(dossier, 'server.py'), 'raise SystemExit(1)\n');
    const messages = [];
    try {
      const res = await startServices({
        root: path.dirname(dossier),
        log: (m) => messages.push(m),
        services: [
          serviceFactice({
            dossier: path.basename(dossier),
            port: 59_997,
            modules: ['module_qui_nexiste_pas_du_tout'],
          }),
        ],
      });
      assert.deepEqual(res.lances, []);
      assert.deepEqual(res.variables, {});
      assert.ok(
        messages.some((m) => m.includes('module_qui_nexiste_pas_du_tout')),
        'le module manquant doit etre nomme, sinon le message est inutilisable',
      );
      assert.ok(
        messages.some((m) => m.includes('Pour l activer')),
        'le remede doit accompagner le constat',
      );
    } finally {
      fs.rmSync(dossier, { recursive: true, force: true });
    }
  });
});

describe('cycle de vie d un service reellement lance', () => {
  test('il est lance, son adresse est rendue, et stop() l arrete', async (t) => {
    const python = trouverPython('.');
    if (!python) return t.skip('aucun interprete Python sur ce poste');

    // Un service minimal : il ecoute, c'est tout ce qu'on lui demande ici.
    // Le vrai Griot chargerait plusieurs gigaoctets de poids, hors de portee
    // d'un test — mais le trajet lancement/adresse/arret est le meme.
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-service-'));
    fs.writeFileSync(
      path.join(dossier, 'server.py'),
      [
        'import http.server, os',
        'port = int(os.environ["GRIOT_PORT"])',
        'http.server.HTTPServer(("127.0.0.1", port), http.server.BaseHTTPRequestHandler).serve_forever()',
      ].join('\n') + '\n',
    );

    const port = 59_321;
    let res;
    try {
      res = await startServices({
        root: path.dirname(dossier),
        log: () => {},
        services: [serviceFactice({ dossier: path.basename(dossier), port, modules: ['json'] })],
      });

      assert.deepEqual(res.lances, ['factice'], 'le service devait etre lance');
      assert.equal(res.variables.FACTICE_ENDPOINT, `http://127.0.0.1:${port}/`);

      // Il doit repondre — sinon l'application annoncerait un moteur mort.
      let vivant = false;
      for (let i = 0; i < 40 && !vivant; i++) {
        vivant = await ecouteDeja('127.0.0.1', port, 200);
        if (!vivant) await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(vivant, true, "le service lance n'a jamais repondu");

      // Et il doit vraiment mourir : un service survivant a la fermeture serait
      // adopte au lancement suivant alors qu'il porte le code d'avant.
      res.stop();
      let mort = false;
      for (let i = 0; i < 40 && !mort; i++) {
        mort = !(await ecouteDeja('127.0.0.1', port, 200));
        if (!mort) await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(mort, true, "le service n'a pas ete arrete");
    } finally {
      res?.stop();
      fs.rmSync(dossier, { recursive: true, force: true });
    }
  });
});

describe('detection de l environnement Python', () => {
  test('les modules manquants sont nommes, les presents ignores', () => {
    const python = trouverPython('.');
    if (!python) return; // poste sans Python : le superviseur le gere, rien a verifier ici
    const manquants = modulesManquants(python, ['json', 'module_qui_nexiste_pas_du_tout']);
    assert.deepEqual(manquants, ['module_qui_nexiste_pas_du_tout']);
  });

  test('un interprete introuvable ne fait pas tomber la detection', () => {
    const manquants = modulesManquants({ commande: 'python-qui-nexiste-pas', args: [] }, ['json']);
    // Tout est declare manquant plutot que de laisser croire a une installation saine.
    assert.deepEqual(manquants, ['json']);
  });
});
