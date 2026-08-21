/**
 * Une seule base de code, deux cibles de construction :
 *
 *   npm run build            -> serveur web classique (`next start`)
 *   BUILD_TARGET=desktop     -> sortie `standalone`, serveur autonome embarque
 *                               dans l'application Electron
 *
 * La bascule est conditionnelle car `next start` est incompatible avec la
 * sortie standalone : garder les deux modes evite de sacrifier le deploiement
 * web pour la version desktop.
 */

const isDesktop = process.env.BUILD_TARGET === 'desktop';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isDesktop ? 'standalone' : undefined,

  serverExternalPackages: ['node:sqlite'],
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
  async headers() {
    return [
      {
        // Interoperabilite : les SIH tiers doivent pouvoir interroger l'API FHIR
        source: '/api/fhir/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.FHIR_CORS_ORIGIN || '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization' },
        ],
      },
      {
        // Le service worker ne doit jamais etre servi depuis un cache perime,
        // sinon une correction de securite peut mettre des jours a se propager.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
