/**
 * Recalcule les mesures annoncees sur l'attribution des tours de parole.
 *
 *   npm run mesure
 *
 * A lancer AVANT d'annoncer un chiffre, quelque part que ce soit. Un nombre
 * compte a la main devient faux au premier changement de la detection, et
 * personne ne s'en apercoit — surtout pas celui qui le montre.
 *
 * Le meme corpus est tenu par un test (tests/attribution-corpus.test.mjs), qui
 * lui ne laisse pas passer une attribution fausse. Ce script sert a LIRE le
 * detail ; le test sert a EMPECHER la regression.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mesurer, formater } from '../lib/ai/mesure.ts';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = path.join(RACINE, 'corpus');

const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith('.json'));
if (fichiers.length === 0) {
  console.error(`Aucun corpus annote dans ${DOSSIER}.`);
  process.exit(1);
}

let confusionsRoleTotales = 0;

for (const fichier of fichiers) {
  const corpus = JSON.parse(readFileSync(path.join(DOSSIER, fichier), 'utf8'));
  const mesure = mesurer(corpus.tours);
  confusionsRoleTotales += mesure.confusionsRole;

  console.log('');
  console.log(formater(mesure, `${corpus.id} — ${corpus.description}`));
  console.log('');
  console.log('  Provenance :', corpus.provenance);
  console.log('  Limites    :', corpus.limites);
  if (corpus.aucune_hauteur) console.log('  Note       :', corpus.aucune_hauteur);
  console.log('');
}

// Ce que ces chiffres ne disent pas, dit ici plutot que laisse a supposer.
console.log('-'.repeat(72));
console.log(
  [
    'Ces chiffres portent sur un corpus de demonstration, ecrit puis annote a la',
    'main. Ils montrent la FORME du resultat — le systeme perd du rappel plutot',
    'que de la precision — et non une performance sur des consultations reelles.',
    'Une mesure de performance demande des enregistrements cliniques annotes par',
    'des soignants : c est un travail de terrain, pas de code.',
  ].join('\n'),
);
console.log('-'.repeat(72));

// Sortie non nulle si l'invariant tombe : utilisable en controle avant une
// publication ou une demonstration. Seule la confusion medecin/non-medecin
// fait echouer — celle entre patient et accompagnant est suivie, pas nulle.
process.exit(confusionsRoleTotales === 0 ? 0 : 1);
