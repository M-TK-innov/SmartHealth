/**
 * Generation de messages HL7 v2.5.1.
 *
 * FHIR est la cible moderne, mais l'immense majorite des systemes hospitaliers
 * deja installes (LIS de laboratoire, SIH, pharmacies, plateaux techniques)
 * ne parlent que HL7 v2. On produit donc aussi :
 *   - ADT^A04 : enregistrement du patient
 *   - ORU^R01 : transmission des observations
 *   - RDE^O11 : ordonnance transmise a la pharmacie
 *   - ORM^O01 : demande d'examen au laboratoire
 */

import type {
  Consultation,
  Diagnosis,
  Observation,
  Patient,
  Practitioner,
  Prescription,
  PrescriptionItem,
  ServiceRequest,
} from '@/lib/types';

const CR = '\r';
const FIELD = '|';
const COMP = '^';

/** Echappe les separateurs HL7 dans une valeur de champ. */
function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/\\/g, '\\E\\')
    .replace(/\|/g, '\\F\\')
    .replace(/\^/g, '\\S\\')
    .replace(/&/g, '\\T\\')
    .replace(/~/g, '\\R\\')
    .replace(/[\r\n]+/g, ' ');
}

function seg(name: string, fields: (string | number | null | undefined)[]): string {
  return [name, ...fields.map((f) => (f === null || f === undefined ? '' : String(f)))].join(FIELD);
}

/** Horodatage HL7 : YYYYMMDDHHMMSS */
export function hl7Ts(sqlDate?: string | null): string {
  const d = sqlDate ? new Date(sqlDate.includes('T') ? sqlDate : sqlDate.replace(' ', 'T') + 'Z') : new Date();
  const valid = Number.isNaN(d.getTime()) ? new Date() : d;
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${valid.getUTCFullYear()}${p(valid.getUTCMonth() + 1)}${p(valid.getUTCDate())}${p(valid.getUTCHours())}${p(valid.getUTCMinutes())}${p(valid.getUTCSeconds())}`;
}

function hl7Date(iso?: string | null): string {
  if (!iso) return '';
  return iso.replace(/-/g, '').slice(0, 8);
}

function sendingApp(): string {
  return `ParleDocteur^${esc(process.env.FACILITY_ID || 'PD')}^L`;
}

function facility(): string {
  return esc(process.env.FACILITY_NAME || 'Structure de sante');
}

function msh(messageType: string, controlId: string): string {
  return [
    'MSH',
    '^~\\&',
    sendingApp(),
    facility(),
    'RECEIVER',
    'RECEIVING_FACILITY',
    hl7Ts(),
    '',
    messageType,
    controlId,
    'P', // production
    '2.5.1',
    '',
    '',
    'AL', // accept acknowledgement
    'AL',
    esc(process.env.FACILITY_COUNTRY || 'BJ'),
    'UNICODE UTF-8',
    'fr-FR',
  ].join(FIELD);
}

function pid(p: Patient): string {
  const identifiers = [
    p.mrn ? `${esc(p.mrn)}^^^${facility()}^MR` : null,
    p.national_id ? `${esc(p.national_id)}^^^NATIONAL^NI` : null,
    p.insurance_id ? `${esc(p.insurance_id)}^^^${esc(p.insurance_scheme || 'ASSURANCE')}^SB` : null,
  ]
    .filter(Boolean)
    .join('~');

  const gender = { male: 'M', female: 'F', other: 'O', unknown: 'U' }[p.gender] ?? 'U';
  const address = [esc(p.address_line), esc(p.city), esc(p.district), '', esc(p.country)].join(COMP);

  return seg('PID', [
    '1',
    '',
    identifiers,
    '',
    `${esc(p.family_name)}^${esc(p.given_name)}`,
    '',
    hl7Date(p.birth_date),
    gender,
    '',
    '',
    address,
    '',
    esc(p.phone),
    '',
    esc(p.preferred_language),
  ]);
}

function pv1(c: Consultation, pr?: Practitioner | null): string {
  const doctor = pr ? `${esc(pr.license_number || pr.id)}^${esc(pr.family_name)}^${esc(pr.given_name)}^^^Dr` : '';
  const patientClass = c.encounter_class === 'IMP' ? 'I' : c.encounter_class === 'EMER' ? 'E' : 'O';
  return seg('PV1', [
    '1',
    patientClass,
    esc(c.location || facility()),
    '',
    '',
    '',
    doctor, // medecin responsable
    '',
    doctor, // medecin consultant
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    esc(c.id), // numero de visite
    ...Array(24).fill(''),
    hl7Ts(c.started_at),
    c.ended_at ? hl7Ts(c.ended_at) : '',
  ]);
}

// -------------------------------------------------------------- ADT^A04

export function buildAdtA04(p: Patient, c: Consultation, pr?: Practitioner | null): string {
  return [msh('ADT^A04^ADT_A01', `ADT${hl7Ts()}`), 'EVN|A04|' + hl7Ts(c.started_at), pid(p), pv1(c, pr)].join(CR) + CR;
}

// -------------------------------------------------------------- ORU^R01

export function buildOruR01(opts: {
  patient: Patient;
  consultation: Consultation;
  practitioner?: Practitioner | null;
  observations: Observation[];
  diagnoses: Diagnosis[];
  reportText?: string;
}): string {
  const { patient, consultation, practitioner, observations, diagnoses } = opts;
  const lines = [msh('ORU^R01^ORU_R01', `ORU${hl7Ts()}`), pid(patient), pv1(consultation, practitioner)];

  // Diagnostics
  diagnoses.forEach((d, i) => {
    lines.push(
      seg('DG1', [
        String(i + 1),
        'I10', // codage CIM-10
        d.icd10_code ? `${esc(d.icd10_code)}^${esc(d.label)}^I10` : esc(d.label),
        esc(d.label),
        hl7Ts(d.created_at),
        d.rank === 1 ? 'F' : 'S', // Final / Secondary
      ]),
    );
  });

  lines.push(
    seg('OBR', [
      '1',
      esc(consultation.id),
      '',
      '11488-4^Consult note^LN',
      '',
      '',
      hl7Ts(consultation.started_at),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      consultation.signed_at ? hl7Ts(consultation.signed_at) : '',
      '',
      '',
      consultation.status === 'signed' ? 'F' : 'P', // Final / Preliminary
    ]),
  );

  let setId = 0;
  for (const o of observations) {
    setId++;
    lines.push(
      seg('OBX', [
        String(setId),
        o.value_num !== null ? 'NM' : 'ST',
        o.code_loinc ? `${esc(o.code_loinc)}^${esc(o.label)}^LN` : esc(o.label),
        '1',
        o.value_num !== null ? String(o.value_num) : esc(o.value_text),
        esc(o.unit),
        '', // intervalles de reference
        esc(o.interpretation),
        '',
        '',
        'F',
        '',
        '',
        hl7Ts(o.effective_at),
      ]),
    );
  }

  if (opts.reportText) {
    for (const chunk of chunkText(opts.reportText, 200)) {
      setId++;
      lines.push(seg('OBX', [String(setId), 'TX', '11488-4^Consult note^LN', '2', esc(chunk), '', '', '', '', '', 'F']));
    }
  }

  return lines.join(CR) + CR;
}

// -------------------------------------------------------------- RDE^O11

export function buildRdeO11(opts: {
  patient: Patient;
  consultation: Consultation;
  practitioner?: Practitioner | null;
  prescription: Prescription;
  items: PrescriptionItem[];
}): string {
  const { patient, consultation, practitioner, prescription, items } = opts;
  if (prescription.status !== 'validated') {
    throw new Error('Seule une ordonnance validee par le medecin peut etre transmise a la pharmacie.');
  }

  const lines = [msh('RDE^O11^RDE_O11', `RDE${hl7Ts()}`), pid(patient), pv1(consultation, practitioner)];
  const prescriber = practitioner
    ? `${esc(practitioner.license_number || practitioner.id)}^${esc(practitioner.family_name)}^${esc(practitioner.given_name)}^^^Dr`
    : '';

  items.forEach((item, i) => {
    lines.push(
      seg('ORC', [
        'NW', // new order
        `${esc(prescription.id)}-${i + 1}`,
        '',
        esc(prescription.id),
        'SC', // status changed / active
        '',
        '',
        '',
        hl7Ts(prescription.validated_at),
        '',
        prescriber,
        '',
        '',
        '',
        facility(),
      ]),
    );
    lines.push(
      seg('RXE', [
        buildTq1(item), // quantite/timing
        item.atc_code ? `${esc(item.atc_code)}^${esc(item.drug_name)}^ATC` : esc(item.drug_name),
        '', // dose minimale
        '',
        esc(item.strength),
        esc(item.form),
        esc(item.instructions),
        '',
        '',
        item.duration_days && item.frequency_per_day ? String(item.duration_days * item.frequency_per_day) : '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        esc(item.route),
      ]),
    );
    lines.push(
      seg('RXR', [item.route === 'oral' ? 'PO^Oral^HL70162' : `${esc(item.route)}^${esc(item.route)}^L`]),
    );
  });

  return lines.join(CR) + CR;
}

function buildTq1(item: PrescriptionItem): string {
  const freq = item.frequency_per_day ? `Q${Math.round(24 / item.frequency_per_day)}H` : '';
  const duration = item.duration_days ? `D${item.duration_days}` : '';
  return [`1`, freq, duration].filter(Boolean).join(COMP);
}

// -------------------------------------------------------------- ORM^O01

export function buildOrmO01(opts: {
  patient: Patient;
  consultation: Consultation;
  practitioner?: Practitioner | null;
  requests: ServiceRequest[];
}): string {
  const { patient, consultation, practitioner, requests } = opts;
  const lines = [msh('ORM^O01^ORM_O01', `ORM${hl7Ts()}`), pid(patient), pv1(consultation, practitioner)];
  const prescriber = practitioner
    ? `${esc(practitioner.license_number || practitioner.id)}^${esc(practitioner.family_name)}^${esc(practitioner.given_name)}`
    : '';

  requests.forEach((r, i) => {
    lines.push(seg('ORC', ['NW', `${esc(r.id)}`, '', esc(consultation.id), '', '', '', '', hl7Ts(r.created_at), '', prescriber]));
    lines.push(
      seg('OBR', [
        String(i + 1),
        esc(r.id),
        '',
        r.loinc_code ? `${esc(r.loinc_code)}^${esc(r.label)}^LN` : esc(r.label),
        r.priority === 'stat' ? 'S' : r.priority === 'urgent' ? 'A' : 'R',
        '',
        hl7Ts(r.created_at),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        esc(r.reason),
      ]),
    );
  });

  return lines.join(CR) + CR;
}

function chunkText(text: string, size: number): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length <= size) {
      if (line.trim()) out.push(line);
    } else {
      for (let i = 0; i < line.length; i += size) out.push(line.slice(i, i + size));
    }
  }
  return out;
}

/** Version lisible a l'ecran (les segments HL7 sont separes par \r, invisible dans un navigateur). */
export function humanReadable(message: string): string {
  return message.split(CR).filter(Boolean).join('\n');
}
