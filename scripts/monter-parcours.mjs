/**
 * Monte un parcours anime a partir de vues capturees de la plateforme.
 *
 *   node scripts/monter-parcours.mjs <dossier-des-vues> <dossier-de-sortie>
 *
 * POURQUOI UN WEBP ET UN GIF, ET PAS UN MP4
 *
 * Aucun encodeur video n'est installe sur le poste, et `sharp` — qui vient
 * avec Next — sait ecrire du WebP et du GIF animes, pas du H.264. Le WebP
 * est net et leger ; le GIF est laid et lourd, mais il se colle dans un
 * courriel, un document ou une plateforme de depot qui refuse tout le reste.
 * On produit les deux, et les vues restent en PNG pour qu'un vrai montage
 * soit possible ensuite.
 *
 * CHAQUE VUE PORTE SA LEGENDE, INCRUSTEE
 *
 * Une animation sans texte oblige le spectateur a deviner ce qu'il regarde,
 * et une legende qui vit a cote du fichier se perd des le premier partage.
 * Elle est donc dessinee dans l'image.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [, , dossierVues, dossierSortie] = process.argv;
if (!dossierVues || !dossierSortie) {
  console.error('Usage : node scripts/monter-parcours.mjs <vues> <sortie>');
  process.exit(1);
}

/** Duree d'affichage d'une vue, en millisecondes. */
const DUREE = 2800;
/** Hauteur du bandeau de legende. */
const BANDEAU = 72;

const MARQUE = '#0f6f5c';
const FOND = '#0b1512';
const TEXTE = '#f2f7f5';
const DOUX = '#9fb8b1';

/** Echappe ce qui partirait de travers dans du SVG. */
function echapper(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Coupe une legende en deux lignes au plus.
 *
 * La coupe se fait sur un espace, jamais au milieu d'un mot : une legende
 * tronquee en plein mot se lit comme une faute, pas comme une contrainte.
 */
function lignes(texte, parLigne = 78) {
  const mots = texte.split(' ');
  const sorties = [''];
  for (const mot of mots) {
    const courante = sorties[sorties.length - 1];
    if (courante === '') sorties[sorties.length - 1] = mot;
    else if (`${courante} ${mot}`.length <= parLigne) sorties[sorties.length - 1] = `${courante} ${mot}`;
    else sorties.push(mot);
  }
  if (sorties.length > 2) {
    // Couper en silence a deux lignes, c'est livrer une legende amputee que
    // personne ne remarque avant de la montrer. Le montage s'arrete et nomme
    // la legende fautive.
    throw new Error(
      `Legende trop longue pour deux lignes (${texte.length} caracteres) : ${texte}`,
    );
  }
  return sorties;
}

function bandeau(largeur, titre, sous, index, total) {
  const [l1, l2] = lignes(sous);
  return Buffer.from(`<svg width="${largeur}" height="${BANDEAU}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${largeur}" height="${BANDEAU}" fill="${FOND}"/>
  <rect width="${largeur}" height="3" fill="${MARQUE}"/>
  <text x="18" y="27" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700" fill="${TEXTE}">${echapper(titre)}</text>
  <text x="18" y="47" font-family="Segoe UI, Arial, sans-serif" font-size="12.5" fill="${DOUX}">${echapper(l1 ?? '')}</text>
  <text x="18" y="63" font-family="Segoe UI, Arial, sans-serif" font-size="12.5" fill="${DOUX}">${echapper(l2 ?? '')}</text>
  <text x="${largeur - 18}" y="27" text-anchor="end" font-family="Segoe UI, Arial, sans-serif" font-size="12" fill="${MARQUE}" font-weight="700">SmartHealth</text>
  <text x="${largeur - 18}" y="47" text-anchor="end" font-family="Segoe UI, Arial, sans-serif" font-size="11.5" fill="${DOUX}">${index} / ${total}</text>
</svg>`);
}

const plan = JSON.parse(readFileSync(path.join(dossierVues, 'plan.json'), 'utf8'));
const fichiers = readdirSync(dossierVues).filter((n) => /\.(png|jpe?g)$/i.test(n)).sort();

if (fichiers.length === 0) {
  console.error('Aucune vue dans', dossierVues);
  process.exit(1);
}

if (!existsSync(dossierSortie)) mkdirSync(dossierSortie, { recursive: true });

// La premiere vue donne la taille de reference. Les suivantes s'y alignent :
// une seule vue de travers decalerait toute l'animation.
const base = await sharp(path.join(dossierVues, fichiers[0])).metadata();
const L = base.width;
const H = base.height + BANDEAU;

console.log(`${fichiers.length} vues, ${L}x${H}, ${DUREE} ms chacune`);

const images = [];
for (let i = 0; i < fichiers.length; i += 1) {
  const nom = fichiers[i];
  const cle = nom.replace(/\.(png|jpe?g)$/i, '');
  const legende = plan[cle] ?? { titre: cle, sous: '' };

  const vue = await sharp(path.join(dossierVues, nom))
    .resize(L, base.height, { fit: 'contain', position: 'top', background: FOND })
    .toBuffer();

  const frame = await sharp({
    create: { width: L, height: H, channels: 3, background: FOND },
  })
    .composite([
      { input: vue, top: 0, left: 0 },
      { input: bandeau(L, legende.titre, legende.sous, i + 1, fichiers.length), top: base.height, left: 0 },
    ])
    .png()
    .toBuffer();

  images.push(frame);
  console.log(`  ${i + 1}. ${legende.titre}`);
}

const webp = path.join(dossierSortie, 'parcours-smarthealth.webp');
const gif = path.join(dossierSortie, 'parcours-smarthealth.gif');

/**
 * Assemble les vues en une animation.
 *
 * L'entree en TABLEAU est la bonne porte. L'empilement en tampon brut, qui
 * semble plus direct, echoue a l'ecriture : libvips y cherche un nombre de
 * pages que des octets nus ne portent pas.
 */
function animation() {
  return sharp(images, { join: { animated: true } });
}

await animation()
  .webp({ quality: 82, effort: 4, delay: images.map(() => DUREE), loop: 0 })
  .toFile(webp);

await animation()
  .gif({ delay: images.map(() => DUREE), loop: 0, colours: 128 })
  .toFile(gif);

for (let i = 0; i < images.length; i += 1) {
  await sharp(images[i]).toFile(path.join(dossierSortie, `vue-${String(i + 1).padStart(2, '0')}.png`));
}

const { statSync } = await import('node:fs');
console.log('');
console.log(`WebP : ${webp} (${Math.round(statSync(webp).size / 1024)} Ko)`);
console.log(`GIF  : ${gif} (${Math.round(statSync(gif).size / 1024)} Ko)`);
console.log(`PNG  : ${images.length} vues dans ${dossierSortie}`);
