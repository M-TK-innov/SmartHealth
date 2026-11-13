/**
 * Essai de bout en bout de la consultation a distance, avec DEUX VRAIS PAIRS.
 *
 * CE QUE CET ESSAI VERIFIE, ET QUE RIEN D'AUTRE NE VERIFIAIT. La signalisation
 * est testee par ailleurs : qui depose, qui releve, qui se fait refuser. Mais
 * savoir que deux messages se croisent correctement ne dit pas qu'une liaison
 * WebRTC s'etablit, ni qu'une image arrive. C'etait le trou : la
 * teleconsultation etait verifiee sur sa mecanique, pas sur son image.
 *
 * ON N'INTERROGE PAS L'OBJET RTCPeerConnection. Il vit dans une `ref` du
 * composant, hors de portee. On regarde ce que les deux personnes voient :
 * l'etat affiche passe a « En communication », et la balise video distante
 * porte une image de largeur non nulle. C'est le contrat, et c'est ce qui se
 * casserait en premier.
 *
 * LES CAMERAS SONT SYNTHETIQUES. Chromium sait fabriquer un flux de test, ce
 * qui evite d'avoir une camera branchee et rend l'essai rejouable sur un
 * serveur sans ecran. Le trajet negocie reste le meme.
 *
 * Usage : node essai-teleconsultation.mjs [base] [idRendezVous]
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:3210';
const RDV = process.argv[3] || 'ebd17862-6c3e-49c7-9f08-c1915ea80b61';
const MDP = 'SmartHealth2026!';
const PATIENT = '2090d8ae-4408-4d86-9008-79f0b143fe5a';
const TELEPHONE = '0195887766';
/** Dossier des captures, ou rien si le troisieme argument est absent. */
const SORTIE = process.argv[4] ? path.resolve(process.argv[4]) : null;

const bilan = [];
const dire = (ok, quoi) => {
  bilan.push({ ok, quoi });
  console.log(`  ${ok ? 'ok   ' : 'ECHEC'} ${quoi}`);
};

const navigateur = await chromium.launch({
  args: [
    // Une camera et un micro de synthese : pas de materiel requis, et
    // l'autorisation est accordee sans boite de dialogue.
    '--use-fake-device-for-media-capture',
    '--use-fake-ui-for-media-stream',
  ],
});

/** Ouvre un contexte isole : chaque pair a ses propres cookies. */
async function pair(nom) {
  const ctx = await navigateur.newContext({
    permissions: ['camera', 'microphone'],
    locale: 'fr-FR',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`    [${nom}] ${m.text().slice(0, 120)}`);
  });
  return { ctx, page };
}

const poster = (page, url, corps) =>
  page.evaluate(
    ({ url, corps }) =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      }).then((r) => r.status),
    { url, corps },
  );

let praticien;
let patient;
try {
  praticien = await pair('praticien');
  patient = await pair('patient');

  // --- Le praticien ouvre la salle.
  await praticien.page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' });
  await poster(praticien.page, '/api/auth/login', {
    email: 'a.sossou@example.bj',
    password: MDP,
  });

  // Le patient doit avoir consenti : sans accord, les regles refusent le
  // demarrage, et c'est bien ce qu'on veut qu'elles fassent.
  const code = await praticien.page.evaluate(
    async ({ patient, tel }) => {
      const r = await fetch(`/api/patients/${patient}/enroler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'telephone', identifiant: tel }),
      });
      return r.ok ? (await r.json()).code : null;
    },
    { patient: PATIENT, tel: TELEPHONE },
  );
  dire(Boolean(code), "le guichet delivre un code d'acces au patient");

  await patient.page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' });
  const active = await poster(patient.page, '/api/espace/activation', {
    type: 'telephone',
    identifiant: TELEPHONE,
    code,
    pin: '481902',
  });
  dire(active === 200, "le patient ouvre son espace avec le code et le sien");

  const consenti = await poster(patient.page, `/api/espace/rendez-vous/${RDV}`, {});
  dire(
    consenti === 200 || consenti === 409,
    consenti === 409
      ? "l accord du patient etait deja donne (409), la salle peut s ouvrir"
      : "le patient donne son accord pour la consultation a distance",
  );

  const demarrage = await praticien.page.evaluate(
    async (rdv) => {
      const r = await fetch(`/api/rendez-vous/${rdv}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'demarrer' }),
      });
      return r.ok ? await r.json() : { erreur: (await r.json()).error };
    },
    RDV,
  );
  dire(Boolean(demarrage.salle), `le praticien ouvre la salle${demarrage.erreur ? ' — ' + demarrage.erreur : ''}`);
  if (!demarrage.salle) throw new Error(demarrage.erreur ?? 'salle non ouverte');
  dire(Boolean(demarrage.consultationId), 'une consultation est creee et rattachee au rendez-vous');

  // --- Les deux entrent dans la salle.
  await praticien.page.goto(`${BASE}/rendez-vous/${RDV}/salle`, { waitUntil: 'domcontentloaded' });
  await patient.page.goto(`${BASE}/espace/salle/${demarrage.salle}`, {
    waitUntil: 'domcontentloaded',
  });

  // --- On attend ce que les deux personnes voient, pas un etat interne.
  const attendreCommunication = (page, nom) =>
    page
      .waitForFunction(() => document.body.innerText.includes('En communication'), {
        timeout: 45_000,
      })
      .then(
        () => dire(true, `${nom} : l ecran affiche « En communication »`),
        () => dire(false, `${nom} : l ecran n a jamais affiche « En communication »`),
      );

  await Promise.all([
    attendreCommunication(praticien.page, 'praticien'),
    attendreCommunication(patient.page, 'patient  '),
  ]);

  // --- Une image arrive-t-elle vraiment ?
  const imageRecue = (page) =>
    page
      .waitForFunction(
        () => {
          const v = document.querySelectorAll('video');
          // La premiere balise est la video DISTANTE ; la seconde est
          // l'apercu de soi, qui a une image meme sans aucun pair en face.
          return v.length > 0 && v[0].videoWidth > 0 && v[0].videoHeight > 0;
        },
        { timeout: 20_000 },
      )
      .then(
        () => true,
        () => false,
      );

  const [imgP, imgQ] = await Promise.all([imageRecue(praticien.page), imageRecue(patient.page)]);
  dire(imgP, 'praticien : une image arrive du patient');
  dire(imgQ, 'patient   : une image arrive du praticien');

  const mesures = await praticien.page.evaluate(() => {
    const v = document.querySelectorAll('video')[0];
    return v ? { largeur: v.videoWidth, hauteur: v.videoHeight } : null;
  });
  if (mesures) console.log(`    image distante : ${mesures.largeur}x${mesures.hauteur}`);

  // Une preuve qu'on peut montrer. Un essai qui rend « 9 sur 9 » se croit sur
  // parole ; deux captures se regardent.
  if (SORTIE) {
    await fs.mkdir(SORTIE, { recursive: true });
    await praticien.page.screenshot({ path: path.join(SORTIE, 'teleconsultation-praticien.png') });
    await patient.page.screenshot({ path: path.join(SORTIE, 'teleconsultation-patient.png') });
    console.log(`    captures ecrites dans ${SORTIE}`);
  }
} finally {
  await praticien?.ctx.close().catch(() => {});
  await patient?.ctx.close().catch(() => {});
  await navigateur.close().catch(() => {});
}

const echecs = bilan.filter((b) => !b.ok);
console.log('');
console.log(`${bilan.length - echecs.length} verifications sur ${bilan.length}`);
if (echecs.length > 0) process.exitCode = 1;
