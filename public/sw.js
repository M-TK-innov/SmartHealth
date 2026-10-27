/**
 * Service worker de SmartHealth.
 *
 * Contexte : centres de sante a connectivite intermittente. L'objectif n'est
 * pas de rendre l'application utilisable hors-ligne dans son integralite — le
 * dossier medical vit sur le serveur — mais de garantir que la coupure reseau
 * ne detruit jamais le travail en cours et n'affiche jamais une erreur brute.
 *
 * Strategie, deliberement conservatrice pour une application medicale :
 *   - ressources statiques (/_next/static, icones) : cache d'abord, elles sont
 *     immuables car leur nom contient une empreinte ;
 *   - navigations : reseau d'abord, repli sur la page hors-ligne. On ne sert
 *     JAMAIS une page de dossier depuis le cache : un dossier medical perime
 *     affiche comme actuel est un risque clinique.
 *   - appels API : reseau uniquement, jamais de cache.
 */

const VERSION = 'v1';
const STATIC_CACHE = `smarthealth-static-${VERSION}`;
const OFFLINE_URL = '/hors-ligne';

const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Les donnees de sante ne sont jamais mises en cache.
  if (url.pathname.startsWith('/api/')) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((page) => page || new Response('Hors ligne', { status: 503 })),
      ),
    );
  }
});

// Permet a la page de forcer l'activation d'une nouvelle version.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
