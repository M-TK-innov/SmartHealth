/**
 * Construit l'installateur Windows, dans l'une des deux saveurs.
 *
 *   node scripts/construire-desktop.mjs            version complete
 *   node scripts/construire-desktop.mjs --essai    version d'essai, sept jours
 *
 * POURQUOI UN SCRIPT ET NON UNE LIGNE NPM
 *
 * Le nom du fichier produit s'ecrit avec les macros d'electron-builder,
 * `${version}` et `${ext}`. Dans un script npm, bash les remplacerait par du
 * vide avant qu'electron-builder ne les voie, et cmd.exe les laisserait
 * passer : le paquet changerait de nom selon la machine qui le construit.
 * Ici les arguments sont transmis tels quels, sans interpreteur.
 *
 * LES DEUX SAVEURS NE PORTENT PAS LE MEME NOM, a dessein. Deux fichiers
 * identiques dont l'un se verrouille au bout de sept jours, c'est une
 * livraison qui part en essai sans que personne ne s'en apercoive avant le
 * huitieme jour.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const essai = process.argv.includes('--essai');

const prepare = spawnSync(
  process.execPath,
  [path.join('scripts', 'prepare-desktop.mjs'), ...(essai ? ['--essai'] : [])],
  { stdio: 'inherit' },
);
if (prepare.status !== 0) process.exit(prepare.status ?? 1);

const nom = essai
  ? 'SmartHealth-${version}-essai-installateur.${ext}'
  : 'SmartHealth-${version}-installateur.${ext}';

console.log(`\nConstruction de l'installateur : ${essai ? "VERSION D'ESSAI (7 jours)" : 'version complete'}`);

const builder = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['electron-builder', '--win', '--publish', 'never', `--config.artifactName=${nom}`],
  { stdio: 'inherit' },
);
process.exit(builder.status ?? 1);
