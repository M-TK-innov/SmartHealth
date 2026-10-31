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

  /**
   * Repertoire de sortie, surchargeable.
   *
   * Deux processus Next qui partagent `.next` se marchent dessus : celui
   * qui construit reecrit le manifeste de types pendant que l'autre le
   * lit, et la construction echoue sur un fichier de types « introuvable »
   * qui n'a rien a voir avec le code. Le symptome est deroutant, et la
   * reaction naturelle — supprimer `.next` — interrompt le serveur de
   * developpement d'a cote.
   *
   * Avec NEXT_DIST_DIR, on construit ailleurs sans toucher a l'existant.
   * Valeur par defaut inchangee : rien ne bouge pour qui n'en a pas besoin.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',

  /**
   * L'indicateur de developpement de Next — la pastille flottante en bas a
   * gauche de l'ecran — est retire.
   *
   * Il recouvre le coin ou l'application affiche ses propres elements, et il
   * se montre pendant les demonstrations faites depuis un poste en mode
   * developpement : un badge d'outil au milieu d'un dossier medical n'a rien
   * a y faire. Les informations qu'il donne restent lisibles dans le terminal.
   */
  devIndicators: false,

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
