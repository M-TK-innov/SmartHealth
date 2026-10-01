/**
 * Recupere les poids du modele de transcription sur appareil.
 *
 *   npm run modeles            recupere ce qui manque
 *   npm run modeles -- --force retelecharge tout
 *
 * POURQUOI : sans ces fichiers, le moteur « Whisper sur l'appareil » va les
 * chercher sur Internet au premier usage. Un dispensaire isole n'a donc AUCUN
 * moteur qui transcrive sans rien faire sortir — exactement le moteur dont il
 * a le plus besoin. On les embarque donc dans l'installateur.
 *
 * Les poids ne sont pas versionnes : 240 Mo de binaires n'ont rien a faire
 * dans un depot, et ils se retelechargent a l'identique. Ce script est
 * appele par la preparation du paquet desktop.
 *
 * Whisper est publie par OpenAI sous licence MIT ; la conversion ONNX
 * quantifiee utilisee ici est celle de la communaute Xenova.
 */

import { createWriteStream, existsSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Depot et fichiers a recuperer.
 *
 * La liste est EXPLICITE et non « tout le depot » : `Xenova/whisper-small`
 * contient aussi les variantes non fusionnees du decodeur (285 Mo de plus)
 * dont transformers.js n'a pas besoin en dtype q8. Les prendre doublerait
 * presque la taille de l'installateur pour rien.
 */
export const MODELE = {
  depot: 'Xenova/whisper-small',
  revision: 'main',
  fichiers: [
    'config.json',
    'generation_config.json',
    'preprocessor_config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'onnx/encoder_model_quantized.onnx',
    'onnx/decoder_model_merged_quantized.onnx',
  ],
};

/** Ou le navigateur ira les chercher : public/ est servi a la racine du site. */
export function dossierModele(racine = RACINE) {
  return path.join(racine, 'public', 'modeles', ...MODELE.depot.split('/'));
}

/** Le modele est-il deja complet sur ce poste ? */
export function modelePresent(racine = RACINE) {
  const base = dossierModele(racine);
  return MODELE.fichiers.every((f) => {
    const cible = path.join(base, ...f.split('/'));
    // Un fichier de taille nulle est un telechargement interrompu : le traiter
    // comme present ferait echouer le moteur a la premiere consultation, ce qui
    // est pire que de le retelecharger.
    return existsSync(cible) && statSync(cible).size > 0;
  });
}

/** Nombre de reprises avant d'abandonner un fichier. */
const REPRISES = 6;

/**
 * curl est-il disponible ?
 *
 * Il est prefere quand il l'est. Sur une liaison instable — celle d'un centre
 * de sante, ou celle depuis laquelle ce paquet se prepare — le `fetch` de Node
 * abandonne des que la connexion est coupee, et la reprise ne redemarre pas :
 * on observe le meme octet a chaque essai. curl reprend au bon endroit et
 * survit aux coupures, ce qui est exactement le besoin ici.
 */
function curlDisponible() {
  try {
    return spawnSync('curl', ['--version'], { encoding: 'utf8', timeout: 5000 }).status === 0;
  } catch {
    return false;
  }
}

/** Telechargement par curl, avec reprise sur le fichier partiel. */
function telechargerAvecCurl(url, temporaire) {
  const res = spawnSync(
    'curl',
    [
      '-L', // suivre la redirection vers le CDN
      '-C', '-', // reprendre la ou le fichier partiel s'arrete
      '--retry', '8',
      '--retry-all-errors',
      '--retry-delay', '3',
      '--connect-timeout', '30',
      '-s', '-S',
      '-o', temporaire,
      url,
    ],
    { encoding: 'utf8', timeout: 45 * 60 * 1000 },
  );
  if (res.status !== 0) throw new Error(String(res.stderr || '').trim() || `curl a rendu ${res.status}`);
}

/**
 * Telecharge un fichier, en reprenant la ou il s'est arrete.
 *
 * Les poids font 150 Mo et la connexion visee est celle d'un centre de sante :
 * une coupure est la regle, pas l'exception. Sans reprise, chaque coupure
 * recommencerait tout, et un lien lent ne finirait jamais.
 *
 * Le fichier definitif n'est ecrit qu'une fois la taille attendue atteinte. Un
 * fichier tronque produirait un modele qui se charge puis echoue en pleine
 * consultation — un echec franc au moment de la preparation vaut mille fois
 * mieux.
 */
async function telecharger(fichier, base, log) {
  const cible = path.join(base, ...fichier.split('/'));
  const temporaire = `${cible}.partiel`;
  mkdirSync(path.dirname(cible), { recursive: true });

  const url = `https://huggingface.co/${MODELE.depot}/resolve/${MODELE.revision}/${fichier}`;
  let derniere = null;

  // curl gere lui-meme ses reprises : un seul passage suffit.
  if (curlDisponible()) {
    telechargerAvecCurl(url, temporaire);
    const obtenu = statSync(temporaire).size;
    if (attenduPour(fichier) > 0 && obtenu !== attenduPour(fichier)) {
      throw new Error(`${fichier} : ${obtenu} octets sur ${attenduPour(fichier)} attendus`);
    }
    rmSync(cible, { force: true });
    const { renameSync } = await import('node:fs');
    renameSync(temporaire, cible);
    return obtenu;
  }

  for (let essai = 1; essai <= REPRISES; essai++) {
    const deja = existsSync(temporaire) ? statSync(temporaire).size : 0;

    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: deja > 0 ? { Range: `bytes=${deja}-` } : undefined,
      });

      // 206 : le serveur reprend ou on s'etait arrete. 200 avec un octet deja
      // recu : il ignore la reprise et renvoie tout — on repart de zero plutot
      // que de concatener deux debuts de fichier.
      const reprend = res.status === 206;
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      if (deja > 0 && !reprend) rmSync(temporaire, { force: true });

      const restant = Number(res.headers.get('content-length')) || 0;
      const attendu = reprend ? deja + restant : restant;

      await pipeline(res.body, createWriteStream(temporaire, { flags: reprend ? 'a' : 'w' }));

      const obtenu = statSync(temporaire).size;
      if (attendu > 0 && obtenu !== attendu) throw new Error(`${obtenu} octets sur ${attendu}`);

      rmSync(cible, { force: true });
      const { renameSync } = await import('node:fs');
      renameSync(temporaire, cible);
      return obtenu;
    } catch (e) {
      derniere = e;
      const acquis = existsSync(temporaire) ? statSync(temporaire).size : 0;
      if (essai < REPRISES) {
        log(`    coupure (${Math.round(acquis / 1024 / 1024)} Mo acquis) — reprise ${essai}/${REPRISES - 1}`);
        await new Promise((r) => setTimeout(r, 1500 * essai));
      }
    }
  }

  throw new Error(`${fichier} : ${derniere instanceof Error ? derniere.message : derniere}`);
}

/**
 * Taille attendue d'un fichier, relevee aupres du depot.
 *
 * Elle est demandee une fois et memorisee : sans elle, on ne peut pas
 * distinguer un telechargement termine d'un telechargement coupe, et un
 * fichier tronque produirait un modele qui se charge puis echoue en pleine
 * consultation.
 */
let tailles = null;

async function chargerTailles() {
  if (tailles) return tailles;
  tailles = new Map();
  try {
    const res = await fetch(`https://huggingface.co/api/models/${MODELE.depot}?blobs=true`);
    if (res.ok) {
      const d = await res.json();
      for (const s of d.siblings ?? []) if (s.size) tailles.set(s.rfilename, s.size);
    }
  } catch {
    // Sans le catalogue, on ne verifie pas la taille : mieux vaut un
    // telechargement non verifie qu'aucun telechargement.
  }
  return tailles;
}

function attenduPour(fichier) {
  return tailles?.get(fichier) ?? 0;
}

export async function recupererModele({ racine = RACINE, force = false, log = console.log } = {}) {
  const base = dossierModele(racine);

  if (!force && modelePresent(racine)) {
    log(`  modele deja present : ${path.relative(racine, base)}`);
    return { telecharges: 0, octets: 0 };
  }

  await chargerTailles();
  log(`  depot : ${MODELE.depot} (${MODELE.fichiers.length} fichiers)${curlDisponible() ? '' : ' — curl absent, reprise limitee'}`);
  let octets = 0;
  let telecharges = 0;

  for (const fichier of MODELE.fichiers) {
    const cible = path.join(base, ...fichier.split('/'));
    if (!force && existsSync(cible) && statSync(cible).size > 0) {
      log(`  deja la  ${fichier}`);
      continue;
    }
    const taille = await telecharger(fichier, base, log);
    octets += taille;
    telecharges += 1;
    log(`  recupere ${fichier}  (${Math.round(taille / 1024 / 1024)} Mo)`);
  }

  log(`  ${telecharges} fichier(s), ${Math.round(octets / 1024 / 1024)} Mo`);
  return { telecharges, octets };
}

// ------------------------------------------------------------------- en direct

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const force = process.argv.includes('--force');
  console.log('Modele de transcription sur appareil');
  try {
    await recupererModele({ force });
    console.log('\nLe modele est servi depuis le poste : plus aucun telechargement au premier usage.');
  } catch (e) {
    console.error(`\nEchec : ${e instanceof Error ? e.message : e}`);
    console.error("Le paquet peut etre construit sans, mais le moteur « sur l'appareil »");
    console.error('ira alors chercher ses poids sur Internet au premier usage.');
    process.exit(1);
  }
}
