/** Libelles des formats d'export - partages entre le serveur et le client. */

export type ExportFormat =
  | 'fhir-document'
  | 'fhir-transaction'
  | 'hl7-adt'
  | 'hl7-oru'
  | 'hl7-rde'
  | 'hl7-orm'
  | 'dhis2-event'
  | 'markdown';

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  'fhir-document': 'FHIR R4 — Bundle document (auto-portant)',
  'fhir-transaction': 'FHIR R4 — Bundle transaction (POST vers un serveur tiers)',
  'hl7-adt': 'HL7 v2.5.1 — ADT^A04 (enregistrement patient)',
  'hl7-oru': 'HL7 v2.5.1 — ORU^R01 (observations et compte rendu)',
  'hl7-rde': 'HL7 v2.5.1 — RDE^O11 (ordonnance vers la pharmacie)',
  'hl7-orm': 'HL7 v2.5.1 — ORM^O01 (demande examens laboratoire)',
  'dhis2-event': 'DHIS2 — evenement de surveillance (pseudonymise)',
  markdown: 'Compte rendu Markdown',
};
