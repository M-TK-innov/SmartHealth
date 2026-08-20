import { all, get } from '@/lib/db';
import type {
  Allergy,
  Consultation,
  Diagnosis,
  MedicationStatement,
  Observation,
  Patient,
  Practitioner,
  Prescription,
  PrescriptionItem,
  Problem,
  ServiceRequest,
} from '@/lib/types';
import {
  fhirAllergy,
  fhirConditionFromDiagnosis,
  fhirConditionFromProblem,
  fhirEncounter,
  fhirMedicationRequest,
  fhirMedicationStatement,
  fhirObservation,
  fhirPatient,
  fhirPractitioner,
  fhirServiceRequest,
  type FhirResource,
} from './index';

export const SUPPORTED = [
  'Patient',
  'Practitioner',
  'Encounter',
  'Condition',
  'Observation',
  'AllergyIntolerance',
  'MedicationStatement',
  'MedicationRequest',
  'ServiceRequest',
] as const;

export type SupportedType = (typeof SUPPORTED)[number];

export function isSupported(t: string): t is SupportedType {
  return (SUPPORTED as readonly string[]).includes(t);
}

/** Lecture unitaire : GET [base]/{type}/{id} */
export function readResource(type: SupportedType, id: string): FhirResource | null {
  switch (type) {
    case 'Patient': {
      const r = get<Patient>('SELECT * FROM patient WHERE id = ? OR mrn = ?', [id, id]);
      return r ? fhirPatient(r) : null;
    }
    case 'Practitioner': {
      const r = get<Practitioner>('SELECT * FROM practitioner WHERE id = ?', [id]);
      return r ? fhirPractitioner(r) : null;
    }
    case 'Encounter': {
      const r = get<Consultation>('SELECT * FROM consultation WHERE id = ?', [id]);
      return r ? fhirEncounter(r, r.patient_id, r.practitioner_id) : null;
    }
    case 'Condition': {
      const d = get<Diagnosis>('SELECT * FROM diagnosis WHERE id = ?', [id]);
      if (d) return fhirConditionFromDiagnosis(d);
      const p = get<Problem>('SELECT * FROM problem WHERE id = ?', [id]);
      return p ? fhirConditionFromProblem(p) : null;
    }
    case 'Observation': {
      const r = get<Observation>('SELECT * FROM observation WHERE id = ?', [id]);
      return r ? fhirObservation(r, r.patient_id) : null;
    }
    case 'AllergyIntolerance': {
      const r = get<Allergy>('SELECT * FROM allergy WHERE id = ?', [id]);
      return r ? fhirAllergy(r) : null;
    }
    case 'MedicationStatement': {
      const r = get<MedicationStatement>('SELECT * FROM medication_statement WHERE id = ?', [id]);
      return r ? fhirMedicationStatement(r) : null;
    }
    case 'MedicationRequest': {
      const item = get<PrescriptionItem>('SELECT * FROM prescription_item WHERE id = ?', [id]);
      if (!item) return null;
      const rx = get<Prescription>('SELECT * FROM prescription WHERE id = ?', [item.prescription_id]);
      return rx ? fhirMedicationRequest(item, rx, rx.practitioner_id) : null;
    }
    case 'ServiceRequest': {
      const r = get<ServiceRequest>('SELECT * FROM service_request WHERE id = ?', [id]);
      return r ? fhirServiceRequest(r) : null;
    }
  }
}

/** Recherche : GET [base]/{type}?patient={id} */
export function searchResource(type: SupportedType, params: URLSearchParams): FhirResource[] {
  const patient = params.get('patient') || params.get('subject')?.replace('Patient/', '');
  const encounter = params.get('encounter')?.replace('Encounter/', '');
  const id = params.get('_id');

  if (id) {
    const one = readResource(type, id);
    return one ? [one] : [];
  }

  switch (type) {
    case 'Patient': {
      const name = params.get('name');
      const rows = name
        ? all<Patient>('SELECT * FROM patient WHERE lower(family_name) LIKE ? OR lower(given_name) LIKE ? LIMIT 100', [
            `%${name.toLowerCase()}%`,
            `%${name.toLowerCase()}%`,
          ])
        : all<Patient>('SELECT * FROM patient ORDER BY updated_at DESC LIMIT 100');
      return rows.map(fhirPatient);
    }
    case 'Practitioner':
      return all<Practitioner>('SELECT * FROM practitioner LIMIT 100').map(fhirPractitioner);
    case 'Encounter': {
      const rows = patient
        ? all<Consultation>('SELECT * FROM consultation WHERE patient_id = ? ORDER BY started_at DESC', [patient])
        : all<Consultation>('SELECT * FROM consultation ORDER BY started_at DESC LIMIT 100');
      return rows.map((c) => fhirEncounter(c, c.patient_id, c.practitioner_id));
    }
    case 'Condition': {
      if (!patient) return [];
      return [
        ...all<Diagnosis>('SELECT * FROM diagnosis WHERE patient_id = ?', [patient]).map(fhirConditionFromDiagnosis),
        ...all<Problem>('SELECT * FROM problem WHERE patient_id = ?', [patient]).map(fhirConditionFromProblem),
      ];
    }
    case 'Observation': {
      if (encounter) {
        return all<Observation>('SELECT * FROM observation WHERE consultation_id = ?', [encounter]).map((o) =>
          fhirObservation(o, o.patient_id),
        );
      }
      if (!patient) return [];
      return all<Observation>('SELECT * FROM observation WHERE patient_id = ? ORDER BY effective_at DESC LIMIT 500', [
        patient,
      ]).map((o) => fhirObservation(o, o.patient_id));
    }
    case 'AllergyIntolerance':
      return patient ? all<Allergy>('SELECT * FROM allergy WHERE patient_id = ?', [patient]).map(fhirAllergy) : [];
    case 'MedicationStatement':
      return patient
        ? all<MedicationStatement>('SELECT * FROM medication_statement WHERE patient_id = ?', [patient]).map(
            fhirMedicationStatement,
          )
        : [];
    case 'MedicationRequest': {
      if (!patient) return [];
      const prescriptions = all<Prescription>('SELECT * FROM prescription WHERE patient_id = ?', [patient]);
      return prescriptions.flatMap((rx) =>
        all<PrescriptionItem>('SELECT * FROM prescription_item WHERE prescription_id = ? ORDER BY seq', [rx.id]).map((i) =>
          fhirMedicationRequest(i, rx, rx.practitioner_id),
        ),
      );
    }
    case 'ServiceRequest':
      return patient
        ? all<ServiceRequest>('SELECT * FROM service_request WHERE patient_id = ?', [patient]).map(fhirServiceRequest)
        : [];
  }
}

export function searchsetBundle(resources: FhirResource[], baseUrl: string): Record<string, unknown> {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: resources.length,
    timestamp: new Date().toISOString(),
    entry: resources.map((r) => ({ fullUrl: `${baseUrl}/${r.resourceType}/${r.id}`, resource: r })),
  };
}

export function operationOutcome(severity: 'error' | 'warning', code: string, diagnostics: string) {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity, code, diagnostics }],
  };
}
