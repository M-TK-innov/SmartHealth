/**
 * Enregistre un parcours video de la plateforme, acteur par acteur.
 *
 * CE QUE LE FILM MONTRE. Une plateforme hospitaliere ne se juge pas sur ses
 * ecrans mais sur le decoupage des acces : qui voit quoi. Le film suit donc un
 * acteur a la fois et ne lui montre QUE ses interfaces.
 *
 * LES LISTES DE VUES NE SONT PAS ECRITES A LA MAIN AU JUGE. Elles viennent de
 * `audit-acces.mjs`, qui interroge le serveur compte par compte et page par
 * page. Une page retiree a un role disparait donc du film au prochain audit,
 * au lieu d y rester en montrant un refus.
 *
 * POURQUOI PLAYWRIGHT ET PAS UN ENREGISTREUR D ECRAN. Un enregistreur filme le
 * bureau : il capte les notifications, la barre des taches et tout ce qui
 * passe devant. Playwright filme la page et rien d autre, et le parcours est
 * un script : il se rejoue a l identique apres chaque changement d interface.
 * Aucun encodeur externe n est requis, le navigateur produit le WebM lui-meme.
 *
 * A FAIRE TOURNER CONTRE UN SERVEUR DE PRODUCTION (`next build` puis
 * `next start`). En developpement chaque page se compile a la premiere
 * visite : le film montre alors des secondes d ecran vide, et le disque
 * sature. En production les pages repondent en quelques millisecondes.
 *
 * Usage : node scripts/enregistrer-parcours.mjs [base] [dossier-sortie]
 *
 * Playwright n est pas une dependance du projet : il pese plus lourd que tout
 * le reste et ne sert qu ici. Installez-le a cote avant de lancer :
 *   npm install playwright && npx playwright install chromium
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, renameSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3210';
const SORTIE = path.resolve(process.argv[3] || 'docs/demo');
const MOT_DE_PASSE = 'SmartHealth2026!';
const LARGEUR = 1280;
const HAUTEUR = 720;

/** Duree d arret par defaut sur une vue, une fois la legende posee. */
const TENUE = 1200;

// ------------------------------------------------------- ouverture de l espace

/**
 * Ouvre une session patient comme le ferait un guichet.
 *
 * L acces a un dossier medical NE S OBTIENT PAS en s inscrivant : un soignant
 * enrole le dossier, ce qui delivre un code a usage unique remis au patient,
 * lequel choisit ensuite son propre code. On rejoue ce geste pour filmer un
 * espace reellement rempli, et non un ecran de connexion deguise en
 * « Mes ordonnances ».
 */
async function ouvrirEspacePatient(page) {
  const ouvert = await page.evaluate(
    async ({ mdp, codeChoisi }) => {
      const poster = (url, corps) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        });

      await fetch('/api/auth/logout', { method: 'POST' });
      const co = await poster('/api/auth/login', {
        email: 'a.sossou@example.bj',
        password: mdp,
      });
      if (!co.ok) return false;

      const { patients = [] } = await fetch('/api/patients').then((r) => r.json());
      for (const p of patients) {
        if (!p.phone) continue;
        // Le Benin est passe aux numeros a dix chiffres. Les donnees de
        // demonstration portent encore l ancienne forme a huit : on la
        // complete, sinon l enrolement refuse le numero.
        let numero = String(p.phone).replace(/\D/g, '');
        if (numero.startsWith('229')) numero = numero.slice(3);
        if (numero.length === 8) numero = `01${numero}`;

        const e = await poster(`/api/patients/${p.id}/enroler`, {
          type: 'telephone',
          identifiant: numero,
        });
        if (!e.ok) continue;
        const { code } = await e.json();

        await fetch('/api/auth/logout', { method: 'POST' });
        // L activation presente le code du guichet ET choisit le code
        // personnel. Elle connecte dans la foulee : demander au patient de se
        // reconnecter juste apres serait le meilleur moyen de le lui faire
        // oublier.
        const a = await poster('/api/espace/activation', {
          type: 'telephone',
          identifiant: numero,
          code,
          pin: codeChoisi,
        });
        if (a.ok) return true;
      }
      return false;
    },
    { mdp: MOT_DE_PASSE, codeChoisi: '481902' },
  );

  if (!ouvert) {
    // On ne fait pas semblant : sans session patient, les vues suivantes
    // montreraient l ecran de connexion en se pretendant « Mes ordonnances ».
    throw new Error("Acces patient non ouvert : l enrolement a echoue");
  }
}

// ---------------------------------------------------------------- le parcours

/**
 * Les acteurs, et pour chacun les interfaces qui lui sont destinees.
 *
 * Chaque liste correspond EXACTEMENT a ce que l audit d acces mesure : aucune
 * page refusee n y figure. Le film ne montre donc jamais un acteur se cogner
 * a une porte fermee, il montre son poste de travail.
 */
const ACTEURS = [
  {
    nom: 'Medecin',
    compte: 'a.sossou@example.bj',
    resume:
      "Consulte, dicte, signe, prescrit. N'encaisse pas, ne dispense pas, ne saisit aucun resultat.",
    vues: [
      { chemin: '/', titre: 'Tableau de bord', note: 'Le medecin parle, le dossier s ecrit.', defile: 520 },
      { chemin: '/patients', titre: 'Patients', note: 'Recherche par numero de dossier, NPI ou telephone.', defile: 360 },
      { clic: 'a[href^="/patients/"]', titre: 'Dossier patient', note: 'Ressource FHIR et journal d acces a portee de clic.', defile: 480 },
      { chemin: '/consultations', titre: 'Consultations', note: 'En cours, a signer, signees.', defile: 320 },
      { clic: 'a[href^="/consultations/"]', titre: 'Consultation', note: 'Ecoute, revue, ordonnance, compte rendu, interoperabilite.', defile: 440 },
      { titre: 'Ordonnance', note: 'Posologie verifiee, grossesse signalee. Rien sans validation humaine.', defile: 620, tenir: 2200 },
      { chemin: '/hopital', titre: 'Lits et files', note: 'Les lits hors service sortent du denominateur.', defile: 500 },
      { chemin: '/hopital/pharmacie', titre: 'Pharmacie', note: 'Il voit le stock pour ne pas prescrire ce qui manque. Il ne dispense pas.', defile: 500 },
      { chemin: '/hopital/plateau', titre: 'Laboratoire', note: 'Il demande, lit et acquitte. Il ne saisit aucun resultat.', defile: 440 },
      { chemin: '/hopital/bloc', titre: 'Bloc operatoire', note: 'Programme et liste de verification avant incision.', defile: 440 },
      { chemin: '/interop', titre: 'Interoperabilite', note: 'FHIR R4, HL7 v2, DHIS2, sans ressaisie.', defile: 440 },
      { chemin: '/interop/rapport-mensuel?a=2026&m=11', titre: 'Rapport mensuel', note: 'Se dit incomplet tant que le mois court, et motive chaque cas ecarte.', defile: 460, tenir: 2400 },
      { chemin: '/corrections', titre: 'Corrections apprises', note: 'Ce que le praticien a corrige, et que le modele retient.', defile: 380 },
      { chemin: '/compte', titre: 'Mon compte', note: 'Sessions ouvertes et changement de mot de passe.', defile: 340 },
    ],
  },
  {
    nom: 'Infirmier / Accueil',
    compte: 'accueil@csc.bj',
    resume:
      "Recoit, enregistre, oriente, assigne un lit, preleve et saisit les resultats. Ne signe ni compte rendu ni ordonnance.",
    vues: [
      { chemin: '/', titre: 'Tableau de bord', note: "Le poste qui voit le patient avant et apres le medecin.", defile: 440 },
      { chemin: '/patients', titre: 'Enregistrement du patient', note: "C'est ici que commence le parcours : un dossier, pas un carnet.", defile: 380 },
      { clic: 'a[href^="/patients/"]', titre: 'Dossier patient', note: 'Il cree et met a jour le dossier. Il ne signe aucun compte rendu.', defile: 460 },
      { chemin: '/consultations', titre: 'Consultations', note: 'Il lit pour savoir pourquoi le patient est la. Il n ecrit pas la consultation.', defile: 320 },
      { chemin: '/hopital', titre: 'Files et assignation des lits', note: 'Il place, appelle et oriente. Le lit se libere quand le patient sort, pas avant.', defile: 500, tenir: 2300 },
      { chemin: '/hopital/plateau', titre: 'Prelevements et resultats', note: 'Il preleve et saisit : c est son poste, et le laboratoire en repond.', defile: 460, tenir: 2300 },
      { chemin: '/hopital/pharmacie', titre: 'Pharmacie', note: 'Il voit le stock pour ne pas envoyer chercher ce qui manque. Il ne dispense pas.', defile: 480 },
      { chemin: '/hopital/bloc', titre: 'Bloc operatoire', note: 'Il prepare le patient sans programmer l intervention.', defile: 420 },
    ],
  },
  {
    nom: 'Etablissement',
    compte: 'direction@csc.bj',
    resume: 'Tous les modules hospitaliers, et la gestion des comptes de ses soignants.',
    vues: [
      { chemin: '/', titre: 'Tableau de bord', note: "L activite de l etablissement, pas celle d un praticien.", defile: 460 },
      { chemin: '/hopital', titre: 'Lits et files', note: 'Tension des postes et orientation des patients.', defile: 480 },
      { chemin: '/hopital/pharmacie', titre: 'Pharmacie', note: 'Stock, ruptures, peremptions a venir. Elle dispense et gere les lots.', defile: 480 },
      { chemin: '/hopital/plateau', titre: 'Laboratoire', note: 'Valeurs critiques et acquittement nominatif.', defile: 420 },
      { chemin: '/hopital/bloc', titre: 'Bloc operatoire', note: 'Programme operatoire de la structure.', defile: 420 },
      { chemin: '/interop/rapport-mensuel?a=2026&m=11', titre: 'Rapport mensuel', note: 'Produit depuis les consultations, jamais ressaisi.', defile: 460, tenir: 2300 },
      { chemin: '/audit', titre: 'Journal d acces', note: 'Qui a ouvert quel dossier, et quand.', defile: 420 },
      { chemin: '/admin', titre: 'Administration', note: 'Perimetre limite a son etablissement, et la page le dit.', defile: 360 },
      { chemin: '/admin/comptes', titre: 'Comptes', note: 'Elle valide ses medecins et ses infirmiers. Pas les administrateurs.', defile: 420 },
      { chemin: '/admin/organisations', titre: 'Organisations', note: 'Son etablissement, et lui seul.', defile: 360 },
      { chemin: '/admin/acces', titre: 'Acces et sessions', note: 'Sessions ouvertes, revocables une par une.', defile: 400 },
      { chemin: '/admin/allegement', titre: 'Allegement administratif', note: 'La plateforme mesure ce qu elle epargne, sans donnee nominative.', defile: 360, tenir: 2200 },
    ],
  },
  {
    nom: 'Ministere',
    compte: 'ministere@sante.bj',
    resume:
      'Indicateurs agreges et surveillance epidemiologique. Aucun dossier nominatif ne lui est accessible.',
    vues: [
      { chemin: '/', titre: 'Tableau de bord', note: 'Des agregats, pas des personnes.', defile: 440 },
      { chemin: '/interop', titre: 'Interoperabilite', note: 'Exports de surveillance vers DHIS2.', defile: 420 },
      { chemin: '/interop/rapport-mensuel?a=2026&m=11', titre: 'Surveillance mensuelle', note: 'Ce qui n est pas compte est nomme, et le mois en cours se declare incomplet.', defile: 460, tenir: 2400 },
      { chemin: '/admin/organisations', titre: 'Organisations', note: 'La carte des etablissements, sans leurs dossiers.', defile: 380 },
      { chemin: '/admin/allegement', titre: 'Allegement administratif', note: 'Le temps rendu aux soignants, mesure sans aucune donnee nominative.', defile: 360, tenir: 2200 },
    ],
  },
  {
    nom: 'Administrateur plateforme',
    compte: 'admin@smarthealth.local',
    resume:
      'Organisations, comptes, sessions, journal. Aucun ecran clinique ne lui est accessible.',
    vues: [
      { chemin: '/admin', titre: 'Vue d ensemble', note: "L etat de la plateforme, toutes organisations confondues.", defile: 440 },
      { chemin: '/admin/comptes', titre: 'Comptes', note: 'Creation, validation, suspension, refus motive.', defile: 460 },
      { chemin: '/admin/organisations', titre: 'Organisations', note: 'Etablissements, ministere, plateforme.', defile: 420 },
      { chemin: '/admin/acces', titre: 'Acces et sessions', note: 'Politique de mots de passe et sessions actives.', defile: 440 },
      { chemin: '/audit', titre: 'Journal', note: 'Trace non modifiable des acces.', defile: 400 },
    ],
  },
  {
    nom: 'Super-administrateur',
    compte: 'super@smarthealth.local',
    resume: 'Seul a toucher la matrice des droits, la base et les serveurs.',
    vues: [
      { chemin: '/admin/droits', titre: 'Matrice des droits', note: 'Les roles et leurs permissions, modifiables ici et nulle part ailleurs.', defile: 520, tenir: 2400 },
      { chemin: '/admin/systeme', titre: 'Etat du systeme', note: 'Base de donnees, migrations, sauvegardes.', defile: 460 },
      { chemin: '/admin/reseau', titre: 'Reseau et serveurs', note: 'Les serveurs declares et leur etat.', defile: 440 },
      { chemin: '/admin/paiement', titre: 'Paiement en ligne', note: "Les cles vivent dans l environnement du serveur, jamais dans une page web.", defile: 500, tenir: 2300 },
    ],
  },
  {
    nom: 'Patient',
    compte: null,
    resume: 'Ses ordonnances, ses factures et ses passages, sur son telephone. Sans carnet a porter.',
    vues: [
      { chemin: '/espace/connexion', titre: 'Mon espace sante', note: 'Il se reconnait par son telephone, pas par un identifiant a retenir.', defile: 260, tenir: 1800 },
      { clicTexte: 'Mon NPI', titre: 'Reconnaissance par NPI', note: "L identifiant national suffit, pour qui n a pas de telephone a lui.", tenir: 1700 },
      { clicTexte: 'Premiere fois', titre: 'Premier acces', note: "L acces s ouvre au guichet : un soignant remet un code, le patient choisit le sien.", defile: 260, tenir: 2300 },
      { avant: ouvrirEspacePatient, chemin: '/espace', titre: 'Mes ordonnances', note: "Rien n apparait ici tant que le praticien n a pas signe. L ecran le dit, plutot que de rester vide sans raison.", defile: 300, tenir: 2300 },
      { titre: 'Mes factures', note: 'Son reste a charge et la reference a presenter a la caisse.', defile: 460, tenir: 2300 },
      { titre: 'Mes passages', note: 'Ses consultations et ses sejours, sans carnet a porter ni a perdre.', defile: 460, tenir: 2300 },
    ],
  },
];

// ------------------------------------------------------------------ incrustes

let total = 0;
let rang = 0;
let acteurCourant = '';

/**
 * Pose la legende au bas de la page.
 *
 * Reinjectee apres CHAQUE navigation : la barre vit dans le document, donc
 * elle meurt avec lui. L oublier laisse des secondes de video muette, et cela
 * ne se voit qu au visionnage.
 */
async function legende(page, titre, note) {
  await page.evaluate(
    ({ titre, note, rang, total, acteur }) => {
      document.getElementById('parcours-legende')?.remove();
      const barre = document.createElement('div');
      barre.id = 'parcours-legende';
      barre.style.cssText = [
        'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:2147483646',
        'background:#0b1220', 'color:#f8fafc', 'padding:13px 26px 15px',
        'font-family:system-ui,Segoe UI,sans-serif',
        'box-shadow:0 -2px 18px rgba(0,0,0,.45)', 'border-top:3px solid #0f766e',
        'display:flex', 'align-items:flex-end', 'justify-content:space-between',
        'gap:28px', 'pointer-events:none',
      ].join(';');

      const gauche = document.createElement('div');
      const chapeau = document.createElement('div');
      chapeau.style.cssText =
        'font-size:11.5px;color:#5eead4;font-weight:700;letter-spacing:1.1px;text-transform:uppercase';
      chapeau.textContent = acteur;
      const t = document.createElement('div');
      t.style.cssText = 'font-size:19px;font-weight:650;margin-top:3px';
      t.textContent = titre;
      const s = document.createElement('div');
      s.style.cssText =
        'font-size:14px;color:#cbd5e1;margin-top:4px;line-height:1.4;max-width:980px';
      s.textContent = note;
      gauche.append(chapeau, t, s);

      const droite = document.createElement('div');
      droite.style.cssText = 'text-align:right;flex:none';
      const marque = document.createElement('div');
      marque.style.cssText = 'font-size:13px;color:#5eead4;font-weight:600';
      marque.textContent = 'SmartHealth';
      const compteur = document.createElement('div');
      compteur.style.cssText = 'font-size:12.5px;color:#94a3b8;margin-top:4px';
      compteur.textContent = `${rang} / ${total}`;
      droite.append(marque, compteur);

      barre.append(gauche, droite);
      document.body.appendChild(barre);
      // La barre masque le bas de la page : on rend la hauteur au document,
      // sinon le dernier bloc reste hors de portee du defilement.
      document.body.style.paddingBottom = `${barre.offsetHeight + 12}px`;
    },
    { titre, note, rang, total, acteur: acteurCourant },
  );
}

/** Carton d ouverture de chapitre : qui entre en scene, et ce qu il peut. */
async function carton(page, acteur) {
  await page.evaluate(
    ({ nom, compte, resume }) => {
      document.getElementById('parcours-carton')?.remove();
      // La legende de la vue precedente appartient au chapitre qui s acheve :
      // la laisser la faisait reapparaitre par-dessus le carton.
      document.getElementById('parcours-legende')?.remove();
      const fond = document.createElement('div');
      fond.id = 'parcours-carton';
      fond.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:2147483647', 'background:#0b1220',
        'color:#f8fafc', 'display:flex', 'flex-direction:column',
        'align-items:center', 'justify-content:center', 'gap:14px',
        'font-family:system-ui,Segoe UI,sans-serif', 'text-align:center',
        'padding:0 90px',
      ].join(';');
      const sur = document.createElement('div');
      sur.style.cssText =
        'font-size:13px;color:#5eead4;letter-spacing:2.4px;text-transform:uppercase;font-weight:700';
      sur.textContent = 'Parcours de';
      const nomEl = document.createElement('div');
      nomEl.style.cssText = 'font-size:44px;font-weight:680;letter-spacing:-.4px';
      nomEl.textContent = nom;
      const res = document.createElement('div');
      res.style.cssText = 'font-size:17.5px;color:#cbd5e1;max-width:880px;line-height:1.55';
      res.textContent = resume;
      fond.append(sur, nomEl, res);
      if (compte) {
        const c = document.createElement('div');
        c.style.cssText =
          'margin-top:10px;font-size:13.5px;color:#64748b;font-family:ui-monospace,Consolas,monospace';
        c.textContent = compte;
        fond.append(c);
      }
      document.body.appendChild(fond);
    },
    { nom: acteur.nom, compte: acteur.compte, resume: acteur.resume },
  );
}

const retirerCarton = (page) =>
  page.evaluate(() => document.getElementById('parcours-carton')?.remove());

// ------------------------------------------------------------------- conduite

const pause = (page, ms) => page.waitForTimeout(ms);

/**
 * Defilement progressif.
 *
 * Un saut sec en bas de page est illisible a l image : on ne voit pas ce qu on
 * a traverse. Le defilement se fait donc par petits pas.
 */
async function defiler(page, pixels, pas = 30) {
  for (let fait = 0; fait < pixels; fait += pas) {
    await page.mouse.wheel(0, pas);
    await page.waitForTimeout(14);
  }
}

/** Ouvre une session par l API, sans rejouer le formulaire. */
async function ouvrirSession(page, email) {
  const ok = await page.evaluate(
    async ({ email, mdp }) => {
      await fetch('/api/auth/logout', { method: 'POST' });
      await fetch('/api/espace/deconnexion', { method: 'POST' }).catch(() => {});
      if (!email) return true;
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: mdp }),
      });
      return r.ok;
    },
    { email, mdp: MOT_DE_PASSE },
  );
  if (!ok) throw new Error(`Session refusee pour ${email}`);
}

async function aller(page, chemin) {
  await page.goto(`${BASE}${chemin}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page
    .waitForFunction(() => !document.body.innerText.includes('Chargement de la page'), {
      timeout: 30_000,
    })
    .catch(() => {});
  await pause(page, 300);
}

/**
 * Verifie qu une vue a bien ete atteinte.
 *
 * Le parcours ne doit contenir que des interfaces autorisees. Si l une d elles
 * renvoie ailleurs, c est que la matrice des droits a change : on arrete
 * plutot que de livrer un film ou un acteur se cogne a une porte fermee sans
 * que personne ne s en apercoive au montage.
 *
 * On compare a l adresse DEMANDEE, et non a une liste de mots interdits. Une
 * regle du genre « toute adresse contenant connexion est un echec » refuse
 * `/espace/connexion`, qui est pourtant l ecran d accueil du patient et une
 * vue legitime du parcours.
 */
function verifierArrivee(page, vue) {
  if (!vue.chemin) return; // vue atteinte par un clic : la cible n est pas connue d avance
  const attendu = vue.chemin.split('?')[0];
  const atteint = new URL(page.url()).pathname;
  if (atteint === attendu) return;
  throw new Error(`« ${vue.titre} » : demande ${attendu}, arrive sur ${atteint}`);
}

// ------------------------------------------------------------------- la prise

await fs.mkdir(SORTIE, { recursive: true });
const tampon = path.join(SORTIE, '.video-brute');
await fs.rm(tampon, { recursive: true, force: true });
await fs.mkdir(tampon, { recursive: true });

const navigateur = await chromium.launch();
const contexte = await navigateur.newContext({
  viewport: { width: LARGEUR, height: HAUTEUR },
  recordVideo: { dir: tampon, size: { width: LARGEUR, height: HAUTEUR } },
  locale: 'fr-FR',
  timezoneId: 'Africa/Porto-Novo',
});
const page = await contexte.newPage();
page.setDefaultTimeout(45_000);

total = ACTEURS.reduce((n, a) => n + a.vues.length, 0);
console.log(`${ACTEURS.length} acteurs, ${total} vues, ${LARGEUR}x${HAUTEUR}`);

let incident = null;
try {
  // Une page de l origine d abord : les appels `fetch` partent du document.
  // `/demo` est publique ET ne redirige jamais, session ouverte ou non.
  await aller(page, '/demo');

  for (const acteur of ACTEURS) {
    console.log('');
    console.log(`  == ${acteur.nom}`);
    acteurCourant = acteur.nom;
    await ouvrirSession(page, acteur.compte);
    await carton(page, acteur);
    await pause(page, 2200);
    await retirerCarton(page);

    for (const vue of acteur.vues) {
      process.stdout.write(`     ${String(rang + 1).padStart(2)}. ${vue.titre} ... `);
      if (vue.avant) await vue.avant(page);
      if (vue.chemin) await aller(page, vue.chemin);
      if (vue.clic) {
        const cible = page.locator(vue.clic).first();
        if (await cible.count()) {
          await cible.click();
          await page.waitForLoadState('networkidle').catch(() => {});
          await pause(page, 420);
        }
      }
      if (vue.clicTexte) {
        const cible = page.getByText(vue.clicTexte, { exact: true }).first();
        if (await cible.count()) {
          await cible.click();
          await pause(page, 420);
        }
      }
      verifierArrivee(page, vue);
      // La legende est posee APRES la navigation, sinon elle disparait avec
      // le document qu elle annotait.
      rang += 1;
      await legende(page, vue.titre, vue.note);
      await pause(page, 380);
      if (vue.defile) await defiler(page, vue.defile);
      // Reposee une seconde fois : Next hydrate la page apres le chargement
      // et balaie les noeuds ajoutes a la main entre-temps. Sans ce second
      // appel, certaines vues se retrouvent sans legende.
      await legende(page, vue.titre, vue.note);
      await pause(page, vue.tenir ?? TENUE);
      console.log('ok');
    }
  }
  await pause(page, 900);
} catch (e) {
  // Pas de `throw` ici : Playwright n ecrit la video qu a la FERMETURE du
  // contexte. Relancer l erreur tout de suite jetterait tout ce qui a deja
  // ete filme. On ferme, on garde la prise, puis on signale.
  incident = e;
  console.log('INTERROMPU');
} finally {
  await contexte.close().catch(() => {});
  await navigateur.close().catch(() => {});
}

const brut = (await fs.readdir(tampon)).find((f) => f.endsWith('.webm'));
if (!brut) throw new Error('Aucune video produite');
const final = path.join(SORTIE, 'parcours-smarthealth.webm');
await fs.rm(final, { force: true });
await fs.rename(path.join(tampon, brut), final);
await fs.rm(tampon, { recursive: true, force: true });

/**
 * Repare l en-tete de duree du WebM.
 *
 * Playwright ecrit le fichier au fil de l eau et ne revient pas y inscrire la
 * duree : les lecteurs annoncent une duree infinie et la barre de defilement
 * est inutilisable. Un remuxage sans reencodage corrige cela. On se sert du
 * ffmpeg que Playwright installe pour lui-meme ; il ne sait encoder que du
 * VP8, ce qui suffit puisqu on ne reencode rien.
 */
function reparerDuree(fichier) {
  const racine = path.join(process.env.LOCALAPPDATA || process.env.HOME || '', 'ms-playwright');
  if (!existsSync(racine)) return false;
  const dossier = readdirSync(racine).find((d) => d.startsWith('ffmpeg-'));
  if (!dossier) return false;
  const bin = path.join(racine, dossier, 'ffmpeg-win64.exe');
  if (!existsSync(bin)) return false;
  // Le nom temporaire doit garder l extension .webm : ffmpeg choisit son
  // format de sortie d apres elle, et refuse un `.webm.remux` inconnu.
  const repare = fichier.replace(/\.webm$/, '.remux.webm');
  try {
    execFileSync(bin, ['-y', '-loglevel', 'error', '-i', fichier, '-c', 'copy', repare], {
      stdio: 'ignore',
    });
  } catch {
    return false;
  }
  renameSync(repare, fichier);
  return true;
}

if (!reparerDuree(final)) {
  // On ne masque pas l echec : une video dont la duree est inconnue se repere
  // au premier visionnage, et autant le savoir maintenant.
  console.warn('Duree non reparee : le lecteur affichera une duree inconnue.');
}

const { size } = await fs.stat(final);
const etat = incident ? `INCOMPLETE, ${rang} vues sur ${total}` : `${total} vues`;
console.log('');
console.log(`Video : ${path.relative(process.cwd(), final)} (${Math.round(size / 1024)} Ko, ${etat})`);
if (incident) {
  console.error(`La prise s est arretee : ${String(incident.message).slice(0, 200)}`);
  process.exitCode = 1;
}
