/**
 * Processus principal de l'application desktop ParleDocteur.
 *
 * L'application desktop n'est pas une simple fenetre pointant vers un site :
 * elle embarque le serveur Next et la base SQLite. Un centre de sante sans
 * connexion Internet installe l'exe et travaille, point. C'est le meme code
 * que la version web — une seule base de code, trois modes de livraison.
 *
 * Le serveur tourne dans un processus enfant lance avec le Node embarque
 * d'Electron (ELECTRON_RUN_AS_NODE), ce qui evite d'exiger Node sur le poste.
 */

const { app, BrowserWindow, shell, dialog, Menu } = require('electron');
const { fork } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');

const isDev = !app.isPackaged;
const DEV_URL = process.env.PARLEDOCTEUR_DEV_URL || 'http://localhost:3000';

/** Une seule instance : deux serveurs sur la meme base SQLite se marcheraient dessus. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let serverProcess = null;
let mainWindow = null;

// ------------------------------------------------------------------ serveur

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error("Le serveur local n'a pas demarre a temps."));
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

async function startServer() {
  const port = await findFreePort();
  const serverEntry = path.join(process.resourcesPath, 'app', 'server.js');

  if (!fs.existsSync(serverEntry)) {
    throw new Error(
      `Serveur introuvable (${serverEntry}). Lancez « npm run desktop:prepare » avant de construire le paquet.`,
    );
  }

  // La base vit dans le dossier de donnees utilisateur : elle survit aux mises
  // a jour de l'application et n'est pas ecrasee par une reinstallation.
  const dataDir = path.join(app.getPath('userData'), 'donnees');
  fs.mkdirSync(dataDir, { recursive: true });

  serverProcess = fork(serverEntry, [], {
    cwd: path.dirname(serverEntry),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      PARLEDOCTEUR_DB: path.join(dataDir, 'parledocteur.db'),
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  serverProcess.stdout?.on('data', (d) => process.stdout.write(`[serveur] ${d}`));
  serverProcess.stderr?.on('data', (d) => process.stderr.write(`[serveur] ${d}`));
  serverProcess.on('exit', (code) => {
    if (code !== 0 && !app.isQuitting) {
      dialog.showErrorBox('ParleDocteur', `Le serveur local s'est arrete (code ${code}).`);
    }
  });

  await waitForServer(port);
  return `http://127.0.0.1:${port}`;
}

// ------------------------------------------------------------------ fenetre

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 380, // le poste peut etre un mini-PC ou une fenetre reduite en visite
    minHeight: 520,
    backgroundColor: '#f7f9fb',
    title: 'ParleDocteur',
    icon: path.join(__dirname, 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // le micro est indispensable : c'est le coeur du produit
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(url);

  // Les liens externes s'ouvrent dans le navigateur du systeme, jamais dans la
  // fenetre de l'application : rien d'exterieur ne doit pouvoir se substituer
  // a l'interface du dossier medical.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(url)) {
      event.preventDefault();
      shell.openExternal(target);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu(url) {
  const template = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Nouvelle consultation',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.loadURL(`${url}/patients`),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Edition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Retablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout selectionner' },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger' },
        { role: 'resetZoom', label: 'Taille reelle' },
        { role: 'zoomIn', label: 'Agrandir' },
        { role: 'zoomOut', label: 'Reduire' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein ecran' },
        { role: 'toggleDevTools', label: 'Outils de developpement' },
      ],
    },
    {
      label: 'Aide',
      submenu: [
        {
          label: 'Emplacement des donnees',
          click: () => shell.openPath(path.join(app.getPath('userData'), 'donnees')),
        },
        {
          label: 'A propos',
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'ParleDocteur',
              message: `ParleDocteur ${app.getVersion()}`,
              detail:
                "Scribe medical assiste par IA.\n\nOutil d'aide a la documentation clinique : toute donnee proposee doit etre relue et validee par un professionnel de sante. La responsabilite medicale demeure celle du praticien.",
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ------------------------------------------------------------------ cycle

// Marqueur de plateforme dans l'agent utilisateur : le code partage sait ainsi
// qu'il tourne dans la coque desktop et n'y propose ni installation PWA ni
// service worker, tous deux sans objet pour une application deja locale.
app.userAgentFallback = app.userAgentFallback + ' ParleDocteurDesktop/' + app.getVersion();

app.whenReady().then(async () => {
  // Le micro est demande par le rendu ; en local on l'autorise sans friction
  // supplementaire, l'application etant elle-meme l'origine de la demande.
  const session = require('electron').session.defaultSession;
  session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'clipboard-sanitized-write');
  });

  try {
    const url = isDev ? DEV_URL : await startServer();
    buildMenu(url);
    createWindow(url);
  } catch (err) {
    dialog.showErrorBox('ParleDocteur — demarrage impossible', String(err?.message ?? err));
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && mainWindow === null) app.quit();
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  serverProcess?.kill();
});

app.on('window-all-closed', () => {
  app.quit();
});
