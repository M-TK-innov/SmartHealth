/**
 * Lancement de ParleDocteur : services auxiliaires et serveur web, ensemble.
 *
 *   node scripts/lancer.mjs             developpement      (npm run dev)
 *   node scripts/lancer.mjs --prod      serveur de production (npm start)
 *   node scripts/lancer.mjs --desktop   ajoute la fenetre Electron (npm run desktop:dev)
 *
 * Un seul Ctrl+C arrete tout. Sans cela le service Python survivrait au
 * terminal, et le lancement suivant croirait adopter un service sain alors
 * qu'il porte le code d'avant — l'erreur se paierait en pleine consultation.
 *
 * L'executable desktop ne passe pas par ici : il fait le meme travail depuis
 * electron/main.js, avec le meme module services.mjs.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { startServices } from './services.mjs';

const DESKTOP = process.argv.includes('--desktop');
const PROD = process.argv.includes('--prod');
const PORT = Number(process.env.PORT) || 3000;
const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const enfants = [];
let arretEnCours = false;

/**
 * Binaires resolus depuis node_modules, jamais depuis le PATH.
 *
 * Passer par un shell marcherait sous `npm run`, qui ajoute node_modules/.bin
 * au PATH, et echouerait si quelqu un appelle ce script directement. Le shell
 * intercale en plus un processus qui complique l arret sous Windows.
 */
const NEXT = path.join(RACINE, 'node_modules', 'next', 'dist', 'bin', 'next');
const ELECTRON = createRequire(import.meta.url)('electron');

function lancer(commande, args, options = {}) {
  const processus = spawn(commande, args, { stdio: 'inherit', cwd: RACINE, ...options });
  enfants.push(processus);
  return processus;
}

function attendre(port, timeoutMs = 120000) {
  const limite = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const essai = () => {
      const socket = net.connect({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > limite) reject(new Error(`Next n'a pas repondu sur le port ${port}.`));
        else setTimeout(essai, 300);
      });
    };
    essai();
  });
}

function arreter(code) {
  if (arretEnCours) return;
  arretEnCours = true;
  services?.stop();
  for (const enfant of enfants) {
    if (enfant.exitCode === null && enfant.signalCode === null) enfant.kill();
  }
  process.exit(code);
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => arreter(0));
}

// Dernier filet, synchrone : si ce processus s'arrete par un autre chemin — une
// exception, un `timeout`, la fermeture de la console — les enfants doivent
// mourir avec lui. Une fenetre Electron orpheline continuerait d'afficher un
// dossier medical sans serveur derriere.
process.on('exit', () => {
  services?.stop();
  for (const enfant of enfants) {
    if (enfant.exitCode === null && enfant.signalCode === null) enfant.kill();
  }
});

// Les services d'abord : leurs adresses doivent etre dans l'environnement de
// Next au moment ou il demarre, une variable ne se transmet pas apres coup.
const services = await startServices({ log: (m) => console.log(m) });

const next = lancer(
  process.execPath,
  [NEXT, PROD ? 'start' : 'dev', '-p', String(PORT)],
  { env: { ...process.env, ...services.variables } },
);

next.on('exit', (code) => {
  if (!arretEnCours) {
    console.log(`[next] arrete (code ${code}).`);
    arreter(code ?? 0);
  }
});

if (DESKTOP) {
  try {
    await attendre(PORT);
    lancer(ELECTRON, ['.'], {
      env: { ...process.env, PARLEDOCTEUR_DEV_URL: `http://localhost:${PORT}` },
    }).on('exit', () => arreter(0));
  } catch (e) {
    console.error(String(e.message ?? e));
    arreter(1);
  }
}
