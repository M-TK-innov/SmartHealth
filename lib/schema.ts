/**
 * Schema du dossier medical, embarque dans le bundle.
 *
 * Le SQL est une constante TypeScript et non un fichier lu au demarrage : dans
 * l application desktop empaquetee le repertoire courant n est pas celui des
 * sources, et un chemin relatif casserait l ouverture de la base.
 */

export const SCHEMA_SQL = `-- SmartHealth - Schema du dossier medical electronique
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
  -- Sejour pendant lequel la consultation a eu lieu. NULL pour une
  -- consultation externe, ce qui est une situation normale et non une
  -- donnee manquante.
  --
  -- Son index est declare dans lib/migrations.ts et NON ici : sur une base
  -- deja installee, la colonne n'existe qu'apres l'ALTER TABLE, et un index
  -- pose ici s'executerait avant — la base ne s'ouvrirait plus.
  sejour_id         TEXT,
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
  -- Phrase reellement prononcee, quand la colonne text en est une traduction.
  -- Conservee parce qu'une traduction est une interpretation : elle peut inverser une
  -- negation ou deplacer une posologie, et le dossier doit garder de quoi le
  -- verifier apres coup, pas seulement au moment de la validation.
  source_text        TEXT,
  source_language    TEXT,                  -- langue de source_text (« fon »...)
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_segment_consult ON transcript_segment(consultation_id, seq);

-- ===================================================================== HOPITAL
--
-- Le sejour est la colonne vertebrale de la plateforme hospitaliere : la
-- gestion des lits, le flux, la caisse et la pharmacie s'y accrochent. Sans
-- lui, chaque module tiendrait son propre etat du monde, et deux services
-- finiraient par ne plus dire la meme chose du meme patient.

-- Unite de soins : medecine, chirurgie, maternite, urgences... -> FHIR Location (ward)
CREATE TABLE IF NOT EXISTS unite_soins (
  id              TEXT PRIMARY KEY,
  organization_id TEXT,
  code            TEXT NOT NULL,
  nom             TEXT NOT NULL,
  -- hospitalisation | urgences | consultation | plateau-technique
  categorie       TEXT NOT NULL DEFAULT 'hospitalisation',
  actif           INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_unite_org ON unite_soins(organization_id, actif);

-- Lit -> FHIR Location (bed). La colonne etat est une donnee DERIVEE, utile
-- pour afficher un plan d'occupation ; ce qui fait foi pour savoir si un lit
-- est pris, c'est qu'un sejour en cours le declare. Se fier a la seule colonne
-- etat laisserait passer la double occupation apres un incident.
CREATE TABLE IF NOT EXISTS lit (
  id         TEXT PRIMARY KEY,
  unite_id   TEXT NOT NULL REFERENCES unite_soins(id) ON DELETE CASCADE,
  chambre    TEXT,
  code       TEXT NOT NULL,              -- lisible par un soignant : « MED-12-B »
  -- libre | occupe | a-preparer | hors-service
  etat       TEXT NOT NULL DEFAULT 'libre',
  isolement  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lit_unite ON lit(unite_id, etat);

-- Sejour -> FHIR Encounter. De l'entree a la sortie.
CREATE TABLE IF NOT EXISTS sejour (
  id              TEXT PRIMARY KEY,
  patient_id      TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  organization_id TEXT,
  -- externe | urgence | hospitalisation
  type            TEXT NOT NULL DEFAULT 'hospitalisation',
  -- prevu | en-cours | sorti | annule
  statut          TEXT NOT NULL DEFAULT 'prevu',
  lit_id          TEXT REFERENCES lit(id) ON DELETE SET NULL,
  motif           TEXT,
  mode_entree     TEXT,                  -- domicile, transfert, urgences...
  mode_sortie     TEXT,                  -- domicile, transfert, contre-avis, deces
  admis_le        TEXT,
  sorti_le        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sejour_patient ON sejour(patient_id, admis_le DESC);
CREATE INDEX IF NOT EXISTS idx_sejour_statut  ON sejour(statut, organization_id);
-- Un lit ne porte qu'un sejour EN COURS. L'index partiel fait tenir
-- l'invariant par la base elle-meme, et pas seulement par le code qui
-- l'appelle : deux chemins d'ecriture concurrents ne peuvent pas le violer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sejour_lit_unique
  ON sejour(lit_id) WHERE statut = 'en-cours' AND lit_id IS NOT NULL;

-- Mouvement : chaque passage dans un lit. C'est l'historique qui permet de
-- reconstituer un parcours, pas seulement l'etat courant.
CREATE TABLE IF NOT EXISTS mouvement (
  id         TEXT PRIMARY KEY,
  sejour_id  TEXT NOT NULL REFERENCES sejour(id) ON DELETE CASCADE,
  lit_id     TEXT REFERENCES lit(id) ON DELETE SET NULL,
  unite_id   TEXT REFERENCES unite_soins(id) ON DELETE SET NULL,
  -- admission | transfert | sortie
  type       TEXT NOT NULL,
  motif      TEXT,
  acteur_id  TEXT,
  survenu_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mouvement_sejour ON mouvement(sejour_id, survenu_le);

-- Poste : un point de passage dans l etablissement (accueil, triage,
-- consultation, caisse, pharmacie, laboratoire). Chaque poste a sa file.
CREATE TABLE IF NOT EXISTS poste (
  id              TEXT PRIMARY KEY,
  organization_id TEXT,
  code            TEXT NOT NULL,         -- lisible : ACC, TRI, CONS-1, CAISSE
  nom             TEXT NOT NULL,
  -- accueil | triage | consultation | caisse | pharmacie | laboratoire | imagerie
  categorie       TEXT NOT NULL DEFAULT 'consultation',
  actif           INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_poste_org ON poste(organization_id, actif);

-- Passage : un patient dans la file d un poste.
--
-- L etat parti n est PAS un synonyme de termine. La part de patients qui
-- repartent sans avoir ete vus est l indicateur le plus direct d un poste
-- sature ; les confondre efface cette mesure.
CREATE TABLE IF NOT EXISTS passage (
  id                TEXT PRIMARY KEY,
  sejour_id         TEXT NOT NULL REFERENCES sejour(id) ON DELETE CASCADE,
  poste_id          TEXT NOT NULL REFERENCES poste(id) ON DELETE CASCADE,
  -- vitale | urgente | standard | differable
  gravite           TEXT NOT NULL DEFAULT 'standard',
  -- en-attente | en-cours | termine | parti
  etat              TEXT NOT NULL DEFAULT 'en-attente',
  arrive_le         TEXT NOT NULL DEFAULT (datetime('now')),
  pris_en_charge_le TEXT,
  termine_le        TEXT,
  acteur_id         TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_passage_file ON passage(poste_id, etat, arrive_le);
CREATE INDEX IF NOT EXISTS idx_passage_sejour ON passage(sejour_id, arrive_le DESC);
-- Un patient n attend qu a un seul endroit a la fois. Sans cet index, une
-- double saisie afficherait le meme patient dans deux files : chaque poste
-- l attendrait, aucun ne l aurait, et l attente mesuree serait fausse aux
-- deux endroits.
CREATE UNIQUE INDEX IF NOT EXISTS idx_passage_ouvert_unique
  ON passage(sejour_id) WHERE etat IN ('en-attente', 'en-cours');

-- Facture : les actes d un sejour et ce qui a ete paye.
--
-- Montants en FRANCS CFA ENTIERS, jamais en flottant : une caisse qui derive
-- d un centime par ligne finit par ne plus tomber juste.
CREATE TABLE IF NOT EXISTS facture (
  id              TEXT PRIMARY KEY,
  sejour_id       TEXT NOT NULL REFERENCES sejour(id) ON DELETE CASCADE,
  organization_id TEXT,
  part_tiers      INTEGER NOT NULL DEFAULT 0,
  tiers_nom       TEXT,                  -- mutuelle, assurance, programme
  close           INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_facture_sejour ON facture(sejour_id);
CREATE INDEX IF NOT EXISTS idx_facture_ouverte ON facture(organization_id, close);

CREATE TABLE IF NOT EXISTS facture_ligne (
  id          TEXT PRIMARY KEY,
  facture_id  TEXT NOT NULL REFERENCES facture(id) ON DELETE CASCADE,
  libelle     TEXT NOT NULL,
  montant     INTEGER NOT NULL,          -- unitaire, francs entiers
  quantite    INTEGER NOT NULL DEFAULT 1,
  -- vitale | urgente | programmable : decide si un impaye peut bloquer l acte
  urgence     TEXT NOT NULL DEFAULT 'programmable',
  acteur_id   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fligne_facture ON facture_ligne(facture_id);

-- Un paiement ne se modifie pas et ne se supprime pas : il s annule par un
-- autre mouvement. Une caisse dont les lignes s editent ne prouve rien.
CREATE TABLE IF NOT EXISTS paiement (
  id          TEXT PRIMARY KEY,
  facture_id  TEXT NOT NULL REFERENCES facture(id) ON DELETE CASCADE,
  montant     INTEGER NOT NULL,
  -- especes | mobile | carte | tiers-payant
  moyen       TEXT NOT NULL DEFAULT 'especes',
  reference   TEXT,                      -- numero de transaction mobile money
  acteur_id   TEXT,
  recu_le     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_paiement_facture ON paiement(facture_id, recu_le);

-- Article de pharmacie, designe par sa DCI. Le stock, lui, vit dans les
-- lots : un article sans lot n'a pas un stock de zero, il n'a pas de stock
-- du tout, et la nuance compte quand on cherche pourquoi on ne sert pas.
CREATE TABLE IF NOT EXISTS article (
  id              TEXT PRIMARY KEY,
  organization_id TEXT,
  dci             TEXT NOT NULL,         -- denomination commune internationale
  forme           TEXT,                  -- comprime, sirop, injectable...
  dosage          TEXT,
  atc_code        TEXT,
  unite           TEXT NOT NULL DEFAULT 'unite',
  seuil_alerte    INTEGER NOT NULL DEFAULT 0,
  actif           INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_article_org ON article(organization_id, actif);
CREATE INDEX IF NOT EXISTS idx_article_dci ON article(dci);

-- Lot : l'unite reelle du stock, parce que la peremption est portee par le
-- lot et non par l'article. Un stock agrege par article ne sait pas dire ce
-- qui est encore servable.
CREATE TABLE IF NOT EXISTS lot (
  id          TEXT PRIMARY KEY,
  article_id  TEXT NOT NULL REFERENCES article(id) ON DELETE CASCADE,
  numero      TEXT NOT NULL,             -- celui qu on lit sur la boite
  perime_le   TEXT NOT NULL,             -- AAAA-MM-JJ
  quantite    INTEGER NOT NULL DEFAULT 0,
  recu_le     TEXT NOT NULL DEFAULT (datetime('now')),
  -- Un stock negatif est toujours le signe qu on a servi ce qu on n avait
  -- pas. L accepter « pour regulariser plus tard » rend tout l inventaire
  -- inexploitable, donc la base le refuse.
  CHECK (quantite >= 0)
);
CREATE INDEX IF NOT EXISTS idx_lot_article ON lot(article_id, perime_le);

-- Dispensation : ce qui est sorti, pour qui, et ce qui manquait.
CREATE TABLE IF NOT EXISTS dispensation (
  id              TEXT PRIMARY KEY,
  sejour_id       TEXT REFERENCES sejour(id) ON DELETE SET NULL,
  patient_id      TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  prescription_id TEXT REFERENCES prescription(id) ON DELETE SET NULL,
  organization_id TEXT,
  acteur_id       TEXT,
  servi_le        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_disp_patient ON dispensation(patient_id, servi_le DESC);
CREATE INDEX IF NOT EXISTS idx_disp_sejour ON dispensation(sejour_id);

CREATE TABLE IF NOT EXISTS dispensation_ligne (
  id              TEXT PRIMARY KEY,
  dispensation_id TEXT NOT NULL REFERENCES dispensation(id) ON DELETE CASCADE,
  article_id      TEXT NOT NULL REFERENCES article(id),
  lot_id          TEXT REFERENCES lot(id) ON DELETE SET NULL,
  -- Le numero de lot est COPIE ici, et pas seulement reference. Un rappel de
  -- lot se fait des annees plus tard ; la ligne doit encore savoir ce
  -- qu'elle a servi meme si la fiche du lot a disparu.
  numero_lot      TEXT NOT NULL,
  perime_le       TEXT NOT NULL,
  quantite        INTEGER NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dligne_disp ON dispensation_ligne(dispensation_id);
-- Pour retrouver tous les patients servis depuis un lot rappele.
CREATE INDEX IF NOT EXISTS idx_dligne_lot ON dispensation_ligne(numero_lot);

-- Tout mouvement de stock, y compris les entrees et les destructions. Sans
-- ce journal, un ecart d'inventaire ne s'explique jamais.
CREATE TABLE IF NOT EXISTS mouvement_stock (
  id         TEXT PRIMARY KEY,
  lot_id     TEXT REFERENCES lot(id) ON DELETE SET NULL,
  article_id TEXT NOT NULL REFERENCES article(id) ON DELETE CASCADE,
  -- entree | dispensation | destruction | ajustement
  type       TEXT NOT NULL,
  -- Signe : positif pour une entree, negatif pour une sortie.
  quantite   INTEGER NOT NULL,
  motif      TEXT,
  acteur_id  TEXT,
  survenu_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mvtstock_article ON mouvement_stock(article_id, survenu_le);

-- ---------------------------------------------------------- plateau technique

-- Demande d examen : laboratoire ou imagerie. Distincte de service_request,
-- qui porte la prescription telle qu elle sort de la consultation ; celle-ci
-- porte le CIRCUIT — prelevement, resultat, validation — et peut exister
-- sans consultation (une demande faite au lit, un bilan d entree).
CREATE TABLE IF NOT EXISTS demande_examen (
  id              TEXT PRIMARY KEY,
  patient_id      TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  sejour_id       TEXT REFERENCES sejour(id) ON DELETE SET NULL,
  service_request_id TEXT REFERENCES service_request(id) ON DELETE SET NULL,
  organization_id TEXT,
  -- laboratoire | imagerie
  domaine         TEXT NOT NULL DEFAULT 'laboratoire',
  examen          TEXT NOT NULL,
  loinc_code      TEXT,
  -- routine | urgente | vitale
  priorite        TEXT NOT NULL DEFAULT 'routine',
  -- demandee | prelevee | en-cours | resultat-disponible | validee | annulee
  etat            TEXT NOT NULL DEFAULT 'demandee',
  demandee_le     TEXT NOT NULL DEFAULT (datetime('now')),
  prelevee_le     TEXT,
  -- Qui a preleve, et quelle identite a ete annoncee au lit. On conserve
  -- la trace du controle, pas seulement son resultat : apres un echange de
  -- tubes, la question posee est « qui a verifie quoi ».
  preleve_par     TEXT,
  identite_verifiee INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dexamen_patient ON demande_examen(patient_id, demandee_le DESC);
CREATE INDEX IF NOT EXISTS idx_dexamen_etat ON demande_examen(organization_id, domaine, etat);
CREATE INDEX IF NOT EXISTS idx_dexamen_sejour ON demande_examen(sejour_id);

-- Seuils critiques, par etablissement.
--
-- Ils ne sont PAS codes dans l application : un seuil critique depend de la
-- population, de l automate et de ce que le service sait faire en reponse.
-- Un seuil recopie d ailleurs engage un laboratoire qui ne l a jamais
-- valide. Sans ligne ici, un resultat est rendu « non interprete ».
CREATE TABLE IF NOT EXISTS seuil_critique (
  id              TEXT PRIMARY KEY,
  organization_id TEXT,
  examen          TEXT NOT NULL,
  unite           TEXT NOT NULL,
  borne_basse     REAL,
  borne_haute     REAL,
  -- Minutes de stabilite de l echantillon ; NULL si sans objet (imagerie).
  stabilite_min   INTEGER,
  valide_par      TEXT,
  valide_le       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_seuil_examen ON seuil_critique(organization_id, examen);

-- Resultat. APPEND-ONLY : une correction cree une nouvelle ligne et marque
-- la precedente remplacee. Un clinicien a pu prescrire sur la foi de
-- l ancienne valeur, et l effacer efface la raison de ce qu il a fait.
CREATE TABLE IF NOT EXISTS resultat_examen (
  id              TEXT PRIMARY KEY,
  demande_id      TEXT NOT NULL REFERENCES demande_examen(id) ON DELETE CASCADE,
  valeur_num      REAL,
  valeur_texte    TEXT,
  unite           TEXT,
  -- normal | anormal | critique | non-interprete
  interpretation  TEXT NOT NULL DEFAULT 'non-interprete',
  -- Vrai tant qu une valeur critique n a pas ete acquittee nommement.
  a_transmettre   INTEGER NOT NULL DEFAULT 0,
  rendu_par       TEXT,
  rendu_le        TEXT NOT NULL DEFAULT (datetime('now')),
  -- Version remplacee par une correction, et son motif.
  remplace_par    TEXT REFERENCES resultat_examen(id) ON DELETE SET NULL,
  motif_correction TEXT
);
CREATE INDEX IF NOT EXISTS idx_resultat_demande ON resultat_examen(demande_id, rendu_le);
-- Pour la question qui compte : quelles valeurs critiques attendent encore.
CREATE INDEX IF NOT EXISTS idx_resultat_transmettre
  ON resultat_examen(a_transmettre) WHERE a_transmettre = 1;

-- Acquittement d une valeur critique. Le destinataire est NOT NULL : un
-- acquittement anonyme n acquitte rien, et c est exactement ce qu on
-- retrouve dans les dossiers apres un accident.
CREATE TABLE IF NOT EXISTS acquittement_critique (
  id           TEXT PRIMARY KEY,
  resultat_id  TEXT NOT NULL REFERENCES resultat_examen(id) ON DELETE CASCADE,
  transmis_a   TEXT NOT NULL,
  transmis_par TEXT,
  commentaire  TEXT,
  transmis_le  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_acquit_resultat ON acquittement_critique(resultat_id);

-- ------------------------------------------------------------ bloc operatoire

CREATE TABLE IF NOT EXISTS salle_operatoire (
  id              TEXT PRIMARY KEY,
  organization_id TEXT,
  code            TEXT NOT NULL,
  nom             TEXT NOT NULL,
  actif           INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_salle_org ON salle_operatoire(organization_id, actif);

-- Intervention. Les horodatages REELS sont distincts du creneau prevu :
-- mesurer l occupation du bloc sur le programme revient a ne rien mesurer,
-- car le programme ne glisse jamais et la realite si.
CREATE TABLE IF NOT EXISTS intervention (
  id              TEXT PRIMARY KEY,
  patient_id      TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  sejour_id       TEXT REFERENCES sejour(id) ON DELETE SET NULL,
  salle_id        TEXT NOT NULL REFERENCES salle_operatoire(id) ON DELETE CASCADE,
  organization_id TEXT,
  geste           TEXT NOT NULL,
  -- Le geste porte-t-il sur un organe pair ou un membre ?
  lateralise      INTEGER NOT NULL DEFAULT 0,
  -- droite | gauche | bilateral | sans-objet. Jamais NULL : « sans-objet »
  -- est un choix explicite, une absence n en est pas un.
  lateralite      TEXT NOT NULL DEFAULT 'sans-objet',
  debut_prevu     TEXT NOT NULL,
  fin_prevue      TEXT NOT NULL,
  -- programmee | patient-au-bloc | en-cours | terminee | annulee | deprogrammee
  etat            TEXT NOT NULL DEFAULT 'programmee',
  operateur_id    TEXT,
  entree_le       TEXT,
  incise_le       TEXT,
  termine_le      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_interv_salle ON intervention(salle_id, debut_prevu);
CREATE INDEX IF NOT EXISTS idx_interv_patient ON intervention(patient_id, debut_prevu DESC);
CREATE INDEX IF NOT EXISTS idx_interv_etat ON intervention(organization_id, etat, debut_prevu);

-- Points de checklist coches. Une ligne par point : on sait QUI a coche
-- QUOI et QUAND. Une colonne « checklist_faite » ne dit rien le jour ou il
-- faut comprendre ce qui a ete reellement verifie.
CREATE TABLE IF NOT EXISTS checklist_bloc (
  id              TEXT PRIMARY KEY,
  intervention_id TEXT NOT NULL REFERENCES intervention(id) ON DELETE CASCADE,
  -- avant-induction | avant-incision | avant-sortie
  temps           TEXT NOT NULL,
  point           TEXT NOT NULL,
  coche_par       TEXT,
  coche_le        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (intervention_id, point)
);
CREATE INDEX IF NOT EXISTS idx_checklist_interv ON checklist_bloc(intervention_id, temps);

-- Ce que l application a appris des corrections du praticien.
--
-- Une ligne = un couple « la machine a entendu ceci, il fallait cela ». Elle
-- n'est APPLIQUEE qu'a partir de deux consultations distinctes : une seule
-- correction peut etre une faute de frappe, et une lecon retenue a tort
-- abimerait en silence toutes les transcriptions suivantes.
--
-- Rien de nominatif ici : un couple de termes et son contexte immediat. La
-- reference a la consultation sert a compter les occurrences distinctes et
-- disparait avec elle.
CREATE TABLE IF NOT EXISTS apprentissage_correction (
  id              TEXT PRIMARY KEY,
  organization_id TEXT,                  -- une lecon ne franchit pas la structure qui l a produite
  avant           TEXT NOT NULL,         -- forme normalisee, pour le comptage
  apres           TEXT NOT NULL,         -- forme canonique a retenir
  avant_affiche   TEXT NOT NULL,         -- tel qu ecrit, pour la relecture
  contexte        TEXT,
  consultation_id TEXT REFERENCES consultation(id) ON DELETE SET NULL,
  -- 'propose' : vu, pas encore confirme | 'ecarte' : refuse par un relecteur
  etat            TEXT NOT NULL DEFAULT 'propose',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_apprentissage_couple ON apprentissage_correction(organization_id, avant, apres);

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
  -- Fuseau de l etablissement, detecte au premier demarrage depuis la
  -- machine qui sert l application. Il fixe la journee civile : files
  -- d attente, programme operatoire, peremptions. Un etablissement a UNE
  -- journee, et c est celle-ci. Vide tant que rien n a ete detecte.
  fuseau      TEXT,
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

-- Permissions deja amorcees au moins une fois.
--
-- Sans cette table, une mise a jour qui ajoute une permission ne l accorde a
-- personne : l amorcage ne s execute que sur une matrice vide, et un
-- etablissement deja installe decouvrirait le nouveau module par un refus
-- d acces sans explication. Avec elle, on distingue « jamais introduite »,
-- qu il faut amorcer, de « retiree par un administrateur », qu il faut
-- respecter.
CREATE TABLE IF NOT EXISTS permission_amorcee (
  permission TEXT PRIMARY KEY,
  amorcee_le TEXT NOT NULL DEFAULT (datetime('now'))
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
