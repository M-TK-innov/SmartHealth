import Link from 'next/link';
import { all } from '@/lib/db';
import { EXPORT_LABELS } from '@/lib/interop/labels';
import { formatDate } from '@/lib/report';

export const dynamic = 'force-dynamic';

const STANDARDS = [
  {
    name: 'HL7 FHIR R4 (4.0.1)',
    role: 'Standard international d echange de donnees de sante.',
    detail:
      'Chaque consultation produit un Bundle de type document, auto-portant : Composition, Patient, Practitioner, Encounter, Condition, Observation, AllergyIntolerance, MedicationStatement, MedicationRequest, ServiceRequest. Importable dans HAPI FHIR, OpenMRS, Google/AWS Healthcare API ou tout serveur conforme.',
    endpoint: '/api/fhir/metadata',
  },
  {
    name: 'HL7 v2.5.1',
    role: 'Interoperabilite avec les systemes hospitaliers deja installes.',
    detail:
      'ADT^A04 pour l enregistrement du patient, ORU^R01 pour les observations et le compte rendu, RDE^O11 pour transmettre une ordonnance validee a la pharmacie, ORM^O01 pour les demandes d examens au laboratoire.',
  },
  {
    name: 'DHIS2',
    role: 'Systeme national d information sanitaire (surveillance epidemiologique).',
    detail:
      'Evenements pseudonymises et rapports agreges mensuels pour les programmes nationaux : paludisme, tuberculose, VIH, nutrition, maladies non transmissibles.',
  },
  {
    name: 'Terminologies',
    role: 'Codage semantique des donnees.',
    detail:
      'CIM-10 (OMS) pour les diagnostics, LOINC pour les constantes et examens, SNOMED CT pour les symptomes, ATC (OMS) pour les medicaments, UCUM pour les unites.',
  },
];

interface ExportRow {
  id: string;
  format: string;
  status: string;
  target: string | null;
  created_at: string;
  given_name: string | null;
  family_name: string | null;
  consultation_id: string | null;
}

export default function InteropPage() {
  const exports = all<ExportRow>(
    `SELECT e.id, e.format, e.status, e.target, e.created_at, e.consultation_id,
            p.given_name, p.family_name
     FROM interop_export e LEFT JOIN patient p ON p.id = e.patient_id
     ORDER BY e.created_at DESC LIMIT 60`,
  );

  const fhirBase = process.env.FHIR_BASE_URL || 'http://localhost:3000/api/fhir';

  return (
    <div className="space-y-5">
      <header className="card-pad">
        <h1 className="text-xl font-bold">Interoperabilite</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-soft">
          Les donnees produites par ParleDocteur ne restent pas prisonnieres de l application. Chaque consultation est
          projetable dans les formats attendus par les systemes de sante africains et internationaux, sans
          retraitement manuel.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {STANDARDS.map((s) => (
          <section key={s.name} className="card-pad">
            <h2 className="text-base font-bold text-brand-dark">{s.name}</h2>
            <p className="mt-0.5 text-sm font-medium">{s.role}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.detail}</p>
            {s.endpoint && (
              <a className="btn-ghost btn-sm mt-3" href={s.endpoint} target="_blank" rel="noreferrer">
                Voir le CapabilityStatement
              </a>
            )}
          </section>
        ))}
      </div>

      <section className="card-pad">
        <h2 className="section-title mb-2">API FHIR de lecture</h2>
        <p className="mb-3 text-sm text-ink-soft">
          Un systeme tiers autorise peut interroger directement le dossier. Exemples :
        </p>
        <ul className="space-y-1 font-mono text-xs">
          {[
            'GET /api/fhir/metadata',
            'GET /api/fhir/Patient?name=kossou',
            'GET /api/fhir/Patient/{id}',
            'GET /api/fhir/Encounter?patient={id}',
            'GET /api/fhir/Condition?patient={id}',
            'GET /api/fhir/Observation?patient={id}',
            'GET /api/fhir/MedicationRequest?patient={id}',
            'GET /api/export/{consultationId}?format=fhir-document',
          ].map((line) => (
            <li key={line} className="rounded bg-paper px-2 py-1">
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-soft">
          Base declaree : <code>{fhirBase}</code>. En production, placez cette API derriere une authentification
          (SMART on FHIR / OAuth2) et n exposez que les ressources autorisees par le consentement du patient.
        </p>
      </section>

      <section className="card">
        <header className="border-b border-line px-5 py-3">
          <h2 className="section-title">Journal des exports ({exports.length})</h2>
        </header>
        {exports.length === 0 ? (
          <p className="p-5 text-sm text-ink-soft">
            Aucun export genere pour le moment. Ouvrez une consultation, onglet « Interoperabilite ».
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-5 py-2">Date</th>
                <th className="px-5 py-2">Patient</th>
                <th className="px-5 py-2">Format</th>
                <th className="px-5 py-2">Destination</th>
                <th className="px-5 py-2">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {exports.map((e) => (
                <tr key={e.id}>
                  <td className="px-5 py-2 text-xs text-ink-soft">{formatDate(e.created_at)}</td>
                  <td className="px-5 py-2">
                    {e.consultation_id ? (
                      <Link href={`/consultations/${e.consultation_id}`} className="hover:underline">
                        {e.given_name} {e.family_name}
                      </Link>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2 text-xs">
                    {EXPORT_LABELS[e.format as keyof typeof EXPORT_LABELS] ?? e.format}
                  </td>
                  <td className="px-5 py-2 text-xs text-ink-soft">{e.target ?? 'telechargement local'}</td>
                  <td className="px-5 py-2">
                    <span
                      className={`chip ${
                        e.status === 'sent'
                          ? 'bg-ok-soft text-ok'
                          : e.status === 'failed'
                            ? 'bg-danger-soft text-danger'
                            : 'bg-paper text-ink-soft'
                      }`}
                    >
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
