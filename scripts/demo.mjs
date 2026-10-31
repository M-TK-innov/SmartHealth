/**
 * Lance l'application en mode demonstration, en local.
 *
 *   npm run demo:dev
 *
 * Meme chose que ce que fait Vercel : base en memoire, semee au
 * demarrage. Sert a eprouver la demonstration avant de la publier,
 * plutot que de la decouvrir en ligne.
 *
 * On resout `next` dans node_modules plutot que de passer par le PATH :
 * sur un poste ou plusieurs versions coexistent, le PATH ne designe pas
 * forcement celle du projet.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const next = path.join(racine, 'node_modules', 'next', 'dist', 'bin', 'next');

if (!existsSync(next)) {
  console.error('next introuvable dans node_modules. Lancez d abord « npm install ».');
  process.exit(1);
}

const port = process.env.PORT || '3000';
console.log('SmartHealth — mode DEMONSTRATION');
console.log('  base en memoire, semee au demarrage ; rien n est conserve.');
console.log(`  http://localhost:${port}/demo`);
console.log('');

const enfant = spawn(process.execPath, [next, 'dev', '-p', port], {
  cwd: racine,
  stdio: 'inherit',
  env: { ...process.env, SMARTHEALTH_DEMO: '1' },
});

const arreter = () => {
  if (!enfant.killed) enfant.kill();
};
process.on('SIGINT', arreter);
process.on('SIGTERM', arreter);
process.on('exit', arreter);

enfant.on('exit', (code) => process.exit(code ?? 0));
