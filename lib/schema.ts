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
  organization_id      TEXT,          -- cloisonnement : etablissement proprietaire du dossier
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
  organization_id   TEXT,             -- cloisonnement : etablissement de la rencontre
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
  speaker_source     TEXT DEFAULT 'auto',   -- auto | manual : « manual » fait autorite
  speaker_confidence REAL,                  -- 0..1, confiance de la detection
  pitch_hz           REAL,                  -- hauteur mediane de la voix sur le tour
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

-- ==================================================================
--            Organisations, comptes et controle d'acces
-- ==================================================================
--
-- Hierarchie : plateforme > ministere > hopital / centre de sante.
-- Un compte appartient a une organisation et porte un role. Les donnees
-- cliniques sont cloisonnees par organisation : un etablissement ne voit
-- jamais les dossiers d'un autre.

CREATE TABLE IF NOT EXISTS organization (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,               -- platform | ministry | hospital | health-center
  name        TEXT NOT NULL,
  code        TEXT UNIQUE,                 -- identifiant officiel (code SNIS, FINESS...)
  parent_id   TEXT REFERENCES organization(id),
  country     TEXT DEFAULT 'BJ',
  region      TEXT,
  address     TEXT,
  phone       TEXT,
  email       TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending | active | suspended | rejected
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_org_parent ON organization(parent_id);
CREATE INDEX IF NOT EXISTS idx_org_status ON organization(status);

CREATE TABLE IF NOT EXISTS user_account (
  id                   TEXT PRIMARY KEY,
  email                TEXT NOT NULL UNIQUE,
  password_hash        TEXT NOT NULL,
  password_salt        TEXT NOT NULL,
  password_algo        TEXT NOT NULL DEFAULT 'scrypt',
  password_changed_at  TEXT,
  full_name            TEXT NOT NULL,
  phone                TEXT,
  role                 TEXT NOT NULL,      -- medecin | hopital | ministere | admin | super_admin
  organization_id      TEXT REFERENCES organization(id),
  practitioner_id      TEXT REFERENCES practitioner(id),
  license_number       TEXT,               -- numero d'ordre, pour les medecins
  status               TEXT NOT NULL DEFAULT 'pending',
                       -- pending | active | suspended | rejected
  must_change_password INTEGER NOT NULL DEFAULT 0,
  failed_attempts      INTEGER NOT NULL DEFAULT 0,
  locked_until         TEXT,
  last_login_at        TEXT,
  validated_by         TEXT REFERENCES user_account(id),
  validated_at         TEXT,
  rejection_reason     TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_email  ON user_account(email);
CREATE INDEX IF NOT EXISTS idx_user_org    ON user_account(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_status ON user_account(status);

-- Sessions revocables. On stocke l'empreinte du jeton, jamais le jeton :
-- une fuite de la base ne permet pas d'usurper une session en cours.
CREATE TABLE IF NOT EXISTS user_session (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  token_hash     TEXT NOT NULL UNIQUE,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at     TEXT NOT NULL,
  last_seen_at   TEXT,
  ip             TEXT,
  user_agent     TEXT,
  revoked_at     TEXT,
  revoked_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_session_user  ON user_session(user_id);
CREATE INDEX IF NOT EXISTS idx_session_token ON user_session(token_hash);

-- Matrice role -> permissions, modifiable par un administrateur.
CREATE TABLE IF NOT EXISTS role_permission (
  role       TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (role, permission)
);

-- Derogation individuelle : accorde ou retire une permission a un compte
-- precis, par-dessus la matrice de son role.
CREATE TABLE IF NOT EXISTS user_permission (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted    INTEGER NOT NULL,             -- 1 = accordee, 0 = retiree explicitement
  granted_by TEXT REFERENCES user_account(id),
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  reason     TEXT,
  UNIQUE (user_id, permission)
);

-- Politique d'acces de la plateforme (ligne unique).
CREATE TABLE IF NOT EXISTS access_policy (
  id                       INTEGER PRIMARY KEY CHECK (id = 1),
  password_min_length      INTEGER NOT NULL DEFAULT 10,
  password_require_mixed   INTEGER NOT NULL DEFAULT 1,
  session_hours            INTEGER NOT NULL DEFAULT 12,
  max_failed_attempts      INTEGER NOT NULL DEFAULT 5,
  lockout_minutes          INTEGER NOT NULL DEFAULT 15,
  allow_self_registration  INTEGER NOT NULL DEFAULT 1,
  require_admin_validation INTEGER NOT NULL DEFAULT 1,
  updated_by               TEXT,
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------- Adresses, serveurs et restrictions
-- Configuration reseau de l installation. Une seule ligne : une installation
-- est un serveur, une base et un jeu de destinations.
--
-- Aucun secret ici. Les identifiants restent dans l environnement du serveur ;
-- la table n en garde que le NOM de la variable. Une adresse est une donnee
-- d exploitation, un secret ne l est pas : le premier se modifie depuis la
-- console, le second suppose un acces au serveur.
CREATE TABLE IF NOT EXISTS network_config (
  id                      INTEGER PRIMARY KEY CHECK (id = 1),
  app_public_url          TEXT,
  app_bind_host           TEXT NOT NULL DEFAULT '127.0.0.1',
  app_port                INTEGER NOT NULL DEFAULT 3000,
  app_https               INTEGER NOT NULL DEFAULT 0,
  allowed_origins         TEXT NOT NULL DEFAULT '',
  fhir_access             TEXT NOT NULL DEFAULT 'session'
                            CHECK (fhir_access IN ('session','token','open')),
  db_path                 TEXT NOT NULL DEFAULT '',
  db_backup_dir           TEXT,
  db_encrypted            INTEGER NOT NULL DEFAULT 0,
  data_residency_country  TEXT NOT NULL DEFAULT 'BJ',
  allow_external_transfer INTEGER NOT NULL DEFAULT 0,
  updated_by              TEXT,
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Destinations declarees : serveurs internes du reseau de la structure et
-- services externes. La portee (internal / external) commande les controles
-- appliques, elle est donc verifiee contre l adresse reelle.
CREATE TABLE IF NOT EXISTS network_endpoint (
  id           TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  scope        TEXT NOT NULL CHECK (scope IN ('internal','external')),
  category     TEXT NOT NULL
                 CHECK (category IN ('fhir','hl7','dhis2','whisper','llm','backup','other')),
  url          TEXT NOT NULL,
  enabled      INTEGER NOT NULL DEFAULT 1,
  auth_mode    TEXT NOT NULL DEFAULT 'none' CHECK (auth_mode IN ('none','token','basic','mtls')),
  secret_env   TEXT,
  data_class   TEXT NOT NULL DEFAULT 'none'
                 CHECK (data_class IN ('none','aggregated','pseudonymised','identifying')),
  country      TEXT,
  verify_tls   INTEGER NOT NULL DEFAULT 1,
  note         TEXT,
  last_test_at     TEXT,
  last_test_status TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by   TEXT
);

-- Levee ecrite d une restriction. Le logiciel ne tranche pas a la place du
-- responsable de traitement, mais il exige une justification et retient qui
-- l a signee : sans cela, une restriction se contourne sans laisser de trace.
CREATE TABLE IF NOT EXISTS compliance_derogation (
  id               TEXT PRIMARY KEY,
  code             TEXT NOT NULL,
  target           TEXT NOT NULL,
  reason           TEXT NOT NULL,
  granted_by       TEXT,
  granted_by_label TEXT,
  granted_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (code, target)
);
`;
