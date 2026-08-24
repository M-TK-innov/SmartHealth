/**
 * Tests du service worker.
 *
 *   node --test tests/
 *
 * La registration du service worker releve du navigateur. Ce qui se verifie
 * ici, et qui est la vraie question clinique, c'est sa POLITIQUE : quelles
 * requetes il met en cache et surtout lesquelles il ne met jamais en cache.
 *
 * Un dossier medical ou une reponse d'API servis depuis un cache perime
 * seraient un risque pour le patient. Ces tests echouent si une regression
 * introduit ce comportement.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SW_SOURCE = readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');

/** Environnement minimal de service worker : on capture les gestionnaires poses. */
function loadServiceWorker({ origin = 'http://localhost:3000' } = {}) {
  const handlers = {};
  const cacheStore = new Map();

  const makeCache = (name) => {
    if (!cacheStore.has(name)) cacheStore.set(name, new Map());
    const entries = cacheStore.get(name);
    return {
      addAll: async (urls) => urls.forEach((u) => entries.set(u, { url: u })),
      put: async (req, res) => entries.set(typeof req === 'string' ? req : req.url, res),
      match: async (req) => entries.get(typeof req === 'string' ? req : req.url),
      entries,
    };
  };

  const caches = {
    open: async (name) => makeCache(name),
    keys: async () => [...cacheStore.keys()],
    delete: async (name) => cacheStore.delete(name),
    match: async (req) => {
      for (const entries of cacheStore.values()) {
        const hit = entries.get(typeof req === 'string' ? req : req.url);
        if (hit) return hit;
      }
      return undefined;
    },
  };

  const self = {
    addEventListener: (type, fn) => {
      handlers[type] = fn;
    },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
    location: new URL(origin),
    caches,
  };

  const sandbox = {
    self,
    caches,
    URL,
    Response: class Response {
      constructor(body, init = {}) {
        this.body = body;
        this.status = init.status ?? 200;
        this.ok = this.status < 400;
      }
      clone() {
        return this;
      }
    },
    fetch: async () => ({ ok: true, status: 200, clone() { return this; } }),
    Promise,
    console,
    setTimeout,
  };

  vm.createContext(sandbox);
  vm.runInContext(SW_SOURCE, sandbox);
  return { handlers, cacheStore, sandbox };
}

/** Simule une requete et indique si le service worker a pris la main dessus. */
function dispatchFetch(handlers, { url, method = 'GET', mode = 'no-cors' }) {
  let responded = null;
  const event = {
    request: { url, method, mode },
    respondWith: (p) => {
      responded = p;
    },
  };
  handlers.fetch(event);
  return { intercepted: responded !== null, responded };
}

describe('service worker — politique de cache', () => {
  let handlers;

  beforeEach(() => {
    ({ handlers } = loadServiceWorker());
  });

  test('pose bien les gestionnaires install, activate et fetch', () => {
    for (const h of ['install', 'activate', 'fetch', 'message']) {
      assert.equal(typeof handlers[h], 'function', `gestionnaire ${h} manquant`);
    }
  });

  const API_ROUTES = [
    '/api/consultations/abc',
    '/api/patients/123',
    '/api/fhir/Patient/123',
    '/api/export/abc?format=fhir-document',
    '/api/prescriptions/xyz/validate',
    '/api/audit',
  ];

  test("n'intercepte JAMAIS les appels d'API en requete de donnees", () => {
    for (const route of API_ROUTES) {
      const { intercepted } = dispatchFetch(handlers, {
        url: `http://localhost:3000${route}`,
        mode: 'cors',
      });
      assert.equal(intercepted, false, `${route} ne doit pas passer par le service worker`);
    }
  });

  // Cas qui fait reellement travailler le garde-fou `/api/` : ouvrir une URL
  // d'API directement dans la barre d'adresse produit une requete en mode
  // navigate. Sans le garde-fou, le service worker la prendrait en charge et
  // renverrait la page hors-ligne a la place de la reponse de l'API.
  test("n'intercepte pas non plus une URL d'API ouverte en navigation directe", () => {
    for (const route of API_ROUTES) {
      const { intercepted } = dispatchFetch(handlers, {
        url: `http://localhost:3000${route}`,
        mode: 'navigate',
      });
      assert.equal(intercepted, false, `${route} en navigation directe doit rester hors du service worker`);
    }
  });

  test("n'intercepte pas les requetes non-GET", () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const { intercepted } = dispatchFetch(handlers, {
        url: 'http://localhost:3000/consultations/abc',
        method,
        mode: 'navigate',
      });
      assert.equal(intercepted, false, `${method} ne doit pas etre interceptee`);
    }
  });

  test("n'intercepte pas les requetes vers une autre origine", () => {
    const { intercepted } = dispatchFetch(handlers, {
      url: 'https://exemple.test/pixel.png',
      mode: 'no-cors',
    });
    assert.equal(intercepted, false);
  });

  test('prend en charge les ressources statiques immuables', () => {
    const routes = ['/_next/static/chunks/main-abc123.js', '/icons/icon-192.png', '/manifest.webmanifest'];
    for (const route of routes) {
      const { intercepted } = dispatchFetch(handlers, { url: `http://localhost:3000${route}` });
      assert.equal(intercepted, true, `${route} doit etre servie par le service worker`);
    }
  });

  test('prend en charge les navigations, pour pouvoir replier sur la page hors-ligne', () => {
    const { intercepted } = dispatchFetch(handlers, {
      url: 'http://localhost:3000/patients/123',
      mode: 'navigate',
    });
    assert.equal(intercepted, true);
  });

  // L'invariant clinique central : une page de dossier peut etre servie depuis
  // le reseau, jamais depuis le cache. Sinon un praticien pourrait consulter
  // une version perimee d'un dossier en la croyant a jour.
  test('une page de dossier servie avec succes ne finit jamais en cache', async () => {
    const { handlers: h, cacheStore } = loadServiceWorker();
    const pages = ['/patients/123', '/consultations/abc', '/ordonnance/xyz', '/audit'];

    for (const page of pages) {
      const { responded } = dispatchFetch(h, { url: `http://localhost:3000${page}`, mode: 'navigate' });
      await responded;
    }

    const cached = [...cacheStore.values()].flatMap((entries) => [...entries.keys()]);
    const fuites = cached.filter((u) => pages.some((p) => String(u).includes(p)));
    assert.deepEqual(fuites, [], `pages de dossier mises en cache : ${fuites.join(', ')}`);
  });

  test('la page hors-ligne et les icones sont prechargees a l installation', async () => {
    const { handlers: h, cacheStore } = loadServiceWorker();
    let waited;
    await h.install({ waitUntil: (p) => (waited = p) });
    await waited;

    const cached = [...cacheStore.values()].flatMap((entries) => [...entries.keys()]);
    assert.ok(cached.includes('/hors-ligne'), 'la page hors-ligne doit etre prechargee');
    assert.ok(cached.some((u) => u.startsWith('/icons/')), 'les icones doivent etre prechargees');
  });

  test('aucune page de dossier ne se retrouve dans le cache de precharge', async () => {
    const { handlers: h, cacheStore } = loadServiceWorker();
    let waited;
    await h.install({ waitUntil: (p) => (waited = p) });
    await waited;

    const cached = [...cacheStore.values()].flatMap((entries) => [...entries.keys()]);
    const sensible = cached.filter((u) => /\/(patients|consultations|ordonnance|audit|api)\b/.test(u));
    assert.deepEqual(sensible, [], `donnees sensibles prechargees : ${sensible.join(', ')}`);
  });

  test('les anciens caches sont purges a l activation', async () => {
    const { handlers: h, cacheStore } = loadServiceWorker();
    cacheStore.set('parledocteur-static-v0', new Map([['/vieux', {}]]));

    let waited;
    await h.activate({ waitUntil: (p) => (waited = p) });
    await waited;

    assert.equal(cacheStore.has('parledocteur-static-v0'), false, 'le cache de version precedente doit disparaitre');
  });
});
