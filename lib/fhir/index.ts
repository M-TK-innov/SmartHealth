/**
 * Projection du dossier SmartHealth vers HL7 FHIR R4.
 *
 * Le Bundle produit est de type "document" : il est auto-portant (Composition
 * en premiere entree) et peut donc etre transmis, archive ou importe dans
 * n'importe quel systeme conforme (HAPI FHIR, OpenMRS, DHIS2 Tracker,
 * Google/AWS Healthcare, INSIA, IPS...) sans dependre de notre serveur.
 */

import { fhirBaseUrl } from '@/lib/net/public-url';
import { networkConfig } from '@/lib/net/store';
import { securiteRest } from './securite';
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

const SYS = {
  icd10: 'http://hl7.org/fhir/sid/icd-10',
  snomed: 'http://snomed.info/sct',
  loinc: 'http://loinc.org',
  atc: 'http://www.whocc.no/atc',
  ucum: 'http://unitsofmeasure.org',
  obsCategory: 'http://terminology.hl7.org/CodeSystem/observation-category',
  condCategory: 'http://terminology.hl7.org/CodeSystem/condition-category',
  condClinical: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  condVerification: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
  actCode: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  interpretation: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
  allergyClinical: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
  allergyVerification: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
  routeOfAdmin: 'http://standardterms.edqm.eu',
  v2Identifier: 'http://terminology.hl7.org/CodeSystem/v2-0203',
} as const;

export type FhirResource = Record<string, unknown> & { resourceType: string; id: string };

function baseUrl(): string {
  return fhirBaseUrl();
}

/** Convertit "2026-08-20 14:32:00" (SQLite) en instant ISO-8601 valide FHIR. */
export function toInstant(sqlDate: string | null | undefined): string {
  if (!sqlDate) return new Date().toISOString();
  if (sqlDate.includes('T')) return new Date(sqlDate).toISOString();
  const d = new Date(sqlDate.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// ------------------------------------------------------------------ Patient

export function fhirPatient(p: Patient): FhirResource {
  const identifiers: Record<string, unknown>[] = [];
  if (p.mrn)
    identifiers.push({
      use: 'usual',
      type: { coding: [{ system: SYS.v2Identifier, code: 'MR', display: 'Medical record number' }] },
      system: `${baseUrl()}/identifier/mrn`,
      value: p.mrn,
    });
  if (p.national_id)
    identifiers.push({
      use: 'official',
      type: { coding: [{ system: SYS.v2Identifier, code: 'NI', display: 'National unique individual identifier' }] },
      system: `urn:oid:2.16.${p.country ?? 'BJ'}`,
      value: p.national_id,
    });
  if (p.insurance_id)
    identifiers.push({
      use: 'secondary',
      type: { coding: [{ system: SYS.v2Identifier, code: 'SB', display: 'Social Beneficiary Identifier' }] },
      system: `${baseUrl()}/identifier/insurance`,
      value: p.insurance_id,
      assigner: p.insurance_scheme ? { display: p.insurance_scheme } : undefined,
    });

  const extensions: Record<string, unknown>[] = [];
  if (p.birth_date_estimated === 1) {
    extensions.push({
      url: 'http://hl7.org/fhir/StructureDefinition/cqf-relativeDateTime',
      valueString: 'birthDate estimee (date de naissance non documentee)',
    });
  }

  return {
    resourceType: 'Patient',
    id: p.id,
    identifier: identifiers,
    active: true,
    name: [{ use: 'official', family: p.family_name, given: [p.given_name] }],
    telecom: p.phone ? [{ system: 'phone', value: p.phone, use: 'mobile' }] : undefined,
    gender: p.gender,
    birthDate: p.birth_date ?? undefined,
    address:
      p.address_line || p.city || p.district
        ? [
            {
              use: 'home',
              line: p.address_line ? [p.address_line] : undefined,
              city: p.city ?? undefined,
              district: p.district ?? undefined,
              country: p.country ?? undefined,
            },
          ]
        : undefined,
    communication: p.preferred_language
      ? [{ language: { coding: [{ system: 'urn:ietf:bcp:47', code: p.preferred_language }] }, preferred: true }]
      : undefined,
    contact: p.emergency_contact ? [{ name: { text: p.emergency_contact } }] : undefined,
    extension: extensions.length ? extensions : undefined,
  };
}

// ------------------------------------------------------------- Practitioner

export function fhirPractitioner(pr: Practitioner): FhirResource {
  return {
    resourceType: 'Practitioner',
    id: pr.id,
    identifier: pr.license_number
      ? [
          {
            system: `${baseUrl()}/identifier/license`,
            value: pr.license_number,
            type: { coding: [{ system: SYS.v2Identifier, code: 'MD', display: 'Medical License number' }] },
          },
        ]
      : undefined,
    active: true,
    name: [{ use: 'official', family: pr.family_name, given: [pr.given_name], prefix: ['Dr'] }],
    telecom: [
      pr.phone ? { system: 'phone', value: pr.phone } : null,
      pr.email ? { system: 'email', value: pr.email } : null,
    ].filter(Boolean),
    qualification: pr.qualification
      ? [{ code: { text: pr.qualification, coding: pr.speciality_code ? [{ system: SYS.snomed, code: pr.speciality_code }] : undefined } }]
      : undefined,
  };
}

// ---------------------------------------------------------------- Encounter

export function fhirEncounter(c: Consultation, patientId: string, practitionerId?: string | null): FhirResource {
  return {
    resourceType: 'Encounter',
    id: c.id,
    status: c.status === 'signed' ? 'finished' : c.status === 'cancelled' ? 'cancelled' : 'in-progress',
    class: { system: SYS.actCode, code: c.encounter_class || 'AMB', display: c.encounter_class === 'EMER' ? 'emergency' : 'ambulatory' },
    subject: { reference: `Patient/${patientId}` },
    participant: practitionerId
      ? [
          {
            type: [
              {
                coding: [
                  { system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'PPRF', display: 'primary performer' },
                ],
              },
            ],
            individual: { reference: `Practitioner/${practitionerId}` },
          },
        ]
      : undefined,
    period: { start: toInstant(c.started_at), end: c.ended_at ? toInstant(c.ended_at) : undefined },
    reasonCode: c.reason_text ? [{ text: c.reason_text }] : undefined,
    location: c.location ? [{ location: { display: c.location } }] : undefined,
  };
}

// -------------------------------------------------------------- Observation

export function fhirObservation(o: Observation, patientId: string): FhirResource {
  return {
    resourceType: 'Observation',
    id: o.id,
    status: 'final',
    category: [
      {
        coding: [
          {
            system: SYS.obsCategory,
            code: o.category || 'vital-signs',
            display: o.category === 'laboratory' ? 'Laboratory' : 'Vital Signs',
          },
        ],
      },
    ],
    code: {
      coding: o.code_loinc ? [{ system: SYS.loinc, code: o.code_loinc, display: o.label }] : undefined,
      text: o.label,
    },
    subject: { reference: `Patient/${patientId}` },
    encounter: o.consultation_id ? { reference: `Encounter/${o.consultation_id}` } : undefined,
    effectiveDateTime: toInstant(o.effective_at),
    valueQuantity:
      o.value_num !== null
        ? { value: o.value_num, unit: o.unit ?? undefined, system: SYS.ucum, code: o.ucum ?? o.unit ?? undefined }
        : undefined,
    valueString: o.value_num === null ? o.value_text ?? undefined : undefined,
    interpretation: o.interpretation
      ? [
          {
            coding: [
              {
                system: SYS.interpretation,
                code: o.interpretation,
                display: { N: 'Normal', H: 'High', L: 'Low' }[o.interpretation] ?? o.interpretation,
              },
            ],
          },
        ]
      : undefined,
    note: o.source === 'ai-extraction' ? [{ text: `Extrait automatiquement de la consultation (confiance ${Math.round((o.confidence ?? 0) * 100)} %), valide par le praticien.` }] : undefined,
  };
}

// ---------------------------------------------------------------- Condition

export function fhirConditionFromDiagnosis(d: Diagnosis): FhirResource {
  return {
    resourceType: 'Condition',
    id: d.id,
    clinicalStatus: { coding: [{ system: SYS.condClinical, code: 'active' }] },
    verificationStatus: {
      coding: [
        {
          system: SYS.condVerification,
          code:
            d.certainty === 'confirmed'
              ? 'confirmed'
              : d.certainty === 'ruled-out'
                ? 'refuted'
                : d.certainty === 'differential'
                  ? 'differential'
                  : 'provisional',
        },
      ],
    },
    category: [{ coding: [{ system: SYS.condCategory, code: 'encounter-diagnosis', display: 'Encounter Diagnosis' }] }],
    code: {
      coding: [
        d.icd10_code ? { system: SYS.icd10, code: d.icd10_code, display: d.label } : null,
        d.snomed_code ? { system: SYS.snomed, code: d.snomed_code, display: d.label } : null,
      ].filter(Boolean),
      text: d.label,
    },
    subject: { reference: `Patient/${d.patient_id}` },
    encounter: { reference: `Encounter/${d.consultation_id}` },
    recordedDate: toInstant(d.created_at),
    note: d.rationale ? [{ text: d.rationale }] : undefined,
  };
}

export function fhirConditionFromProblem(p: Problem): FhirResource {
  return {
    resourceType: 'Condition',
    id: p.id,
    clinicalStatus: { coding: [{ system: SYS.condClinical, code: p.clinical_status || 'active' }] },
    verificationStatus: { coding: [{ system: SYS.condVerification, code: p.verification_status || 'confirmed' }] },
    category: [{ coding: [{ system: SYS.condCategory, code: 'problem-list-item', display: 'Problem List Item' }] }],
    code: {
      coding: p.icd10_code ? [{ system: SYS.icd10, code: p.icd10_code, display: p.label }] : undefined,
      text: p.label,
    },
    subject: { reference: `Patient/${p.patient_id}` },
    onsetDateTime: p.onset_date ?? undefined,
    recordedDate: toInstant(p.recorded_at),
  };
}

// -------------------------------------------------------- AllergyIntolerance

export function fhirAllergy(a: Allergy): FhirResource {
  return {
    resourceType: 'AllergyIntolerance',
    id: a.id,
    clinicalStatus: { coding: [{ system: SYS.allergyClinical, code: 'active' }] },
    verificationStatus: { coding: [{ system: SYS.allergyVerification, code: 'confirmed' }] },
    type: 'allergy',
    category: [a.category || 'medication'],
    criticality: a.criticality === 'high' ? 'high' : a.criticality === 'low' ? 'low' : 'unable-to-assess',
    code: {
      coding: a.atc_code ? [{ system: SYS.atc, code: a.atc_code, display: a.substance }] : undefined,
      text: a.substance,
    },
    patient: { reference: `Patient/${a.patient_id}` },
    recordedDate: toInstant(a.recorded_at),
    reaction: a.reaction ? [{ manifestation: [{ text: a.reaction }] }] : undefined,
  };
}

// ------------------------------------------------------- MedicationStatement

export function fhirMedicationStatement(m: MedicationStatement): FhirResource {
  return {
    resourceType: 'MedicationStatement',
    id: m.id,
    status: m.status || 'active',
    medicationCodeableConcept: {
      coding: m.atc_code ? [{ system: SYS.atc, code: m.atc_code, display: m.drug_name }] : undefined,
      text: m.drug_name,
    },
    subject: { reference: `Patient/${m.patient_id}` },
    effectivePeriod: { start: m.started_on ?? undefined, end: m.stopped_on ?? undefined },
    dosage: m.dose ? [{ text: m.dose }] : undefined,
  };
}

// ------------------------------------------------------------ ServiceRequest

export function fhirServiceRequest(s: ServiceRequest): FhirResource {
  return {
    resourceType: 'ServiceRequest',
    id: s.id,
    status: s.status === 'draft' ? 'draft' : s.status === 'revoked' ? 'revoked' : 'active',
    intent: 'order',
    priority: s.priority || 'routine',
    category: [
      {
        coding: [
          s.category === 'imaging'
            ? { system: SYS.snomed, code: '363679005', display: 'Imaging' }
            : { system: SYS.snomed, code: '108252007', display: 'Laboratory procedure' },
        ],
      },
    ],
    code: { coding: s.loinc_code ? [{ system: SYS.loinc, code: s.loinc_code, display: s.label }] : undefined, text: s.label },
    subject: { reference: `Patient/${s.patient_id}` },
    encounter: { reference: `Encounter/${s.consultation_id}` },
    authoredOn: toInstant(s.created_at),
    reasonCode: s.reason ? [{ text: s.reason }] : undefined,
  };
}

// --------------------------------------------------------- MedicationRequest

/**
 * Une ligne d'ordonnance devient un MedicationRequest.
 * Le statut FHIR reflete strictement le cycle de validation medicale :
 * draft tant que le medecin n'a pas valide, active une fois signee.
 */
export function fhirMedicationRequest(
  item: PrescriptionItem,
  rx: Prescription,
  practitionerId?: string | null,
): FhirResource {
  const timing: Record<string, unknown> = {};
  if (item.frequency_per_day || item.duration_days) {
    timing.repeat = {
      frequency: item.frequency_per_day ?? undefined,
      period: item.frequency_per_day ? 1 : undefined,
      periodUnit: item.frequency_per_day ? 'd' : undefined,
      duration: item.duration_days ?? undefined,
      durationUnit: item.duration_days ? 'd' : undefined,
    };
  }

  return {
    resourceType: 'MedicationRequest',
    id: item.id,
    status:
      rx.status === 'validated' ? 'active' : rx.status === 'cancelled' ? 'cancelled' : rx.status === 'dispensed' ? 'completed' : 'draft',
    intent: rx.status === 'validated' ? 'order' : 'proposal',
    medicationCodeableConcept: {
      coding: item.atc_code ? [{ system: SYS.atc, code: item.atc_code, display: item.drug_name }] : undefined,
      text: [item.drug_name, item.strength, item.form].filter(Boolean).join(' '),
    },
    subject: { reference: `Patient/${rx.patient_id}` },
    encounter: { reference: `Encounter/${rx.consultation_id}` },
    authoredOn: toInstant(rx.validated_at ?? rx.created_at),
    requester: practitionerId ? { reference: `Practitioner/${practitionerId}` } : undefined,
    groupIdentifier: { system: `${baseUrl()}/identifier/prescription`, value: rx.id },
    dosageInstruction: [
      {
        text: [item.dose, item.frequency, item.duration_days ? `pendant ${item.duration_days} jours` : null, item.instructions]
          .filter(Boolean)
          .join(', '),
        patientInstruction: item.instructions ?? undefined,
        timing: Object.keys(timing).length ? timing : undefined,
        route: item.route ? { text: item.route } : undefined,
        doseAndRate: item.dose ? [{ doseQuantity: { unit: item.dose } }] : undefined,
      },
    ],
    dispenseRequest: {
      quantity: item.quantity ? { value: parseFloat(item.quantity) || undefined, unit: item.form ?? undefined } : undefined,
      expectedSupplyDuration: item.duration_days
        ? { value: item.duration_days, unit: 'jours', system: SYS.ucum, code: 'd' }
        : undefined,
    },
    substitution: { allowedBoolean: item.substitution_allowed === 1 },
    note: [
      rx.status !== 'validated'
        ? { text: 'PROJET NON VALIDE : proposition generee par IA, sans valeur de prescription tant que le medecin ne l a pas signee.' }
        : null,
      item.ai_rationale ? { text: `Justification : ${item.ai_rationale}` } : null,
    ].filter(Boolean),
  };
}

// ----------------------------------------------------------- Composition

export function fhirComposition(opts: {
  consultation: Consultation;
  patient: Patient;
  practitioner?: Practitioner | null;
  reportMarkdown: string;
  sectionRefs: { diagnoses: string[]; observations: string[]; medications: string[]; services: string[] };
}): FhirResource {
  const { consultation: c, patient, practitioner } = opts;
  return {
    resourceType: 'Composition',
    id: `composition-${c.id}`,
    status: c.status === 'signed' ? 'final' : 'preliminary',
    type: { coding: [{ system: SYS.loinc, code: '11488-4', display: 'Consult note' }], text: 'Compte rendu de consultation' },
    category: [{ coding: [{ system: SYS.loinc, code: '11369-6', display: 'History of Immunization' }], text: 'Soins primaires' }],
    subject: { reference: `Patient/${patient.id}` },
    encounter: { reference: `Encounter/${c.id}` },
    date: toInstant(c.signed_at ?? c.started_at),
    author: practitioner ? [{ reference: `Practitioner/${practitioner.id}` }] : [{ display: 'SmartHealth' }],
    title: `Consultation du ${new Date(toInstant(c.started_at)).toLocaleDateString('fr-FR')} - ${patient.given_name} ${patient.family_name}`,
    attester: c.signed_at && practitioner
      ? [{ mode: 'legal', time: toInstant(c.signed_at), party: { reference: `Practitioner/${practitioner.id}` } }]
      : undefined,
    custodian: { display: process.env.FACILITY_NAME || 'SmartHealth' },
    section: [
      {
        title: 'Compte rendu complet (SOAP)',
        code: { coding: [{ system: SYS.loinc, code: '11488-4', display: 'Consult note' }] },
        text: { status: 'generated', div: xhtml(opts.reportMarkdown) },
      },
      {
        title: 'Diagnostics',
        code: { coding: [{ system: SYS.loinc, code: '29308-4', display: 'Diagnosis' }] },
        entry: opts.sectionRefs.diagnoses.map((id) => ({ reference: `Condition/${id}` })),
      },
      {
        title: 'Constantes et resultats',
        code: { coding: [{ system: SYS.loinc, code: '8716-3', display: 'Vital signs' }] },
        entry: opts.sectionRefs.observations.map((id) => ({ reference: `Observation/${id}` })),
      },
      {
        title: 'Ordonnance',
        code: { coding: [{ system: SYS.loinc, code: '57833-6', display: 'Prescription for medication' }] },
        entry: opts.sectionRefs.medications.map((id) => ({ reference: `MedicationRequest/${id}` })),
      },
      {
        title: 'Examens demandes',
        code: { coding: [{ system: SYS.loinc, code: '18717-9', display: 'Laboratory studies' }] },
        entry: opts.sectionRefs.services.map((id) => ({ reference: `ServiceRequest/${id}` })),
      },
    ],
  };
}

/** Echappe le Markdown vers un div XHTML valide pour la narrative FHIR. */
function xhtml(markdown: string): string {
  const escaped = (markdown || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<div xmlns="http://www.w3.org/1999/xhtml"><pre>${escaped}</pre></div>`;
}

// -------------------------------------------------------------------- Bundle

export interface BundleInput {
  patient: Patient;
  consultation: Consultation;
  practitioner?: Practitioner | null;
  observations: Observation[];
  diagnoses: Diagnosis[];
  problems: Problem[];
  allergies: Allergy[];
  medicationStatements: MedicationStatement[];
  serviceRequests: ServiceRequest[];
  prescriptions: { prescription: Prescription; items: PrescriptionItem[] }[];
  reportMarkdown: string;
}

/** Bundle FHIR R4 de type "document", auto-portant et transmissible tel quel. */
export function buildConsultationBundle(input: BundleInput): Record<string, unknown> {
  const resources: FhirResource[] = [];

  const medicationRequests = input.prescriptions.flatMap(({ prescription, items }) =>
    items.map((i) => fhirMedicationRequest(i, prescription, prescription.practitioner_id)),
  );
  const observations = input.observations.map((o) => fhirObservation(o, input.patient.id));
  const conditions = [
    ...input.diagnoses.map(fhirConditionFromDiagnosis),
    ...input.problems.map(fhirConditionFromProblem),
  ];
  const services = input.serviceRequests.map(fhirServiceRequest);

  const composition = fhirComposition({
    consultation: input.consultation,
    patient: input.patient,
    practitioner: input.practitioner,
    reportMarkdown: input.reportMarkdown,
    sectionRefs: {
      diagnoses: input.diagnoses.map((d) => d.id),
      observations: input.observations.map((o) => o.id),
      medications: medicationRequests.map((m) => m.id),
      services: input.serviceRequests.map((s) => s.id),
    },
  });

  resources.push(composition);
  resources.push(fhirPatient(input.patient));
  if (input.practitioner) resources.push(fhirPractitioner(input.practitioner));
  resources.push(fhirEncounter(input.consultation, input.patient.id, input.practitioner?.id));
  resources.push(...conditions, ...observations, ...services, ...medicationRequests);
  resources.push(...input.allergies.map(fhirAllergy));
  resources.push(...input.medicationStatements.map(fhirMedicationStatement));

  return {
    resourceType: 'Bundle',
    id: `bundle-${input.consultation.id}`,
    meta: {
      lastUpdated: new Date().toISOString(),
      profile: ['http://hl7.org/fhir/StructureDefinition/Bundle'],
      tag: [{ system: `${baseUrl()}/source`, code: 'smarthealth', display: 'SmartHealth' }],
    },
    identifier: { system: `${baseUrl()}/identifier/bundle`, value: input.consultation.id },
    type: 'document',
    timestamp: new Date().toISOString(),
    entry: resources.map((r) => ({ fullUrl: `${baseUrl()}/${r.resourceType}/${r.id}`, resource: r })),
  };
}

/** Bundle "transaction" : POST direct vers un serveur FHIR tiers (OpenMRS, HAPI...). */
export function toTransactionBundle(documentBundle: Record<string, unknown>): Record<string, unknown> {
  const entries = (documentBundle.entry as { resource: FhirResource }[]) ?? [];
  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: entries
      .filter((e) => e.resource.resourceType !== 'Composition')
      .map((e) => ({
        fullUrl: `urn:uuid:${e.resource.id}`,
        resource: e.resource,
        request: { method: 'PUT', url: `${e.resource.resourceType}/${e.resource.id}` },
      })),
  };
}

export function capabilityStatement(): Record<string, unknown> {
  const resourceTypes = [
    'Patient',
    'Practitioner',
    'Encounter',
    'Condition',
    'Observation',
    'AllergyIntolerance',
    'MedicationStatement',
    'MedicationRequest',
    'ServiceRequest',
    'Composition',
  ];
  const securite = securiteRest(networkConfig().fhir_access);
  return {
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: new Date().toISOString(),
    publisher: process.env.FACILITY_NAME || 'SmartHealth',
    kind: 'instance',
    software: { name: 'SmartHealth', version: '0.1.0' },
    implementation: { description: 'Serveur FHIR de SmartHealth (lecture seule)', url: baseUrl() },
    fhirVersion: '4.0.1',
    format: ['application/fhir+json', 'json'],
    rest: [
      {
        mode: 'server',
        documentation:
          'API de lecture destinee a l interoperabilite avec les systemes d information hospitaliers et les registres nationaux.',
        // Le dossier medical n'est pas servi a un appelant anonyme : le dire ici
        // est la seule facon qu'a un systeme tiers de l'apprendre avant le 401.
        ...(securite ? { security: securite } : {}),
        resource: resourceTypes.map((type) => ({
          type,
          interaction: [{ code: 'read' }, { code: 'search-type' }],
          searchParam: [{ name: 'patient', type: 'reference' }, { name: '_id', type: 'token' }],
        })),
        operation: [
          { name: 'document', definition: 'http://hl7.org/fhir/OperationDefinition/Composition-document' },
          { name: 'everything', definition: 'http://hl7.org/fhir/OperationDefinition/Patient-everything' },
        ],
      },
    ],
  };
}
