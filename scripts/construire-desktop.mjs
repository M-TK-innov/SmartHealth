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
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const essai = process.argv.includes('--essai');
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

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

// On appelle le CLI d'electron-builder par son fichier, et non par `npx`.
// Sous Windows, `npx.cmd` passe par un interpreteur : Node l'a signale
// (DEP0190), l'etape a ete avalee sans un mot et le script a rendu 0 sans
// avoir rien construit. Un succes silencieux qui ne produit pas de fichier
// est pire qu'un echec : on livre l'installateur de la fois d'avant.
const cli = createRequire(import.meta.url).resolve('electron-builder/cli.js');

// La cle a surcharger est `win.artifactName` et non `artifactName` : c'est
// dans `build.win` que ce projet la declare, et la cle specifique a la
// plateforme l'emporte sur la generique. Surcharger la mauvaise ne provoque
// aucune erreur — electron-builder produit simplement un paquet d'essai sous
// le nom de la version vendue. On passe donc les deux.
const builder = spawnSync(
  process.execPath,
  [
    cli,
    '--win',
    '--publish',
    'never',
    `--config.artifactName=${nom}`,
    `--config.win.artifactName=${nom}`,
  ],
  { stdio: 'inherit' },
);

if (builder.error) {
  console.error("\nARRET : electron-builder n'a pas pu etre lance —", builder.error.message);
  process.exit(1);
}

const attendu = path.join(
  'dist-desktop',
  nom.replace('${version}', version).replace('${ext}', 'exe'),
);
// La SEULE preuve de livraison est le fichier. Un code de sortie n'en est
// pas une : une premiere version annoncait l'installateur sur la foi du code
// rendu, et l'a annonce une fois alors qu'electron-builder venait d'echouer
// — le dossier contenait encore le paquet de la fois d'avant, qu'on aurait
// livre sans rien remarquer.
if (!existsSync(attendu)) {
  console.error(
    `\nARRET : ${attendu} n'existe pas` +
      (builder.status === 0 ? ', alors qu electron-builder a rendu 0.' : '.'),
  );
  process.exit(1);
}

if (builder.status !== 0) {
  console.error(`\nARRET : electron-builder a echoue (code ${builder.status}).`);
  process.exit(builder.status ?? 1);
}

console.log(`\nInstallateur : ${attendu}`);
console.log(`Saveur       : ${essai ? "essai, sept jours" : 'version complete'}`);
