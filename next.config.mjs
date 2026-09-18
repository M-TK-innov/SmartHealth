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

  // transformers.js tire onnxruntime-node et sharp, deux paquets natifs lourds
  // dont on n'a pas l'usage : Whisper tourne dans le navigateur, pas sur le
  // serveur. On les ecarte du bundle serveur pour ne pas alourdir le build.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals ?? []), 'onnxruntime-node', 'sharp'];
    }
    return config;
  },
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
  async headers() {
    return [
      // Les en-tetes CORS de l'API FHIR ne figurent plus ici : fixes a la
      // construction, ils obligeaient a reconstruire l'application pour
      // restreindre les origines, et deux en-tetes Access-Control-Allow-Origin
      // (le statique et celui de la route) font rejeter la reponse par le
      // navigateur. Ils sont desormais calcules par requete a partir de la
      // configuration — voir lib/net/fhir-gate.ts.
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
