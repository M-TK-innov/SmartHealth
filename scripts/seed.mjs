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
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { SCHEMA_SQL } from '../lib/schema.ts';

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
  facility_id: process.env.FACILITY_ID || 'BJ-LIT-CSC-001',
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
  created_at: now(),
  updated_at: now(),
});

const DEMO = [
  ['clinician', 'Bonjour madame, asseyez-vous. Qu est-ce qui amene le petit Koffi aujourd hui ?'],
  ['companion', 'Docteur, il a le corps chaud depuis trois jours, et il ne mange plus.'],
  ['clinician', 'Depuis trois jours. Est-ce qu il vomit ?'],
  ['companion', 'Il a vomi deux fois hier soir. Mais il n a pas la diarrhee.'],
  ['clinician', 'Est-ce qu il tousse ?'],
  ['companion', 'Non, il ne tousse pas. Mais il tremble la nuit, il a des frissons.'],
  ['clinician', 'D accord. Est-ce qu il dort sous moustiquaire ?'],
  ['companion', 'Parfois seulement, la moustiquaire est dechiree.'],
  ['clinician', 'Je vais l examiner. Sa temperature est a 39,2 degres. Le pouls est a 132.'],
  ['clinician', 'Il pese 13,5 kilos. Les conjonctives sont un peu pales.'],
  ['clinician', 'L abdomen est souple, la gorge est propre, les tympans sont normaux.'],
  ['clinician', 'Le tableau evoque fortement un paludisme simple. On va faire un test rapide, un TDR paludisme.'],
  ['clinician', 'Je demande aussi une numeration formule sanguine pour verifier l anemie.'],
  ['companion', 'Est-ce qu il est allergique a quelque chose ? Non, jamais eu de probleme avec les medicaments.'],
  ['clinician', 'Bien. Je vous prescris de l artemether lumefantrine, deux fois par jour pendant trois jours, a prendre au cours des repas.'],
  ['clinician', 'Et du paracetamol 250 milligrammes, trois fois par jour pendant trois jours pour la fievre.'],
  ['clinician', 'Faites-le boire beaucoup. Reparez la moustiquaire, c est important.'],
  ['clinician', 'Si il convulse, s il refuse de boire ou s il devient somnolent, revenez immediatement aux urgences.'],
  ['clinician', 'Revenez me voir dans trois jours pour un controle.'],
];

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

insert('audit_log', {
  id: randomUUID(),
  at: now(),
  actor_label: 'seed',
  action: 'create',
  entity: 'dataset',
  detail: 'Jeu de donnees de demonstration installe.',
});

console.log(`Base initialisee : ${DB_PATH}`);
console.log(`  praticien   : Dr Ama Sossou`);
console.log(`  patients    : 3 (${p1.slice(0, 8)}, ${p2.slice(0, 8)}, ${p3.slice(0, 8)})`);
console.log(`  consultation: /consultations/${cId}`);
console.log('');
console.log('Lancez `npm run dev` puis ouvrez la consultation de demonstration et cliquez sur « Analyser ».');
