/**
 * Lancement des services auxiliaires en meme temps que l'application.
 *
 * ParleDocteur sait travailler seul : la base, le serveur web et trois des
 * quatre moteurs de transcription sont dans l'application. Un quatrieme moteur
 * — Griot, pour une consultation tenue en fon — demande PyTorch, donc un
 * processus Python a part.
 *
 * Demander au praticien d'ouvrir un terminal avant sa consultation n'est pas
 * une option. Ce module demarre ces services avec l'application, en dev comme
 * dans l'executable, et les arrete avec elle.
 *
 * REGLE QUI COMMANDE TOUT LE RESTE : un service auxiliaire qui manque, qui
 * refuse de demarrer ou qui n'a pas ses dependances ne doit JAMAIS empecher
 * ParleDocteur de s'ouvrir. Un dispensaire isole sans Python garde les trois
 * autres moteurs et son dossier medical. Chaque echec est donc rapporte en
 * clair, puis ignore.
 */

import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const WIN = process.platform === 'win32';

/**
 * Services connus.
 *
 * Y ajouter une entree suffit a le faire demarrer avec l'application. Le
 * serveur Whisper de l'etablissement n'y figure pas volontairement : il tourne
 * sur une autre machine, l'application s'y connecte mais n'a pas a le piloter.
 */
export const SERVICES = [
  {
    id: 'griot',
    libelle: 'Griot — transcription en fon',
    dossier: path.join('services', 'griot'),
    script: 'server.py',
    hote: process.env.GRIOT_HOST?.trim() || '127.0.0.1',
    port: Number(process.env.GRIOT_PORT) || 8081,
    /** Modules requis, verifies sans les importer : charger torch coute des secondes. */
    modules: ['fastapi', 'uvicorn', 'torch', 'transformers', 'librosa', 'soundfile'],
    /** Variable que l'application lit pour trouver ce service. */
    variable: 'GRIOT_ENDPOINT',
    installation: 'pip install -r services/griot/requirements.txt (PyTorch d abord, voir pytorch.org)',
  },
];

// ---------------------------------------------------------------- utilitaires

/** Quelqu un ecoute-t-il deja ? Un service lance a la main est adopte, pas double. */
export function ecouteDeja(hote, port, timeout = 400) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: hote, port });
    const fin = (valeur) => {
      socket.destroy();
      resolve(valeur);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => fin(true));
    socket.once('timeout', () => fin(false));
    socket.once('error', () => fin(false));
  });
}

/**
 * Interprete Python a utiliser.
 *
 * L'environnement virtuel du service passe avant tout : c'est la qu'un poste
 * correctement installe range ses dependances, et le seul endroit ou l'on est
 * sur de ce qui est disponible.
 */
export function trouverPython(dossier) {
  const candidats = [];
  const venv = WIN
    ? path.join(dossier, '.venv', 'Scripts', 'python.exe')
    : path.join(dossier, '.venv', 'bin', 'python');
  if (fs.existsSync(venv)) candidats.push({ commande: venv, args: [] });

  const impose = process.env.PARLEDOCTEUR_PYTHON?.trim();
  if (impose) candidats.push({ commande: impose, args: [] });

  if (WIN) candidats.push({ commande: 'py', args: ['-3'] });
  candidats.push({ commande: 'python3', args: [] }, { commande: 'python', args: [] });

  for (const candidat of candidats) {
    try {
      const essai = spawnSync(candidat.commande, [...candidat.args, '--version'], {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true,
      });
      if (essai.status === 0) return candidat;
    } catch {
      // interprete absent : on passe au suivant
    }
  }
  return null;
}

/**
 * Modules manquants, sans rien importer.
 *
 * `find_spec` regarde si le module est installable ; `import torch` le
 * chargerait vraiment, et couterait plusieurs secondes a chaque demarrage
 * uniquement pour repondre a une question de presence.
 */
export function modulesManquants(python, modules) {
  const code =
    'import importlib.util as u; ' +
    'print(" ".join(m for m in ' + JSON.stringify(modules) + ' if u.find_spec(m) is None))';
  try {
    const essai = spawnSync(python.commande, [...python.args, '-c', code], {
      encoding: 'utf8',
      timeout: 20000,
      windowsHide: true,
    });
    if (essai.status !== 0) return modules; // interprete inutilisable : tout manque
    return essai.stdout.trim().split(/\s+/).filter(Boolean);
  } catch {
    return modules;
  }
}

/** Arret de l arbre de processus : uvicorn et torch essaiment des enfants. */
function tuerArbre(processus) {
  if (!processus || processus.exitCode !== null || processus.signalCode !== null) return;
  if (WIN) {
    // kill() ne remonte pas l arbre sous Windows : le service resterait en
    // ecoute apres la fermeture, et le lancement suivant croirait l adopter.
    spawnSync('taskkill', ['/pid', String(processus.pid), '/t', '/f'], { windowsHide: true });
  } else {
    try {
      process.kill(-processus.pid, 'SIGTERM');
    } catch {
      processus.kill('SIGTERM');
    }
  }
}

// ------------------------------------------------------------------ demarrage

/**
 * Demarre les services declares et rend les variables a passer a l application.
 *
 * Ne bloque pas sur le chargement du modele : le service est lance, l adresse
 * est connue, et la fenetre s ouvre. Griot charge plusieurs gigaoctets de
 * poids ; attendre serait une minute d ecran noir a chaque lancement.
 */
export async function startServices({ root = process.cwd(), log = console.log, services = SERVICES } = {}) {
  const variables = {};
  const lances = [];

  for (const service of services) {
    const prefixe = `[${service.id}]`;
    const adresse = `http://${service.hote}:${service.port}/`;

    // 1. Deja en ecoute : on l adopte, sans en lancer un second sur le meme port.
    if (await ecouteDeja(service.hote, service.port)) {
      log(`${prefixe} deja en ecoute sur ${adresse} — reutilise.`);
      variables[service.variable] = adresse;
      continue;
    }

    // 2. Service absent de cette installation : silence. C est le cas normal
    //    d un poste qui n a pas besoin du fon.
    const dossier = path.join(root, service.dossier);
    const script = path.join(dossier, service.script);
    if (!fs.existsSync(script)) continue;

    // 3. Python et dependances. Un manque est dit une fois, avec le remede.
    const python = trouverPython(dossier);
    if (!python) {
      log(`${prefixe} Python introuvable — ${service.libelle} restera indisponible.`);
      log(`${prefixe} Les autres moteurs de transcription fonctionnent normalement.`);
      continue;
    }
    const manquants = modulesManquants(python, service.modules);
    if (manquants.length > 0) {
      log(`${prefixe} dependances absentes : ${manquants.join(', ')}.`);
      log(`${prefixe} Pour l activer : ${service.installation}`);
      log(`${prefixe} Les autres moteurs de transcription fonctionnent normalement.`);
      continue;
    }

    // 4. Lancement.
    const processus = spawn(python.commande, [...python.args, service.script], {
      cwd: dossier,
      env: {
        ...process.env,
        GRIOT_HOST: service.hote,
        GRIOT_PORT: String(service.port),
        PYTHONUNBUFFERED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: !WIN,
      windowsHide: true,
    });

    processus.stdout?.on('data', (d) => log(`${prefixe} ${String(d).trimEnd()}`));
    processus.stderr?.on('data', (d) => log(`${prefixe} ${String(d).trimEnd()}`));
    processus.on('error', (e) => log(`${prefixe} lancement impossible : ${e.message}`));
    processus.on('exit', (code) => {
      if (code !== 0 && code !== null) log(`${prefixe} arrete (code ${code}).`);
    });

    log(`${prefixe} demarrage sur ${adresse} — le modele se charge en arriere-plan.`);
    variables[service.variable] = adresse;
    lances.push({ service, processus });
  }

  return {
    variables,
    /** Les services que NOUS avons lances. Ceux adoptes ne sont pas les notres. */
    lances: lances.map((l) => l.service.id),
    stop() {
      for (const { processus } of lances) tuerArbre(processus);
    },
  };
}

// ------------------------------------------------------------------- en direct

/**
 * `npm run services` : les services seuls, sans l'application.
 *
 * Utile avant une demonstration — on paie le chargement du modele pendant
 * l'installation de la salle, pas devant le public — et pour verifier une
 * installation Python sans lancer tout le reste.
 */
if (process.argv.includes('--autonome')) {
  const demarres = await startServices({ log: (m) => console.log(m) });
  const adresses = Object.entries(demarres.variables);
  if (adresses.length === 0) {
    console.log('Aucun service auxiliaire disponible sur ce poste.');
    process.exit(0);
  }
  for (const [variable, adresse] of adresses) console.log(`${variable}=${adresse}`);
  console.log('Ctrl+C pour arreter.');
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      demarres.stop();
      process.exit(0);
    });
  }
  // Maintient le processus en vie tant que les services tournent.
  setInterval(() => {}, 1 << 30);
}
