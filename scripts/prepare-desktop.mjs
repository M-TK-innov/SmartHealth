/**
 * Construit la sortie `standalone` de Next et la prepare pour Electron.
 *
 *   node scripts/prepare-desktop.mjs            (construit puis assemble)
 *   node scripts/prepare-desktop.mjs --no-build (assemble une sortie existante)
 *
 * Next produit un serveur autonome dans .next/standalone, mais laisse hors de
 * ce dossier les fichiers statiques et le contenu de public/. On les y recopie
 * pour que .next/standalone soit reellement autoportant : electron-builder
 * n'embarque que ce dossier.
 *
 * La variable BUILD_TARGET est posee ici plutot que dans la ligne de commande
 * npm : la syntaxe `VAR=valeur cmd` n'existe pas sous cmd.exe, et le projet
 * doit se construire aussi bien sous Windows que sous Linux ou macOS.
 */

import { cpSync, existsSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');

// Les icones sont produites par un script, donc hors depot : on les regenere
// avant de construire, sinon un clone neuf produirait un paquet sans icone.
spawnSync(process.execPath, [path.join('scripts', 'gen-icons.mjs')], { stdio: 'inherit' });

// Les poids du modele de transcription sur appareil, meme raison : hors depot,
// recuperes ici. Sans eux, l'installateur produit une application qui ira
// chercher son modele sur Internet au premier usage — c'est-a-dire aucun
// moteur local sur un poste isole, precisement la ou il sert le plus.
console.log('\nModele de transcription sur appareil...\n');
const modele = spawnSync(process.execPath, [path.join('scripts', 'modeles.mjs')], { stdio: 'inherit' });
if (modele.status !== 0) {
  console.error(
    "\nARRET : les poids du modele n'ont pas pu etre recuperes.\n" +
      'Construire malgre tout produirait un installateur qui promet un moteur\n' +
      'hors ligne sans le fournir. Relancez avec une connexion, ou retirez\n' +
      'sciemment cette etape si vous assumez un paquet sans modele embarque.',
  );
  process.exit(1);
}

if (!process.argv.includes('--no-build')) {
  console.log('\nConstruction de la cible desktop (sortie standalone)...\n');
  const res = spawnSync('npx', ['next', 'build'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, BUILD_TARGET: 'desktop' },
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
  console.log();
}

if (!existsSync(path.join(standalone, 'server.js'))) {
  console.error(
    'Sortie standalone introuvable.\n' +
      'Verifiez que next.config.mjs bascule bien sur output: "standalone" quand BUILD_TARGET=desktop.',
  );
  process.exit(1);
}

const copies = [
  { from: path.join(root, '.next', 'static'), to: path.join(standalone, '.next', 'static'), label: 'assets Next' },
  { from: path.join(root, 'public'), to: path.join(standalone, 'public'), label: 'public/ (icones, manifeste, sw)' },
];

for (const { from, to, label } of copies) {
  if (!existsSync(from)) {
    console.warn(`  ignore : ${from} est absent`);
    continue;
  }
  rmSync(to, { recursive: true, force: true });
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`  copie  : ${label}`);
}

// -------------------------------------------------- purge des donnees de sante
//
// Le traceur de fichiers de Next suit la reference a ./data/parledocteur.db
// presente dans lib/db.ts et recopie la base dans la sortie standalone.
// `outputFileTracingExcludes` ne l'en empeche pas. Sans cette purge, un
// installateur construit sur un poste de production embarquerait et
// distribuerait de vrais dossiers medicaux.
//
// La verification est bloquante : mieux vaut un build en echec qu'un paquet
// contenant des donnees de patients.

const dataInBundle = path.join(standalone, 'data');
if (existsSync(dataInBundle)) {
  rmSync(dataInBundle, { recursive: true, force: true });
  console.log('  purge  : data/ (base de donnees exclue du paquet)');
}

const leftovers = [];
(function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(full);
    else if (/\.(db|db-wal|db-shm|sqlite)$/i.test(entry.name) || /^\.env/.test(entry.name)) leftovers.push(full);
  }
})(standalone);

if (leftovers.length) {
  console.error('\nARRET : des donnees ou des secrets subsistent dans le paquet :');
  for (const f of leftovers) console.error('  ' + path.relative(root, f));
  process.exit(1);
}

console.log('  verifie: aucune base ni fichier .env dans le paquet');
console.log('\n.next/standalone est autoportant. Etape suivante : npm run desktop:build');
