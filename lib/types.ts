// Types du dossier medical (miroir du schema SQL)

export interface Practitioner {
  id: string;
  given_name: string;
  family_name: string;
  qualification: string | null;
  speciality_code: string | null;
  license_number: string | null;
  email: string | null;
  phone: string | null;
  signature_svg: string | null;
  facility_id: string | null;
  created_at: string;
}

export interface Patient {
  id: string;
  mrn: string | null;
  national_id: string | null;
  insurance_id: string | null;
  insurance_scheme: string | null;
  given_name: string;
  family_name: string;
  birth_date: string | null;
  birth_date_estimated: number;
  gender: 'male' | 'female' | 'other' | 'unknown';
  phone: string | null;
  address_line: string | null;
  city: string | null;
  district: string | null;
  country: string | null;
  preferred_language: string | null;
  blood_group: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  is_pregnant: number;
  renal_impairment: number;
  hepatic_impairment: number;
  emergency_contact: string | null;
  photo_data_url: string | null;
  /** Etablissement proprietaire du dossier. Null pour les dossiers anterieurs au cloisonnement. */
  organization_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Consultation {
  id: string;
  patient_id: string;
  practitioner_id: string | null;
  status: 'in-progress' | 'analyzed' | 'signed' | 'cancelled';
  encounter_class: string | null;
  reason_text: string | null;
  started_at: string;
  ended_at: string | null;
  signed_at: string | null;
  language: string | null;
  consent_recording: number;
  consent_at: string | null;
  location: string | null;
  audio_duration_s: number | null;
  transcript_full: string | null;
  analysis_json: string | null;
  analysis_engine: string | null;
  analysis_at: string | null;
  report_markdown: string | null;
  report_edited: number;
  /** Etablissement de la rencontre. Null pour les consultations anterieures au cloisonnement. */
  organization_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TranscriptSegment {
  id: string;
  consultation_id: string;
  seq: number;
  speaker: 'clinician' | 'patient' | 'companion' | 'unknown';
  text: string;
  start_ms: number | null;
  end_ms: number | null;
  confidence: number | null;
  language: string | null;
  is_final: number;
  /** auto = propose par la detection, manual = fixe par le praticien (fait autorite). */
  speaker_source: string | null;
  speaker_confidence: number | null;
  pitch_hz: number | null;
  /**
   * Phrase reellement prononcee, quand `text` en est une traduction automatique.
   * Null pour un tour non traduit, c'est-a-dire l'immense majorite.
   */
  source_text: string | null;
  source_language: string | null;
  created_at: string;
}

export interface Observation {
  id: string;
  patient_id: string;
  consultation_id: string | null;
  category: string;
  code_loinc: string | null;
  label: string;
  value_num: number | null;
  value_text: string | null;
  unit: string | null;
  ucum: string | null;
  interpretation: string | null;
  effective_at: string;
  source: string;
  confidence: number | null;
}

export interface Problem {
  id: string;
  patient_id: string;
  label: string;
  icd10_code: string | null;
  snomed_code: string | null;
  category: string;
  clinical_status: string;
  onset_date: string | null;
  recorded_at: string;
  source_consultation_id: string | null;
  confidence: number | null;
  verification_status: string;
}

export interface Allergy {
  id: string;
  patient_id: string;
  substance: string;
  atc_code: string | null;
  category: string;
  criticality: 'low' | 'high' | 'unable-to-assess';
  reaction: string | null;
  recorded_at: string;
  source_consultation_id: string | null;
}

export interface MedicationStatement {
  id: string;
  patient_id: string;
  drug_name: string;
  atc_code: string | null;
  dose: string | null;
  status: string;
  started_on: string | null;
  stopped_on: string | null;
  source_consultation_id: string | null;
}

export interface Diagnosis {
  id: string;
  consultation_id: string;
  patient_id: string;
  label: string;
  icd10_code: string | null;
  snomed_code: string | null;
  rank: number;
  certainty: 'suspected' | 'confirmed' | 'differential' | 'ruled-out';
  confidence: number | null;
  rationale: string | null;
  created_at: string;
}

export interface ServiceRequest {
  id: string;
  consultation_id: string;
  patient_id: string;
  label: string;
  loinc_code: string | null;
  category: string;
  priority: string;
  reason: string | null;
  status: string;
  created_at: string;
}

export interface Prescription {
  id: string;
  consultation_id: string;
  patient_id: string;
  practitioner_id: string | null;
  status: 'draft' | 'validated' | 'dispensed' | 'cancelled';
  origin: 'ai-proposed' | 'manual';
  notes: string | null;
  safety_json: string | null;
  validated_by: string | null;
  validated_at: string | null;
  validation_note: string | null;
  cancelled_reason: string | null;
  qr_payload: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrescriptionItem {
  id: string;
  prescription_id: string;
  seq: number;
  drug_name: string;
  brand_name: string | null;
  atc_code: string | null;
  form: string | null;
  strength: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  frequency_per_day: number | null;
  duration_days: number | null;
  quantity: string | null;
  instructions: string | null;
  substitution_allowed: number;
  is_essential_list: number;
  ai_confidence: number | null;
  ai_rationale: string | null;
  edited_by_clinician: number;
  created_at: string;
}

export interface SafetyAlert {
  severity: 'info' | 'moderate' | 'major' | 'contraindicated';
  kind: 'allergy' | 'interaction' | 'pregnancy' | 'renal' | 'hepatic' | 'pediatric' | 'duplicate' | 'dosage' | 'formulary';
  message: string;
  items: string[];
  advice?: string;
}

export interface InteropExport {
  id: string;
  consultation_id: string | null;
  patient_id: string | null;
  format: string;
  target: string | null;
  status: string;
  payload: string | null;
  response: string | null;
  created_at: string;
}
