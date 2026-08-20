import { insert, nowIso, uid } from '@/lib/db';
import {
  getAllergies,
  getConsultation,
  getDiagnoses,
  getMedicationStatements,
  getObservations,
  getPatient,
  getPractitioner,
  getPrescriptionItems,
  getPrescriptions,
  getProblems,
  getServiceRequests,
  parseExtraction,
} from '@/lib/repo';
import { buildConsultationBundle, toTransactionBundle, type BundleInput } from '@/lib/fhir';
import { buildAdtA04, buildOrmO01, buildOruR01, buildRdeO11 } from '@/lib/hl7/v2';
import { buildDhis2Event } from '@/lib/interop/dhis2';
import { buildReport } from '@/lib/report';

export { EXPORT_LABELS, type ExportFormat } from './labels';

import type { ExportFormat } from './labels';

export function gather(consultationId: string): BundleInput {
  const consultation = getConsultation(consultationId);
  if (!consultation) throw new Error('Consultation introuvable');
  const patient = getPatient(consultation.patient_id);
  if (!patient) throw new Error('Patient introuvable');

  const practitioner = consultation.practitioner_id ? getPractitioner(consultation.practitioner_id) : null;
  const prescriptions = getPrescriptions(consultationId).map((p) => ({
    prescription: p,
    items: getPrescriptionItems(p.id),
  }));

  const extraction = parseExtraction(consultation);
  const reportMarkdown =
    consultation.report_markdown ||
    (extraction ? buildReport({ patient, consultation, practitioner, extraction }) : 'Compte rendu non disponible.');

  return {
    patient,
    consultation,
    practitioner,
    observations: getObservations(patient.id, consultationId),
    diagnoses: getDiagnoses(consultationId),
    problems: getProblems(patient.id),
    allergies: getAllergies(patient.id),
    medicationStatements: getMedicationStatements(patient.id),
    serviceRequests: getServiceRequests(consultationId),
    prescriptions,
    reportMarkdown,
  };
}

export interface BuiltExport {
  format: ExportFormat;
  contentType: string;
  filename: string;
  payload: string;
}

export function buildExport(consultationId: string, format: ExportFormat): BuiltExport {
  const data = gather(consultationId);
  const stamp = data.consultation.started_at.slice(0, 10).replace(/-/g, '');
  const base = `${data.patient.mrn ?? data.patient.id.slice(0, 8)}_${stamp}`;

  switch (format) {
    case 'fhir-document': {
      const bundle = buildConsultationBundle(data);
      return {
        format,
        contentType: 'application/fhir+json; charset=utf-8',
        filename: `${base}_fhir-document.json`,
        payload: JSON.stringify(bundle, null, 2),
      };
    }
    case 'fhir-transaction': {
      const bundle = toTransactionBundle(buildConsultationBundle(data));
      return {
        format,
        contentType: 'application/fhir+json; charset=utf-8',
        filename: `${base}_fhir-transaction.json`,
        payload: JSON.stringify(bundle, null, 2),
      };
    }
    case 'hl7-adt':
      return {
        format,
        contentType: 'text/plain; charset=utf-8',
        filename: `${base}_ADT_A04.hl7`,
        payload: buildAdtA04(data.patient, data.consultation, data.practitioner),
      };
    case 'hl7-oru':
      return {
        format,
        contentType: 'text/plain; charset=utf-8',
        filename: `${base}_ORU_R01.hl7`,
        payload: buildOruR01({
          patient: data.patient,
          consultation: data.consultation,
          practitioner: data.practitioner,
          observations: data.observations,
          diagnoses: data.diagnoses,
          reportText: data.reportMarkdown,
        }),
      };
    case 'hl7-rde': {
      const validated = data.prescriptions.find((p) => p.prescription.status === 'validated');
      if (!validated) {
        throw new Error(
          'Aucune ordonnance validee : une prescription doit etre signee par le medecin avant transmission a la pharmacie.',
        );
      }
      return {
        format,
        contentType: 'text/plain; charset=utf-8',
        filename: `${base}_RDE_O11.hl7`,
        payload: buildRdeO11({
          patient: data.patient,
          consultation: data.consultation,
          practitioner: data.practitioner,
          prescription: validated.prescription,
          items: validated.items,
        }),
      };
    }
    case 'hl7-orm':
      if (!data.serviceRequests.length) throw new Error('Aucun examen demande pour cette consultation.');
      return {
        format,
        contentType: 'text/plain; charset=utf-8',
        filename: `${base}_ORM_O01.hl7`,
        payload: buildOrmO01({
          patient: data.patient,
          consultation: data.consultation,
          practitioner: data.practitioner,
          requests: data.serviceRequests,
        }),
      };
    case 'dhis2-event':
      return {
        format,
        contentType: 'application/json; charset=utf-8',
        filename: `${base}_dhis2-event.json`,
        payload: JSON.stringify(
          buildDhis2Event({
            patient: data.patient,
            consultation: data.consultation,
            diagnoses: data.diagnoses,
            observations: data.observations,
          }),
          null,
          2,
        ),
      };
    case 'markdown':
      return {
        format,
        contentType: 'text/markdown; charset=utf-8',
        filename: `${base}_compte-rendu.md`,
        payload: data.reportMarkdown,
      };
    default:
      throw new Error(`Format inconnu : ${format}`);
  }
}

export function logExport(consultationId: string, patientId: string, built: BuiltExport, target?: string, status = 'generated', response?: string) {
  insert('interop_export', {
    id: uid(),
    consultation_id: consultationId,
    patient_id: patientId,
    format: built.format,
    target: target ?? null,
    status,
    payload: built.payload.slice(0, 200000),
    response: response ?? null,
    created_at: nowIso(),
  });
}
