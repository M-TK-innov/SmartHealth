/**
 * Releve de l'environnement reel du poste.
 *
 * C'est la moitie sale de la verification des prerequis : elle touche au
 * systeme de fichiers, aux commandes de la plateforme et a l'environnement.
 * Elle est separee des regles (regles.ts) pour que celles-ci restent testables
 * sur des environnements qu'on n'a pas sous la main.
 *
 * RIEN ICI NE DOIT JETER. Un poste ou une mesure echoue reste un poste qu'il
 * faut diagnostiquer : une sonde qui tombe rend « inconnu », jamais une
 * exception qui masquerait les autres constats.
 */

import { existsSync, accessSync, constants, mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type { Releve } from './regles.ts';

const WIN = process.platform === 'win32';

/** Depot du modele de transcription sur appareil, tel que l'installateur l'embarque. */
const MODELE_LOCAL = 'Xenova/whisper-small';

/** Modules exiges par le service de transcription en langue locale. */
const MODULES_SERVICE = ['fastapi', 'uvicorn', 'torch', 'transformers', 'librosa', 'soundfile'];

/**
 * Espace libre sur le volume qui porte un chemin.
 *
 * `statfs` existe depuis Node 18 et couvre les trois plateformes ; on garde un
 * repli par commande systeme pour les cas ou il n'est pas disponible.
 */
function disqueLibreMo(cible: string): number | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { statfsSync } = require('node:fs') as typeof import('node:fs');
    if (typeof statfsSync === 'function') {
      const s = statfsSync(cible);
      return Math.round((Number(s.bavail) * Number(s.bsize)) / (1024 * 1024));
    }
  } catch {
    // on tente le repli
  }
  try {
    if (WIN) {
      const lettre = path.parse(path.resolve(cible)).root.replace(/\\$/, '');
      const res = spawnSync(
        'powershell',
        ['-NoProfile', '-Command', `(Get-PSDrive ${lettre.replace(':', '')}).Free`],
        { encoding: 'utf8', timeout: 8000, windowsHide: true },
      );
      const octets = Number(String(res.stdout).trim());
      return Number.isFinite(octets) ? Math.round(octets / (1024 * 1024)) : null;
    }
    const res = spawnSync('df', ['-Pk', cible], { encoding: 'utf8', timeout: 8000 });
    const ligne = String(res.stdout).trim().split('\n').pop() ?? '';
    const ko = Number(ligne.split(/\s+/)[3]);
    return Number.isFinite(ko) ? Math.round(ko / 1024) : null;
  } catch {
    return null;
  }
}

/** Le dossier existe-t-il, ou peut-il etre cree, et peut-on y ecrire ? */
function inscriptible(dossier: string): boolean {
  try {
    if (!existsSync(dossier)) mkdirSync(dossier, { recursive: true });
    accessSync(dossier, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** Interprete Python utilisable, en suivant le meme ordre que le superviseur de services. */
function python(dossierService: string): { commande: string; args: string[] } | null {
  const candidats: { commande: string; args: string[] }[] = [];
  const venv = WIN
    ? path.join(dossierService, '.venv', 'Scripts', 'python.exe')
    : path.join(dossierService, '.venv', 'bin', 'python');
  if (existsSync(venv)) candidats.push({ commande: venv, args: [] });
  const impose = process.env.PARLEDOCTEUR_PYTHON?.trim();
  if (impose) candidats.push({ commande: impose, args: [] });
  if (WIN) candidats.push({ commande: 'py', args: ['-3'] });
  candidats.push({ commande: 'python3', args: [] }, { commande: 'python', args: [] });

  for (const c of candidats) {
    try {
      const essai = spawnSync(c.commande, [...c.args, '--version'], {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true,
      });
      if (essai.status === 0) return c;
    } catch {
      // interprete absent
    }
  }
  return null;
}

/** Modules absents, verifies sans les importer : charger torch couterait des secondes. */
function modulesManquants(py: { commande: string; args: string[] }): string[] {
  const code =
    'import importlib.util as u; ' +
    `print(" ".join(m for m in ${JSON.stringify(MODULES_SERVICE)} if u.find_spec(m) is None))`;
  try {
    const essai = spawnSync(py.commande, [...py.args, '-c', code], {
      encoding: 'utf8',
      timeout: 20000,
      windowsHide: true,
    });
    if (essai.status !== 0) return MODULES_SERVICE;
    return String(essai.stdout).trim().split(/\s+/).filter(Boolean);
  } catch {
    return MODULES_SERVICE;
  }
}

/**
 * Le modele de transcription sur appareil est-il present ?
 *
 * Il est servi depuis public/modeles quand l'installateur l'embarque. Sa
 * presence decide si un poste isole dispose ou non d'un moteur qui ne fait
 * rien sortir.
 */
function whisperPresent(racines: string[]): boolean {
  for (const racine of racines) {
    // public/ est servi a la racine du site : c'est de la que le navigateur
    // ira chercher les poids. On teste le fichier de configuration, quelques
    // centaines d'octets, et non les poids eux-memes.
    const config = path.join(racine, 'public', 'modeles', ...MODELE_LOCAL.split('/'), 'config.json');
    try {
      if (existsSync(config) && statSync(config).size > 0) return true;
    } catch {
      // chemin illisible : considere absent
    }
  }
  return false;
}

/** Une origine est sure au sens des navigateurs si elle est en https, ou locale. */
export function origineSure(origine: string): boolean {
  try {
    const u = new URL(origine);
    if (u.protocol === 'https:') return true;
    const h = u.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost');
  } catch {
    return false;
  }
}

export interface OptionsReleve {
  /** Origine par laquelle l'application est jointe (en-tete de la requete). */
  origine: string;
  /** Emplacement de la base. */
  cheminDonnees: string;
  /** Racines ou chercher public/modeles et services/. */
  racines: string[];
}

export function relever(o: OptionsReleve): Releve {
  const dossierDonnees = path.dirname(o.cheminDonnees);

  const dossierService =
    o.racines.map((r) => path.join(r, 'services', 'griot')).find((d) => existsSync(path.join(d, 'server.py'))) ?? '';
  const servicePresent = dossierService !== '';

  const py = servicePresent ? python(dossierService) : null;

  return {
    plateforme: process.platform,
    nodeMajeur: Number(process.versions.node.split('.')[0]) || 0,
    memoireMo: Math.round(os.totalmem() / (1024 * 1024)),
    disqueLibreMo: disqueLibreMo(dossierDonnees),
    donneesInscriptibles: inscriptible(dossierDonnees),
    cheminDonnees: dossierDonnees,
    origine: o.origine,
    origineSure: origineSure(o.origine),
    whisperLocalPresent: whisperPresent(o.racines),
    pythonPresent: py !== null,
    pythonModulesManquants: py ? modulesManquants(py) : MODULES_SERVICE,
    serviceLangueLocalePresent: servicePresent,
    cleModeleLangage: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  };
}
