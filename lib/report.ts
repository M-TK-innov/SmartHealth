import type { ClinicalExtraction } from './ai/schema';
import type { Consultation, Patient, Practitioner } from './types';
import { computeAge, translateGender } from './ai/prompts';

/**
 * Compose le compte rendu de consultation en Markdown (format SOAP).
 * Ce document est la base du Composition FHIR et du PDF imprimable.
 */
export function buildReport(opts: {
  patient: Patient;
  consultation: Consultation;
  practitioner?: Practitioner | null;
  extraction: ClinicalExtraction;
  facility?: string;
}): string {
  const { patient, consultation, practitioner, extraction: e } = opts;
  const facility = opts.facility || process.env.FACILITY_NAME || 'Structure de sante';
  const age = patient.birth_date ? computeAge(patient.birth_date) : null;
  const L: string[] = [];

  L.push(`# Compte rendu de consultation`);
  L.push('');
  L.push(`**${facility}**`);
  L.push('');
  L.push('| | |');
  L.push('|---|---|');
  L.push(`| Patient | ${patient.given_name} ${patient.family_name} |`);
  L.push(`| Identifiant | ${patient.mrn ?? patient.id.slice(0, 8)} |`);
  L.push(
    `| Age / sexe | ${age !== null ? `${age} ans${patient.birth_date_estimated ? ' (estime)' : ''}` : 'non renseigne'} / ${translateGender(patient.gender)} |`,
  );
  L.push(`| Date | ${formatDate(consultation.started_at)} |`);
  L.push(`| Praticien | ${practitioner ? `Dr ${practitioner.given_name} ${practitioner.family_name}` : 'non renseigne'} |`);
  if (practitioner?.qualification) L.push(`| Qualification | ${practitioner.qualification} |`);
  if (patient.is_pregnant) L.push(`| Etat | Grossesse en cours |`);
  L.push('');

  L.push(`## Motif de consultation`);
  L.push('');
  L.push(e.chiefComplaint || 'Non documente.');
  L.push('');

  // ------------------------------------------------------------------ S
  L.push(`## S — Subjectif`);
  L.push('');
  L.push(e.soap.subjective || e.historyOfPresentIllness || 'Non documente.');
  L.push('');

  const present = e.symptoms.filter((s) => !s.negated);
  const absent = e.symptoms.filter((s) => s.negated);
  if (present.length) {
    L.push('**Symptomes presents**');
    L.push('');
    for (const s of present) {
      const bits = [s.duration, s.severity && s.severity !== 'unknown' ? translateSeverity(s.severity) : null, s.bodySite]
        .filter(Boolean)
        .join(', ');
      L.push(`- ${s.label}${bits ? ` — ${bits}` : ''}${s.snomedCode ? ` \`SNOMED ${s.snomedCode}\`` : ''}`);
    }
    L.push('');
  }
  if (absent.length) {
    L.push(`**Signes negatifs** : ${absent.map((s) => s.label.toLowerCase()).join(', ')}.`);
    L.push('');
  }
  if (e.history.length) {
    L.push('**Antecedents**');
    L.push('');
    for (const h of e.history) L.push(`- [${translateHistoryType(h.type)}] ${h.label}${h.icd10Code ? ` \`CIM-10 ${h.icd10Code}\`` : ''}`);
    L.push('');
  }
  if (e.allergies.length) {
    L.push('**Allergies**');
    L.push('');
    for (const a of e.allergies) L.push(`- ${a.substance}${a.reaction ? ` — ${a.reaction}` : ''} (criticite : ${a.criticality ?? 'non evaluee'})`);
    L.push('');
  }
  if (e.currentMedications.length) {
    L.push(`**Traitements en cours** : ${e.currentMedications.map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ''}`).join(', ')}.`);
    L.push('');
  }
  if (e.socialHistory && (e.socialHistory.tobacco || e.socialHistory.alcohol || e.socialHistory.other)) {
    L.push(
      `**Mode de vie** : ${[e.socialHistory.tobacco, e.socialHistory.alcohol, e.socialHistory.other].filter(Boolean).join(' ; ')}.`,
    );
    L.push('');
  }

  // ------------------------------------------------------------------ O
  L.push(`## O — Objectif`);
  L.push('');
  if (e.vitals.length) {
    L.push('| Constante | Valeur | Code LOINC |');
    L.push('|---|---|---|');
    for (const v of e.vitals) {
      L.push(`| ${v.label} | ${v.value ?? v.valueText ?? '—'} ${v.unit ?? ''} | ${v.loincCode ?? '—'} |`);
    }
    L.push('');
  } else {
    L.push('_Aucune constante enoncee pendant la consultation._');
    L.push('');
  }
  if (e.physicalExam) {
    L.push('**Examen physique**');
    L.push('');
    L.push(e.physicalExam);
    L.push('');
  }
  if (e.soap.objective && e.soap.objective !== e.physicalExam) {
    L.push(e.soap.objective);
    L.push('');
  }

  // ------------------------------------------------------------------ A
  L.push(`## A — Evaluation`);
  L.push('');
  if (e.diagnoses.length) {
    for (const d of [...e.diagnoses].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))) {
      L.push(
        `${d.rank ?? '-'}. **${d.label}**${d.icd10Code ? ` \`CIM-10 ${d.icd10Code}\`` : ''} — ${translateCertainty(d.certainty)}${
          d.confidence !== undefined ? ` (confiance IA ${Math.round(d.confidence * 100)} %)` : ''
        }`,
      );
      if (d.rationale) L.push(`   - ${d.rationale}`);
    }
    L.push('');
  } else {
    L.push('_Aucune hypothese diagnostique enregistree._');
    L.push('');
  }
  if (e.soap.assessment) {
    L.push(e.soap.assessment);
    L.push('');
  }
  if (e.publicHealth?.notifiableDisease) {
    L.push(
      `> **Sante publique** — Cas relevant de : ${e.publicHealth.notifiableDisease}${e.publicHealth.programme ? ` (${e.publicHealth.programme})` : ''}. Notification au systeme national de surveillance requise.`,
    );
    L.push('');
  }

  // ------------------------------------------------------------------ P
  L.push(`## P — Plan`);
  L.push('');
  if (e.investigations.length) {
    L.push('**Examens demandes**');
    L.push('');
    for (const i of e.investigations) {
      L.push(`- ${i.label}${i.loincCode ? ` \`LOINC ${i.loincCode}\`` : ''}${i.priority && i.priority !== 'routine' ? ` — **${i.priority.toUpperCase()}**` : ''}${i.reason ? ` (${i.reason})` : ''}`);
    }
    L.push('');
  }
  if (e.proposedPrescription.length) {
    L.push('**Traitement**');
    L.push('');
    for (const p of e.proposedPrescription) {
      L.push(`- ${formatPosology(p)}`);
    }
    L.push('');
  }
  if (e.advice.length) {
    L.push('**Conseils au patient**');
    L.push('');
    for (const a of e.advice) L.push(`- ${a}`);
    L.push('');
  }
  if (e.redFlags.length) {
    L.push('**Consulter en urgence en cas de :**');
    L.push('');
    for (const r of e.redFlags) L.push(`- ${r}`);
    L.push('');
  }
  if (e.followUp?.inDays || e.followUp?.instructions) {
    L.push(`**Suivi** : ${e.followUp.inDays ? `controle dans ${e.followUp.inDays} jours. ` : ''}${e.followUp.instructions ?? ''}`);
    L.push('');
  }
  if (e.referral) {
    L.push(`**Orientation** : ${e.referral.speciality}${e.referral.urgency ? ` (${e.referral.urgency})` : ''}${e.referral.reason ? ` — ${e.referral.reason}` : ''}.`);
    L.push('');
  }
  if (e.soap.plan) {
    L.push(e.soap.plan);
    L.push('');
  }

  // ----------------------------------------------------------- traçabilite
  if (e.uncertainties.length) {
    L.push('---');
    L.push('');
    L.push('## Points a verifier par le medecin');
    L.push('');
    for (const u of e.uncertainties) L.push(`- ${u}`);
    L.push('');
  }

  L.push('---');
  L.push('');
  L.push(
    `_Compte rendu pre-redige par SmartHealth (moteur : ${consultation.analysis_engine ?? 'inconnu'}) a partir de la transcription de la consultation. ${
      consultation.signed_at
        ? `Relu et signe le ${formatDate(consultation.signed_at)}.`
        : '**Brouillon non signe** : sans valeur medico-legale tant que le praticien ne l a pas valide.'
    }_`,
  );

  return L.join('\n');
}

export function formatPosology(p: {
  dci: string;
  strength?: string;
  form?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  frequencyPerDay?: number;
  durationDays?: number;
  instructions?: string;
}): string {
  const parts = [`**${p.dci}**`];
  if (p.strength) parts.push(p.strength);
  if (p.form) parts.push(`(${p.form})`);
  const posology: string[] = [];
  if (p.dose) posology.push(p.dose);
  if (p.frequency) posology.push(p.frequency);
  else if (p.frequencyPerDay) posology.push(`${p.frequencyPerDay} fois par jour`);
  if (p.durationDays) posology.push(`pendant ${p.durationDays} jour${p.durationDays > 1 ? 's' : ''}`);
  if (p.route && p.route !== 'oral') posology.push(`voie ${p.route}`);
  let line = parts.join(' ');
  if (posology.length) line += ` — ${posology.join(', ')}`;
  if (p.instructions) line += `. ${p.instructions}`;
  return line;
}

function translateCertainty(c: string): string {
  return (
    { suspected: 'suspecte', confirmed: 'confirme', differential: 'diagnostic differentiel', 'ruled-out': 'ecarte' }[c] ?? c
  );
}

function translateSeverity(s: string): string {
  return { mild: 'leger', moderate: 'modere', severe: 'severe' }[s] ?? s;
}

function translateHistoryType(t: string): string {
  return (
    { medical: 'medical', surgical: 'chirurgical', family: 'familial', obstetric: 'obstetrical', immunisation: 'vaccinal' }[t] ?? t
  );
}

export function formatDate(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
}
