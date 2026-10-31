/**
 * Generation des icones de l'application.
 *
 *   node scripts/gen-icons.mjs
 *
 * Encode les PNG a la main (zlib + CRC32) plutot que d'ajouter une dependance
 * de rendu graphique : l'icone est une forme geometrique simple, et le projet
 * doit rester installable sur un poste hors-ligne.
 *
 * La marque reprend celle de l'ecran (`components/Logo.tsx`) : une croix de
 * sante blanche sur le vert de l'application, dans un carre arrondi dont le
 * coin bas-gauche reste droit — la pointe d'une bulle de parole — et au
 * centre le microphone du Recorder, en rouge.
 *
 * Les proportions sont celles du trace SVG, rapportees au cote : rayon 7/32,
 * epaisseur de croix 7/32, longueur 19/32. Toute modification doit etre portee
 * dans les deux fichiers, sans quoi l'icone cesse de ressembler a l'ecran.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const BRAND = [15, 111, 92]; // #0f6f5c
const WHITE = [255, 255, 255];
const ROUGE = [180, 35, 24]; // #b42318, --color-danger

// ------------------------------------------------------------- encodage PNG

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** pixels : Uint8Array RGBA de size*size */
function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profondeur 8 bits
  ihdr[9] = 6; // RGBA
  // 10..12 : compression, filtre, entrelacement = 0

  // chaque ligne est prefixee par son type de filtre (0 = aucun)
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy
      ? pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4)
      : Buffer.from(pixels.subarray(y * size * 4, (y + 1) * size * 4)).copy(raw, rowStart + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ dessin

/** Couverture d'un pixel par une forme, echantillonnee 3x3 (anticrenelage). */
function coverage(px, py, inside) {
  let hits = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      if (inside(px + (sx + 0.5) / 3, py + (sy + 0.5) / 3)) hits++;
    }
  }
  return hits / 9;
}

function blend(dst, i, color, alpha) {
  for (let c = 0; c < 3; c++) dst[i + c] = Math.round(dst[i + c] * (1 - alpha) + color[c] * alpha);
  dst[i + 3] = Math.round(dst[i + 3] * (1 - alpha) + 255 * alpha);
}

/**
 * @param size       cote en pixels
 * @param inset      marge relative laissee autour de la marque (zone de securite
 *                   requise par les icones maskable)
 * @param background true = fond plein jusqu'aux bords, false = coins arrondis
 */
function drawIcon(size, { inset = 0, rounded = true } = {}) {
  const px = Buffer.alloc(size * size * 4); // transparent

  const c = size / 2;
  const radius = size * 0.22; // rayon des coins arrondis
  const inRoundedSquare = (x, y) => {
    if (!rounded) return true;
    // Le coin bas-gauche reste droit : c'est la pointe de la bulle.
    if (x <= radius && y >= size - radius) return true;
    const dx = Math.max(radius - x, 0, x - (size - radius));
    const dy = Math.max(radius - y, 0, y - (size - radius));
    return dx * dx + dy * dy <= radius * radius;
  };

  // fond
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = coverage(x, y, inRoundedSquare);
      if (a > 0) blend(px, (y * size + x) * 4, BRAND, a);
    }
  }

  // ------------------------------------------------- la marque, en 32 unites
  //
  // Les formes sont posees dans l'espace du trace SVG (32 unites de cote),
  // puis rapportees au cote reel. Garder les memes nombres des deux cotes est
  // ce qui fait que l'icone du bureau ressemble a celle de l'ecran.
  const usable = (size / 2) * (1 - inset);
  const k = usable / 16;
  const D = (v) => c + (v - 16) * k; // coordonnee de trace -> pixel
  const L = (v) => v * k; // longueur de trace -> pixels

  // --- croix de sante
  const demiEpaisseur = L(4.5);
  const demiLongueur = L(9.5);
  const inCross = (x, y) => {
    const dx = Math.abs(x - c);
    const dy = Math.abs(y - c);
    return (dx <= demiEpaisseur && dy <= demiLongueur) || (dy <= demiEpaisseur && dx <= demiLongueur);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = coverage(x, y, inCross);
      if (a > 0) blend(px, (y * size + x) * 4, WHITE, a);
    }
  }

  // --- microphone, pose par-dessus la barre verticale (blanche)
  //
  // Un trait a bouts ronds est exactement « tout point a moins de r du
  // segment » : une seule fonction suffit pour le pied, la base et les
  // extremites de l'arc.
  const trait = L(0.8) / 2; // demi-epaisseur, stroke-width 1.6 a l'echelle 0.5

  const distSegment = (x, y, ax, ay, bx, by) => {
    const vx = bx - ax;
    const vy = by - ay;
    const wx = x - ax;
    const wy = y - ay;
    const carre = vx * vx + vy * vy;
    const t = carre === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / carre));
    const px2 = ax + t * vx - x;
    const py2 = ay + t * vy - y;
    return Math.sqrt(px2 * px2 + py2 * py2);
  };

  // capsule du micro : un segment epais, ce qu'est un rect rx=moitie-largeur
  const capsule = (x, y) => distSegment(x, y, D(16), D(12.5), D(16), D(15.5)) <= L(1.5);

  // arceau : demi-cercle bas, plus ses deux bouts ronds
  const arcCx = D(16);
  const arcCy = D(15.5);
  const arcR = L(3.5);
  const arceau = (x, y) => {
    const d = Math.hypot(x - arcCx, y - arcCy);
    if (Math.abs(d - arcR) <= trait && y >= arcCy) return true;
    return (
      distSegment(x, y, D(12.5), D(15.5), D(12.5), D(15.5)) <= trait ||
      distSegment(x, y, D(19.5), D(15.5), D(19.5), D(15.5)) <= trait
    );
  };

  const pied = (x, y) => distSegment(x, y, D(16), D(19), D(16), D(21)) <= trait;
  const base = (x, y) => distSegment(x, y, D(14.25), D(21), D(17.75), D(21)) <= trait;

  const inMicro = (x, y) => capsule(x, y) || arceau(x, y) || pied(x, y) || base(x, y);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = coverage(x, y, inMicro);
      if (a > 0) blend(px, (y * size + x) * 4, ROUGE, a);
    }
  }

  return encodePng(size, px);
}

// ------------------------------------------------------------------ sortie

const out = path.join(process.cwd(), 'public', 'icons');
mkdirSync(out, { recursive: true });

const targets = [
  ['icon-192.png', 192, { inset: 0 }],
  ['icon-512.png', 512, { inset: 0 }],
  // maskable : la plateforme rogne jusqu'a 20% de chaque bord
  ['icon-maskable-512.png', 512, { inset: 0.3, rounded: false }],
  // iOS n'applique pas de masque et ne gere pas la transparence : bords pleins
  ['apple-touch-icon.png', 180, { inset: 0.12, rounded: false }],
  ['icon-64.png', 64, { inset: 0 }],
];

for (const [name, size, opts] of targets) {
  const buf = drawIcon(size, opts);
  writeFileSync(path.join(out, name), buf);
  console.log(`${name.padEnd(26)} ${size}x${size}  ${(buf.length / 1024).toFixed(1)} Ko`);
}

// ------------------------------------------------- icone Windows (.ico)
//
// Fournir un .ico tout fait evite a electron-builder de convertir le PNG :
// son convertisseur WebAssembly echoue sur une machine sous pression memoire.
// Depuis Windows Vista, un .ico peut encapsuler directement des PNG.

function buildIco(sizes) {
  const images = sizes.map((s) => ({ size: s, png: drawIcon(s, { inset: 0 }) }));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserve
  header.writeUInt16LE(1, 2); // type 1 = icone
  header.writeUInt16LE(images.length, 4);

  const entrySize = 16;
  let offset = header.length + entrySize * images.length;
  const entries = [];

  for (const { size, png } of images) {
    const e = Buffer.alloc(entrySize);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 0 signifie 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserve
    e.writeUInt16LE(1, 4); // plans
    e.writeUInt16LE(32, 6); // bits par pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

const ico = buildIco([16, 32, 48, 64, 128, 256]);
mkdirSync(path.join(process.cwd(), 'electron'), { recursive: true });
writeFileSync(path.join(process.cwd(), 'electron', 'icon.ico'), ico);
console.log(`${'electron/icon.ico'.padEnd(26)} 6 tailles  ${(ico.length / 1024).toFixed(1)} Ko`);

// l'icone de fenetre Electron reste un PNG
writeFileSync(path.join(process.cwd(), 'electron', 'icon.png'), drawIcon(512, { inset: 0 }));
console.log(`${'electron/icon.png'.padEnd(26)} 512x512`);

console.log(`\nIcones ecrites dans public/icons/ et electron/`);
