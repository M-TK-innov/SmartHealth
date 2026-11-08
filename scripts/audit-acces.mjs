/**
 * Audit du cloisonnement, mesure dans un vrai navigateur.
 *
 * POURQUOI PAS CURL. Les pages gardees appellent `requirePermission` dans un
 * composant serveur, mais Next rend en FLUX : la coquille part avec un code
 * 200 avant que la redirection ne soit decidee, et celle-ci voyage ensuite
 * dans le flux. Un client sans JavaScript voit donc 200 partout et conclut, a
 * tort, que tout est ouvert. Seul un navigateur dit ou l on atterrit
 * vraiment.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3210';
const MDP = 'SmartHealth2026!';

const PAGES = [
  '/', '/patients', '/consultations', '/corrections',
  '/hopital', '/hopital/pharmacie', '/hopital/plateau', '/hopital/bloc',
  '/interop', '/interop/rapport-mensuel',
  '/audit', '/compte',
  '/admin', '/admin/comptes', '/admin/organisations', '/admin/acces',
  '/admin/droits', '/admin/systeme', '/admin/reseau', '/admin/paiement',
  '/admin/allegement',
];

const COMPTES = [
  ['medecin', 'a.sossou@example.bj'],
  ['infirmier', 'accueil@csc.bj'],
  ['etablis.', 'direction@csc.bj'],
  ['ministere', 'ministere@sante.bj'],
  ['admin', 'admin@smarthealth.local'],
  ['super', 'super@smarthealth.local'],
];

const navigateur = await chromium.launch();
const contexte = await navigateur.newContext();
const page = await contexte.newPage();
page.setDefaultTimeout(30_000);

const resultats = {};

for (const [nom, email] of COMPTES) {
  // `/demo` est publique ET ne redirige jamais, session ouverte ou non.
  // `/connexion` renvoie vers le tableau de bord quand on est deja
  // connecte, ce qui detruisait le contexte en plein appel.
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' });
  const ok = await page.evaluate(
    async ({ email, mdp }) => {
      await fetch('/api/auth/logout', { method: 'POST' });
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: mdp }),
      });
      return r.ok;
    },
    { email, mdp: MDP },
  );
  if (!ok) throw new Error(`Connexion impossible : ${email}`);

  resultats[nom] = {};
  for (const chemin of PAGES) {
    await page.goto(`${BASE}${chemin}`, { waitUntil: 'domcontentloaded' });
    // On attend que la redirection eventuelle, portee par le flux, ait eu
    // lieu : sans cette attente on lit l adresse demandee, pas l adresse
    // atteinte.
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(250);
    const arrivee = new URL(page.url()).pathname;
    resultats[nom][chemin] =
      arrivee.includes('acces-refuse') ? 'refus'
      : arrivee.includes('connexion') ? 'login'
      : arrivee === chemin.split('?')[0] ? 'OUI'
      : `->${arrivee}`;
  }
}

await contexte.close();
await navigateur.close();

const col = (s) => String(s).padEnd(11);
console.log('PAGE'.padEnd(26) + COMPTES.map(([n]) => col(n)).join(''));
for (const chemin of PAGES) {
  console.log(chemin.padEnd(26) + COMPTES.map(([n]) => col(resultats[n][chemin])).join(''));
}

// Recapitulatif utile au montage : ce que chaque acteur atteint reellement.
console.log('');
for (const [nom] of COMPTES) {
  const ouvertes = PAGES.filter((p) => resultats[nom][p] === 'OUI');
  console.log(`${nom.padEnd(11)} ${ouvertes.length} pages : ${ouvertes.join(' ')}`);
}
