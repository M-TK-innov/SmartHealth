/**
 * Schema du dossier medical, embarque dans le bundle.
 *
 * Le SQL est une constante TypeScript et non un fichier lu au demarrage : dans
 * l application desktop empaquetee le repertoire courant n est pas celui des
 * sources, et un chemin relatif casserait l ouverture de la base.
 */

export const SCHEMA_SQL = `-- ParleDocteur - Schema du dossier medical electronique
-- Aligne sur les ressources FHIR R4 : Patient, Practitioner, Encounter, Condition,
-- Observation, AllergyIntolerance, MedicationRequest, ServiceRequest, Composition.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- Praticiens
CREATE TABLE IF NOT EXISTS practitioner (
  id              TEXT PRIMARY KEY,
  given_name      TEXT NOT NULL,
  family_name     TEXT NOT NULL,
  qualification   TEXT,
  speciality_code TEXT,
  license_number  TEXT,
  email           TEXT,
  phone           TEXT,
  signature_svg   TEXT,
  facility_id     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------------ Patients
CREATE TABLE IF NOT EXISTS patient (
  id                   TEXT PRIMARY KEY,
  mrn                  TEXT UNIQUE,
  national_id          TEXT,
  insurance_id         TEXT,
  insurance_scheme     TEXT,
  given_name           TEXT NOT NULL,
  family_name          TEXT NOT NULL,
  birth_date           TEXT,
  birth_date_estimated INTEGER NOT NULL DEFAULT 0,
  gender               TEXT CHECK (gender IN ('male','female','other','unknown')) DEFAULT 'unknown',
  phone                TEXT,
  address_line         TEXT,
  city                 TEXT,
  district             TEXT,
  country              TEXT DEFAULT 'BJ',
  preferred_language   TEXT DEFAULT 'fr',
  blood_group          TEXT,
  weight_kg            REAL,
  height_cm            REAL,
  is_pregnant          INTEGER NOT NULL DEFAULT 0,
  renal_impairment     INTEGER NOT NULL DEFAULT 0,
  hepatic_impairment   INTEGER NOT NULL DEFAULT 0,
  emergency_contact    TEXT,
  photo_data_url       TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_patient_name ON patient(family_name, given_name);
CREATE INDEX IF NOT EXISTS idx_patient_mrn  ON patient(mrn);

-- Antecedents persistants -> FHIR Condition (problem-list-item)
CREATE TABLE IF NOT EXISTS problem (
  id                     TEXT PRIMARY KEY,
  patient_id             TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  label                  TEXT NOT NULL,
  icd10_code             TEXT,
  snomed_code            TEXT,
  category               TEXT DEFAULT 'problem-list-item',
  clinical_status        TEXT DEFAULT 'active',
  onset_date             TEXT,
  recorded_at            TEXT NOT NULL DEFAULT (datetime('now')),
  source_consultation_id TEXT,
  confidence             REAL,
  verification_status    TEXT DEFAULT 'confirmed'
);
CREATE INDEX IF NOT EXISTS idx_problem_patient ON problem(patient_id);

-- Allergies -> FHIR AllergyIntolerance
CREATE TABLE IF NOT EXISTS allergy (
  id                     TEXT PRIMARY KEY,
  patient_id             TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  substance              TEXT NOT NULL,
  atc_code               TEXT,
  category               TEXT DEFAULT 'medication',
  criticality            TEXT DEFAULT 'low',
  reaction               TEXT,
  recorded_at            TEXT NOT NULL DEFAULT (datetime('now')),
  source_consultation_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_allergy_patient ON allergy(patient_id);

-- Traitements au long cours -> FHIR MedicationStatement
CREATE TABLE IF NOT EXISTS medication_statement (
  id                     TEXT PRIMARY KEY,
  patient_id             TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  drug_name              TEXT NOT NULL,
  atc_code               TEXT,
  dose                   TEXT,
  status                 TEXT DEFAULT 'active',
  started_on             TEXT,
  stopped_on             TEXT,
  source_consultation_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_medstmt_patient ON medication_statement(patient_id);

-- ------------------------------------------------------------- Consultations
CREATE TABLE IF NOT EXISTS consultation (
  id                TEXT PRIMARY KEY,
  patient_id        TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  practitioner_id   TEXT REFERENCES practitioner(id),
  status            TEXT NOT NULL DEFAULT 'in-progress',
  encounter_class   TEXT DEFAULT 'AMB',
  reason_text       TEXT,
  started_at        TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at          TEXT,
  signed_at         TEXT,
  language          TEXT DEFAULT 'fr',
  consent_recording INTEGER NOT NULL DEFAULT 0,
  consent_at        TEXT,
  location          TEXT,
  audio_duration_s  INTEGER DEFAULT 0,
  transcript_full   TEXT DEFAULT '',
  analysis_json     TEXT,
  analysis_engine   TEXT,
  analysis_at       TEXT,
  report_markdown   TEXT,
  report_edited     INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_consult_patient ON consultation(patient_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_consult_status  ON consultation(status);

-- Segments de transcription horodates (tracabilite phrase -> donnee extraite)
CREATE TABLE IF NOT EXISTS transcript_segment (
  id              TEXT PRIMARY KEY,
  consultation_id TEXT NOT NULL REFERENCES consultation(id) ON DELETE CASCADE,
  seq             INTEGER NOT NULL,
  speaker         TEXT DEFAULT 'unknown',
  text            TEXT NOT NULL,
  start_ms        INTEGER,
  end_ms          INTEGER,
  confidence      REAL,
  language        TEXT,
  is_final        INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_segment_consult ON transcript_segment(consultation_id, seq);

-- Constantes et resultats -> FHIR Observation
CREATE TABLE IF NOT EXISTS observation (
  id              TEXT PRIMARY KEY,
  patient_id      TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  consultation_id TEXT REFERENCES consultation(id) ON DELETE CASCADE,
  category        TEXT DEFAULT 'vital-signs',
  code_loinc      TEXT,
  label           TEXT NOT NULL,
  value_num       REAL,
  value_text      TEXT,
  unit            TEXT,
  ucum            TEXT,
  interpretation  TEXT,
  effective_at    TEXT NOT NULL DEFAULT (datetime('now')),
  source          TEXT DEFAULT 'ai-extraction',
  confidence      REAL
);
CREATE INDEX IF NOT EXISTS idx_obs_patient ON observation(patient_id, effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_consult ON observation(consultation_id);

-- Diagnostics de la rencontre -> FHIR Condition (encounter-diagnosis)
CREATE TABLE IF NOT EXISTS diagnosis (
  id              TEXT PRIMARY KEY,
  consultation_id TEXT NOT NULL REFERENCES consultation(id) ON DELETE CASCADE,
  patient_id      TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  icd10_code      TEXT,
  snomed_code     TEXT,
  rank            INTEGER DEFAULT 1,
  certainty       TEXT DEFAULT 'suspected',
  confidence      REAL,
  rationale       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_diag_consult ON diagnosis(consultation_id);

-- Examens demandes -> FHIR ServiceRequest
CREATE TABLE IF NOT EXISTS service_request (
  id              TEXT PRIMARY KEY,
  consultation_id TEXT NOT NULL REFERENCES consultation(id) ON DELETE CASCADE,
  patient_id      TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  loinc_code      TEXT,
  category        TEXT DEFAULT 'laboratory',
  priority        TEXT DEFAULT 'routine',
  reason          TEXT,
  status          TEXT DEFAULT 'draft',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sreq_consult ON service_request(consultation_id);

-- --------------------------------------------------------------- Ordonnances
-- Toute ordonnance est creee en statut 'draft' par l'IA. Elle n'a aucune valeur
-- legale tant que le medecin ne l'a pas validee (validated_by / validated_at).
CREATE TABLE IF NOT EXISTS prescription (
  id               TEXT PRIMARY KEY,
  consultation_id  TEXT NOT NULL REFERENCES consultation(id) ON DELETE CASCADE,
  patient_id       TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  practitioner_id  TEXT REFERENCES practitioner(id),
  status           TEXT NOT NULL DEFAULT 'draft',
  origin           TEXT NOT NULL DEFAULT 'ai-proposed',
  notes            TEXT,
  safety_json      TEXT,
  validated_by     TEXT REFERENCES practitioner(id),
  validated_at     TEXT,
  validation_note  TEXT,
  cancelled_reason TEXT,
  qr_payload       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_presc_consult ON prescription(consultation_id);
CREATE INDEX IF NOT EXISTS idx_presc_status  ON prescription(status);

CREATE TABLE IF NOT EXISTS prescription_item (
  id                   TEXT PRIMARY KEY,
  prescription_id      TEXT NOT NULL REFERENCES prescription(id) ON DELETE CASCADE,
  seq                  INTEGER NOT NULL DEFAULT 1,
  drug_name            TEXT NOT NULL,
  brand_name           TEXT,
  atc_code             TEXT,
  form                 TEXT,
  strength             TEXT,
  dose                 TEXT,
  route                TEXT DEFAULT 'oral',
  frequency            TEXT,
  frequency_per_day    REAL,
  duration_days        INTEGER,
  quantity             TEXT,
  instructions         TEXT,
  substitution_allowed INTEGER NOT NULL DEFAULT 1,
  is_essential_list    INTEGER NOT NULL DEFAULT 0,
  ai_confidence        REAL,
  ai_rationale         TEXT,
  edited_by_clinician  INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pitem_presc ON prescription_item(prescription_id, seq);

-- --------------------------------------------------------- Journal & interop
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  actor_id    TEXT,
  actor_label TEXT,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  patient_id  TEXT,
  detail      TEXT,
  ip          TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_patient ON audit_log(patient_id);

CREATE TABLE IF NOT EXISTS interop_export (
  id              TEXT PRIMARY KEY,
  consultation_id TEXT REFERENCES consultation(id) ON DELETE CASCADE,
  patient_id      TEXT REFERENCES patient(id) ON DELETE CASCADE,
  format          TEXT NOT NULL,
  target          TEXT,
  status          TEXT NOT NULL DEFAULT 'generated',
  payload         TEXT,
  response        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_export_consult ON interop_export(consultation_id);
`;
