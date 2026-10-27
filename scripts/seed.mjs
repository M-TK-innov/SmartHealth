/**
 * Jeu de donnees de demonstration.
 *
 *   node scripts/seed.mjs            (ajoute si absent)
 *   node scripts/seed.mjs --reset    (repart d une base vide)
 *
 * Cree un praticien, trois patients aux profils cliniques contrastes (femme
 * enceinte, enfant, patient polypathologique allergique) et une consultation
 * dont la transcription est prete a etre analysee.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { SCHEMA_SQL } from '../lib/schema.ts';
import { hashPassword } from '../lib/auth/password.ts';
import { DEFAULT_ROLE_PERMISSIONS, ROLES } from '../lib/auth/roles.ts';
import {
  SEUILS_DEMONSTRATION,
  parcoursDemonstration,
  recapitulatif,
} from '../lib/demo/scenario.ts';

const DB_PATH = process.env.PARLEDOCTEUR_DB || path.join(process.cwd(), 'data', 'parledocteur.db');
const reset = process.argv.includes('--reset');

if (reset) {
  for (const suffix of ['', '-wal', '-shm']) {
    const f = DB_PATH + suffix;
    if (existsSync(f)) rmSync(f);
  }
  console.log('Base reinitialisee.');
}

mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(SCHEMA_SQL);

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().replace('T', ' ').slice(0, 19);

function insert(table, data) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(
    ...keys.map((k) => {
      const v = data[k];
      if (v === null || v === undefined) return null;
      if (typeof v === 'boolean') return v ? 1 : 0;
      return v;
    }),
  );
  return data.id;
}

const count = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;

if (count('patient') > 0 && !reset) {
  console.log('La base contient deja des patients. Utilisez --reset pour repartir de zero.');
  process.exit(0);
}

// ------------------------------------------------- organisations et acces

const platformId = randomUUID();
const ministryId = randomUUID();
const facilityId = randomUUID();

insert('organization', {
  id: platformId,
  type: 'platform',
  name: 'ParleDocteur',
  code: 'PD-PLATFORM',
  country: process.env.FACILITY_COUNTRY || 'BJ',
  status: 'active',
  created_at: now(),
  updated_at: now(),
});
insert('organization', {
  id: ministryId,
  type: 'ministry',
  name: 'Ministere de la Sante',
  code: 'BJ-MS',
  parent_id: platformId,
  country: process.env.FACILITY_COUNTRY || 'BJ',
  status: 'active',
  created_at: now(),
  updated_at: now(),
});
insert('organization', {
  id: facilityId,
  type: 'health-center',
  name: process.env.FACILITY_NAME || 'Centre de Sante de Cotonou',
  code: process.env.FACILITY_ID || 'BJ-LIT-CSC-001',
  parent_id: ministryId,
  region: 'Littoral',
  country: process.env.FACILITY_COUNTRY || 'BJ',
  status: 'active',
  created_at: now(),
  updated_at: now(),
});

// Matrice role -> permissions et politique d'acces par defaut.
for (const role of ROLES) {
  for (const permission of DEFAULT_ROLE_PERMISSIONS[role]) {
    db.prepare('INSERT OR IGNORE INTO role_permission (role, permission) VALUES (?, ?)').run(role, permission);
  }
}
insert('access_policy', { id: 1, updated_at: now() });

// ------------------------------------------------------------------ praticien
const drId = randomUUID();
insert('practitioner', {
  id: drId,
  given_name: 'Ama',
  family_name: 'Sossou',
  qualification: 'Medecin generaliste',
  speciality_code: '419772000',
  license_number: 'CNOM-BJ-4821',
  email: 'a.sossou@example.bj',
  phone: '+229 97 00 00 00',
  facility_id: facilityId,
  created_at: now(),
});

// ------------------------------------------------------------------- patients
const p1 = randomUUID(); // femme enceinte
insert('patient', {
  id: p1,
  mrn: 'CSC-2026-00001',
  given_name: 'Adjoa',
  family_name: 'Kossou',
  birth_date: '1998-04-12',
  gender: 'female',
  phone: '+229 96 12 34 56',
  city: 'Cotonou',
  district: 'Littoral',
  country: 'BJ',
  preferred_language: 'fon',
  is_pregnant: 1,
  weight_kg: 62,
  created_at: daysAgo(120),
  organization_id: facilityId,
  updated_at: daysAgo(120),
});
insert('problem', {
  id: randomUUID(),
  patient_id: p1,
  label: 'Surveillance de grossesse normale',
  icd10_code: 'Z34',
  clinical_status: 'active',
  recorded_at: daysAgo(90),
});

const p2 = randomUUID(); // enfant
insert('patient', {
  id: p2,
  mrn: 'CSC-2026-00002',
  given_name: 'Koffi',
  family_name: 'Adjovi',
  birth_date: '2022-09-03',
  gender: 'male',
  city: 'Abomey-Calavi',
  district: 'Atlantique',
  preferred_language: 'fr',
  weight_kg: 13.5,
  created_at: daysAgo(45),
  organization_id: facilityId,
  updated_at: daysAgo(45),
});

const p3 = randomUUID(); // polypathologique allergique
insert('patient', {
  id: p3,
  mrn: 'CSC-2026-00003',
  given_name: 'Bernard',
  family_name: 'Houngbedji',
  birth_date: '1957-11-20',
  gender: 'male',
  phone: '+229 95 88 77 66',
  city: 'Porto-Novo',
  district: 'Oueme',
  preferred_language: 'fr',
  weight_kg: 84,
  height_cm: 172,
  renal_impairment: 1,
  blood_group: 'O+',
  created_at: daysAgo(300),
  organization_id: facilityId,
  updated_at: daysAgo(10),
});
insert('allergy', {
  id: randomUUID(),
  patient_id: p3,
  substance: 'Amoxicilline',
  atc_code: 'J01CA04',
  category: 'medication',
  criticality: 'high',
  reaction: 'Urticaire generalisee et oedeme des levres',
  recorded_at: daysAgo(300),
});
for (const [label, icd] of [
  ['Hypertension essentielle (primitive)', 'I10'],
  ['Diabete sucre de type 2', 'E11'],
]) {
  insert('problem', {
    id: randomUUID(),
    patient_id: p3,
    label,
    icd10_code: icd,
    clinical_status: 'active',
    recorded_at: daysAgo(280),
    verification_status: 'confirmed',
  });
}
for (const [drug, atc, dose] of [
  ['Amlodipine', 'C08CA01', '5 mg le matin'],
  ['Metformine', 'A10BA02', '850 mg deux fois par jour'],
]) {
  insert('medication_statement', {
    id: randomUUID(),
    patient_id: p3,
    drug_name: drug,
    atc_code: atc,
    dose,
    status: 'active',
    started_on: daysAgo(280).slice(0, 10),
  });
}

// ------------------------------------------------- consultation de demonstration
const cId = randomUUID();
insert('consultation', {
  id: cId,
  patient_id: p2,
  practitioner_id: drId,
  status: 'in-progress',
  encounter_class: 'AMB',
  reason_text: 'Fievre depuis trois jours',
  started_at: now(),
  language: 'fr',
  consent_recording: 1,
  consent_at: now(),
  location: process.env.FACILITY_NAME || 'Centre de Sante de Cotonou',
  organization_id: facilityId,
  created_at: now(),
  updated_at: now(),
});

/**
 * La transcription de demonstration vient du CORPUS ANNOTE, pas d'une copie.
 *
 * Les deux ont besoin des memes tours avec les memes etiquettes : l'un pour
 * peupler la demonstration, l'autre pour mesurer l'attribution (npm run mesure).
 * Deux copies auraient diverge a la premiere correction, et la mesure aurait
 * alors porte sur autre chose que ce qu'on montre.
 */
const CORPUS = JSON.parse(
  readFileSync(new URL('../corpus/consultation-pediatrique.json', import.meta.url), 'utf8'),
);
const DEMO = CORPUS.tours.map((t) => [t.gold, t.text]);

DEMO.forEach(([speaker, text], i) => {
  insert('transcript_segment', {
    id: randomUUID(),
    consultation_id: cId,
    seq: i + 1,
    speaker,
    text,
    start_ms: i * 8000,
    confidence: 0.9,
    language: 'fr-FR',
    created_at: now(),
  });
});

const transcript = DEMO.map(([s, t]) => {
  const label = s === 'clinician' ? 'Medecin' : s === 'patient' ? 'Patient' : 'Accompagnant';
  return `[${label}] ${t}`;
}).join('\n');
db.prepare('UPDATE consultation SET transcript_full = ? WHERE id = ?').run(transcript, cId);

// ------------------------------------------------- unites, lits et postes
//
// Les chiffres sont ceux d'un centre de sante de commune, pas d'un CHU : une
// dizaine de lits par unite, un seul bloc de consultation. Un jeu de
// demonstration surdimensionne donne une fausse idee de ce que l'ecran doit
// supporter — et cache les cas etroits, comme une unite ou il ne reste qu'un
// lit libre.

const unites = [
  { code: 'MED', nom: 'Medecine generale', categorie: 'hospitalisation', lits: 10 },
  { code: 'MAT', nom: 'Maternite', categorie: 'obstetrique', lits: 8 },
  { code: 'PED', nom: 'Pediatrie', categorie: 'pediatrie', lits: 6 },
  { code: 'URG', nom: 'Urgences — observation', categorie: 'urgences', lits: 4 },
];

const litsParUnite = {};
for (const u of unites) {
  const uniteId = randomUUID();
  insert('unite_soins', {
    id: uniteId,
    organization_id: facilityId,
    code: u.code,
    nom: u.nom,
    categorie: u.categorie,
    actif: 1,
  });

  litsParUnite[u.code] = [];
  for (let i = 1; i <= u.lits; i++) {
    const litId = randomUUID();
    // Un lit hors service par unite a partir de la troisieme place, et un lit
    // a preparer : l'ecran doit montrer ces deux etats des la demonstration,
    // parce que ce sont eux qui font diverger « places » et « lits ».
    const etat = i === 3 ? 'hors-service' : i === 4 ? 'a-preparer' : 'libre';
    insert('lit', {
      id: litId,
      unite_id: uniteId,
      chambre: `${u.code}-${Math.ceil(i / 2)}`,
      code: `${u.code}-${String(i).padStart(2, '0')}`,
      etat,
      isolement: i === u.lits ? 1 : 0,
    });
    litsParUnite[u.code].push({ id: litId, etat });
  }
}

const postes = [
  { code: 'ACC', nom: 'Accueil', categorie: 'accueil' },
  { code: 'TRI', nom: 'Triage', categorie: 'triage' },
  { code: 'CONS-1', nom: 'Consultation 1', categorie: 'consultation' },
  { code: 'CAISSE', nom: 'Caisse', categorie: 'caisse' },
  { code: 'PHARM', nom: 'Pharmacie', categorie: 'pharmacie' },
  { code: 'LABO', nom: 'Laboratoire', categorie: 'laboratoire' },
];

const posteId = {};
for (const p of postes) {
  posteId[p.code] = randomUUID();
  insert('poste', {
    id: posteId[p.code],
    organization_id: facilityId,
    code: p.code,
    nom: p.nom,
    categorie: p.categorie,
    actif: 1,
  });
}

// Un sejour en cours, pour que l'occupation et les files ne soient pas vides
// au premier ecran.
const sejourId = randomUUID();
const litMed = litsParUnite.MED.find((l) => l.etat === 'libre');
insert('sejour', {
  id: sejourId,
  patient_id: p3,
  organization_id: facilityId,
  type: 'hospitalisation',
  statut: 'en-cours',
  lit_id: litMed.id,
  motif: 'Desequilibre glycemique',
  mode_entree: 'urgences',
  admis_le: daysAgo(1),
});
db.prepare("UPDATE lit SET etat = 'occupe' WHERE id = ?").run(litMed.id);
insert('mouvement', {
  id: randomUUID(),
  sejour_id: sejourId,
  lit_id: litMed.id,
  type: 'admission',
  survenu_le: daysAgo(1),
});

// ------------------------------------------------------------- pharmacie
//
// Le rayon porte volontairement les quatre etats que l'ecran doit savoir
// montrer : suffisant, bas, rupture, et entierement perime. Un jeu de
// demonstration ou tout va bien ne prouve rien — et surtout pas que le
// refus de servir un lot perime fonctionne.

const dansNJours = (n) =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const medicaments = [
  {
    dci: 'Amoxicilline', forme: 'comprime', dosage: '500 mg', seuil: 200,
    lots: [
      { numero: 'AMX-2605', perimeLe: dansNJours(420), quantite: 600 },
      { numero: 'AMX-2512', perimeLe: dansNJours(21), quantite: 150 },
    ],
  },
  {
    dci: 'Artemether/lumefantrine', forme: 'comprime', dosage: '20/120 mg', seuil: 120,
    lots: [{ numero: 'ALU-2603', perimeLe: dansNJours(260), quantite: 480 }],
  },
  {
    // Stock bas : au seuil exact, pour que l'ecran le signale des maintenant
    // et non le jour ou il tombe en dessous.
    dci: 'Paracetamol', forme: 'comprime', dosage: '500 mg', seuil: 300,
    lots: [{ numero: 'PAR-2611', perimeLe: dansNJours(180), quantite: 300 }],
  },
  {
    // Entierement perime : les boites sont encore en rayon, et c'est
    // exactement la situation ou quelqu'un les sert sans regarder.
    dci: 'Ceftriaxone', forme: 'injectable', dosage: '1 g', seuil: 40,
    lots: [{ numero: 'CEF-2409', perimeLe: dansNJours(-35), quantite: 60 }],
  },
  {
    // Rupture franche : aucun lot.
    dci: 'Sulfadoxine/pyrimethamine', forme: 'comprime', dosage: '500/25 mg', seuil: 100, lots: [],
  },
  {
    dci: 'Sels de rehydratation orale', forme: 'sachet', dosage: null, seuil: 150,
    lots: [{ numero: 'SRO-2607', perimeLe: dansNJours(540), quantite: 900 }],
  },
];

const rayon = {};
for (const m of medicaments) {
  const articleId = randomUUID();
  rayon[m.dci] = { id: articleId, lots: [] };
  insert('article', {
    id: articleId,
    organization_id: facilityId,
    dci: m.dci,
    forme: m.forme,
    dosage: m.dosage,
    unite: m.forme === 'sachet' ? 'sachet' : 'unite',
    seuil_alerte: m.seuil,
    actif: 1,
  });
  for (const l of m.lots) {
    const lotId = randomUUID();
    insert('lot', {
      id: lotId,
      article_id: articleId,
      numero: l.numero,
      perime_le: l.perimeLe,
      quantite: l.quantite,
    });
    rayon[m.dci].lots.push({
      id: lotId,
      numero: l.numero,
      perimeLe: l.perimeLe,
      quantite: l.quantite,
    });
    insert('mouvement_stock', {
      id: randomUUID(),
      lot_id: lotId,
      article_id: articleId,
      type: 'entree',
      quantite: l.quantite,
      motif: 'Dotation initiale',
    });
  }
}

// --------------------------------------------- plateau technique et bloc
//
// LES SEUILS SONT UNE DONNEE DE L'ETABLISSEMENT, pas une constante de
// l'application. Ceux-ci sont un point de depart pour la demonstration :
// ils doivent etre revus et valides par le biologiste du site avant toute
// utilisation reelle, et c'est pour cela que la table porte les colonnes
// valide_par et valide_le, laissees vides ici.

const seuils = SEUILS_DEMONSTRATION;

for (const s of seuils) {
  insert('seuil_critique', {
    id: randomUUID(),
    organization_id: facilityId,
    examen: s.examen,
    unite: s.unite,
    borne_basse: s.bas,
    borne_haute: s.haut,
    stabilite_min: s.stabilite,
  });
}

// Deux demandes en cours, pour que l'ecran ne soit pas vide : une prelevee
// qui attend son resultat, une qui attend son prelevement.
const demandeKaliemie = randomUUID();
insert('demande_examen', {
  id: demandeKaliemie,
  patient_id: p3,
  sejour_id: sejourId,
  organization_id: facilityId,
  domaine: 'laboratoire',
  examen: 'Kaliemie',
  priorite: 'urgente',
  etat: 'prelevee',
  demandee_le: now(),
  prelevee_le: now(),
  identite_verifiee: 1,
});
const demandeEchographie = randomUUID();
insert('demande_examen', {
  id: demandeEchographie,
  patient_id: p1,
  organization_id: facilityId,
  domaine: 'imagerie',
  examen: 'Echographie obstetricale',
  priorite: 'routine',
  etat: 'demandee',
  demandee_le: now(),
});

const sallesBloc = [
  { code: 'BO-1', nom: 'Bloc 1 — chirurgie generale' },
  { code: 'BO-2', nom: 'Bloc 2 — obstetrique' },
];
const salleId = {};
for (const s of sallesBloc) {
  salleId[s.code] = randomUUID();
  insert('salle_operatoire', {
    id: salleId[s.code],
    organization_id: facilityId,
    code: s.code,
    nom: s.nom,
    actif: 1,
  });
}

// Une intervention lateralisee au programme du jour : c'est le cas ou
// l'affichage du cote compte, et il doit etre visible des la demonstration.
//
// LES CRENEAUX SONT RELATIFS A MAINTENANT, et non poses a huit heures du
// matin. Une demonstration faite a seize heures montrerait sinon un
// programme entierement passe, avec un patient « entre au bloc » six heures
// apres la fin de son creneau. Le bloc se regarde au present.
const creneau = (minutes) =>
  new Date(Date.now() + minutes * 60000).toISOString().replace('T', ' ').slice(0, 19);
const interventionHernie = randomUUID();
insert('intervention', {
  id: interventionHernie,
  patient_id: p3,
  sejour_id: sejourId,
  salle_id: salleId['BO-1'],
  organization_id: facilityId,
  geste: 'Cure de hernie inguinale',
  lateralise: 1,
  lateralite: 'droite',
  // Creneau commence il y a un quart d'heure : le parcours fera entrer le
  // patient en salle, et l'ecart entre le prevu et le reel est precisement
  // ce que le bloc doit savoir mesurer.
  debut_prevu: creneau(-15),
  fin_prevue: creneau(105),
  etat: 'programmee',
  operateur_id: drId,
});
insert('intervention', {
  id: randomUUID(),
  patient_id: p1,
  salle_id: salleId['BO-2'],
  organization_id: facilityId,
  geste: 'Cesarienne programmee',
  lateralise: 0,
  lateralite: 'sans-objet',
  debut_prevu: creneau(150),
  fin_prevue: creneau(240),
  etat: 'programmee',
  operateur_id: drId,
});

// ------------------------------------------------- le parcours de demonstration
//
// Tout ce qui precede est le DECOR : des unites, des lits, un rayon, des
// salles. Ce qui suit est le PARCOURS — des gens qui attendent, une facture
// a moitie reglee, une boite sortie du bon lot, une valeur critique corrigee
// puis transmise, une checklist incomplete. Le decor se regarde ; le
// parcours se demontre.
//
// Il est decrit dans `lib/demo/scenario.ts`, module pur dont les invariants
// sont verifies par `npm test` — c'est-a-dire qu'une demonstration cassee se
// voit avant la salle, et non devant elle.

function appliquer(ecriture) {
  if (ecriture.op === 'inserer') {
    insert(ecriture.table, ecriture.ligne);
    return;
  }
  const champs = Object.keys(ecriture.champs);
  db.prepare(
    `UPDATE ${ecriture.table} SET ${champs.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
  ).run(...champs.map((c) => ecriture.champs[c]), ecriture.id);
}

const parcours = parcoursDemonstration({
  organizationId: facilityId,
  practitionerId: drId,
  praticienNom: 'Dr Ama Sossou',
  patients: { adjoa: p1, koffi: p2, bernard: p3 },
  sejourBernard: sejourId,
  postes: posteId,
  articles: rayon,
  demandeKaliemie,
  demandeEchographie,
  interventionHernie,
  maintenant: new Date(),
  id: randomUUID,
});

for (const ecriture of parcours) appliquer(ecriture);
const poses = recapitulatif(parcours);

// ------------------------------------------------------------------ comptes
//
// Un compte par role, pour pouvoir eprouver la hierarchie de bout en bout.
// Le mot de passe commun n'est acceptable que pour une base de demonstration :
// en production, les comptes se creent depuis la console (mot de passe genere)
// ou avec `node scripts/create-admin.mjs`.

const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'ParleDocteur2026!';

function account({ email, fullName, role, organizationId, practitionerId, licenseNumber }) {
  const { hash, salt, algo } = hashPassword(DEMO_PASSWORD);
  const id = randomUUID();
  insert('user_account', {
    id,
    email,
    password_hash: hash,
    password_salt: salt,
    password_algo: algo,
    password_changed_at: now(),
    full_name: fullName,
    role,
    organization_id: organizationId ?? null,
    practitioner_id: practitionerId ?? null,
    license_number: licenseNumber ?? null,
    status: 'active',
    must_change_password: 0,
    created_at: now(),
    updated_at: now(),
  });
  return id;
}

const accounts = [
  account({ email: 'super@parledocteur.local', fullName: 'Super Administrateur', role: 'super_admin', organizationId: platformId }),
  account({ email: 'admin@parledocteur.local', fullName: 'Administrateur Plateforme', role: 'admin', organizationId: platformId }),
  account({ email: 'ministere@sante.bj', fullName: 'Direction des Systemes d Information', role: 'ministere', organizationId: ministryId }),
  account({ email: 'direction@csc.bj', fullName: 'Direction du Centre de Sante', role: 'hopital', organizationId: facilityId }),
  account({
    email: 'a.sossou@example.bj',
    fullName: 'Ama Sossou',
    role: 'medecin',
    organizationId: facilityId,
    practitionerId: drId,
    licenseNumber: 'CNOM-BJ-4821',
  }),
];

insert('audit_log', {
  id: randomUUID(),
  at: now(),
  actor_label: 'seed',
  action: 'create',
  entity: 'dataset',
  detail: `Jeu de demonstration : 3 organisations, ${accounts.length} comptes, 3 patients, ${unites.length} unites, ${postes.length} postes.`,
});

console.log(`Base initialisee : ${DB_PATH}`);
console.log(`  praticien   : Dr Ama Sossou`);
console.log(`  patients    : 3 (${p1.slice(0, 8)}, ${p2.slice(0, 8)}, ${p3.slice(0, 8)})`);
console.log(`  consultation: /consultations/${cId}`);
const totalLits = unites.reduce((n, u) => n + u.lits, 0);
console.log(
  `  hopital     : ${unites.length} unites (${totalLits} lits), ${postes.length} postes, 1 sejour en cours`,
);
console.log(
  `  pharmacie   : ${medicaments.length} references, dont 1 en rupture, 1 au seuil et 1 entierement perimee`,
);
console.log(
  `  plateau     : ${seuils.length} seuils (1 volontairement sans borne), 2 demandes en cours`,
);
console.log(`  bloc        : ${sallesBloc.length} salles, 2 interventions au programme du jour`);
console.log('');
console.log('Parcours de demonstration (relatif a maintenant) :');
console.log(
  `  files       : ${poses.passage} passages, dont 1 urgence vitale arrivee en dernier,`,
);
console.log('                2 remontes par anciennete et 1 parti sans avoir ete vu');
console.log(
  `  caisse      : ${poses.facture} factures, ${poses.paiement} paiements — une soldee,`,
);
console.log('                une a 17 500 F de reste a charge sur un acte programmable');
console.log(
  `  ordonnance  : validee, ${poses.prescription_item} lignes, dont 1 en rupture au rayon`,
);
console.log('  pharmacie   : 21 comprimes servis sur le lot qui perime le premier');
console.log(
  `  plateau     : ${poses.resultat_examen} resultats — 1 kaliemie corrigee (l ancienne`,
);
console.log('                version conservee) et acquittee, 1 hemoglobine critique');
console.log('                NON transmise, 1 goutte epaisse sans seuil donc non interpretee');
console.log(
  `  bloc        : patient au bloc, ${poses.checklist_bloc} points coches, « avant incision » incomplet`,
);
console.log('');
console.log('Comptes de demonstration (mot de passe commun : ' + DEMO_PASSWORD + ') :');
console.log('  super@parledocteur.local   super-administrateur : tout, y compris base et serveurs');
console.log('  admin@parledocteur.local   administrateur plateforme : organisations et comptes');
console.log('  ministere@sante.bj         ministere : indicateurs agreges, aucun dossier nominatif');
console.log('  direction@csc.bj           etablissement : valide ses medecins, suit son activite');
console.log('  a.sossou@example.bj        medecin : consultations, dossiers, ordonnances');
console.log('');
console.log('Lancez `npm run dev` puis connectez-vous sur /connexion.');
