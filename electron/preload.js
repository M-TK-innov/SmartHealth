/**
 * Pont rendu <-> processus principal.
 *
 * Volontairement minimal : l'interface web n'a besoin d'aucune capacite
 * native. On expose seulement un marqueur de plateforme, qui permet au code
 * partage de savoir qu'il tourne dans la coque desktop (et donc, par exemple,
 * de ne pas proposer l'installation PWA ni d'enregistrer un service worker).
 *
 * Aucun acces au systeme de fichiers, au reseau ni a Node n'est expose.
 */

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('smarthealth', {
  platform: 'desktop',
  os: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
