import type { Allergy, Patient, SafetyAlert } from './types';
import { findDrug, findInteraction, DrugDef } from './terminology/formulary';
import { computeAge } from './ai/prompts';

export interface CandidateItem {
  drug_name: string;
  atc_code?: string | null;
  strength?: string | null;
  frequency_per_day?: number | null;
  duration_days?: number | null;
  route?: string | null;
}

export interface SafetyContext {
  patient: Patient;
  allergies: Allergy[];
  currentMedications: { drug_name: string; atc_code?: string | null }[];
}

/**
 * Controle de securite d'un projet d'ordonnance.
 *
 * Aide a la decision : signale, n'interdit pas. Le medecin reste seul juge et
 * peut valider malgre une alerte (la decision est alors tracee dans le journal).
 */
export function checkPrescription(items: CandidateItem[], ctx: SafetyContext): SafetyAlert[] {
  const alerts: SafetyAlert[] = [];
  const resolved = items.map((i) => ({ item: i, def: findDrug(i.drug_name), atc: i.atc_code || findDrug(i.drug_name)?.atc }));

  const ageYears = ctx.patient.birth_date ? computeAge(ctx.patient.birth_date) : null;
  const ageMonths = ageYears !== null ? ageYears * 12 : null;
  const pregnant = ctx.patient.is_pregnant === 1;

  // ---------------------------------------------------------------- allergies
  for (const { item, def, atc } of resolved) {
    for (const allergy of ctx.allergies) {
      const allergyDef = findDrug(allergy.substance);
      const sameDci = allergyDef && def && allergyDef.dci === def.dci;
      // meme classe ATC au niveau 4 caracteres (ex: J01C penicillines)
      const sameClass = allergyDef?.atc && atc && allergyDef.atc.slice(0, 4) === atc.slice(0, 4);
      const textual = normalize(item.drug_name).includes(normalize(allergy.substance));

      if (sameDci || textual) {
        alerts.push({
          severity: 'contraindicated',
          kind: 'allergy',
          message: `Allergie documentee a ${allergy.substance}${allergy.reaction ? ` (${allergy.reaction})` : ''}. ${item.drug_name} est le meme principe actif.`,
          items: [item.drug_name],
          advice: 'Ne pas prescrire. Choisir une alternative therapeutique.',
        });
      } else if (sameClass) {
        alerts.push({
          severity: 'major',
          kind: 'allergy',
          message: `Allergie a ${allergy.substance} : ${item.drug_name} appartient a la meme classe pharmacologique (${atc?.slice(0, 4)}). Risque d allergie croisee.`,
          items: [item.drug_name],
          advice: 'Verifier la nature de la reaction avant de prescrire.',
        });
      }
    }
  }

  // ------------------------------------------------------------- interactions
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const a = resolved[i];
      const b = resolved[j];
      if (!a.atc || !b.atc) continue;
      const inter = findInteraction(a.atc, b.atc);
      if (inter) {
        alerts.push({
          severity: inter.severity === 'minor' ? 'info' : inter.severity === 'moderate' ? 'moderate' : inter.severity === 'major' ? 'major' : 'contraindicated',
          kind: 'interaction',
          message: `${a.item.drug_name} + ${b.item.drug_name} : ${inter.effect}`,
          items: [a.item.drug_name, b.item.drug_name],
          advice: inter.advice,
        });
      }
    }
  }

  // interactions avec le traitement de fond deja au dossier
  for (const { item, atc } of resolved) {
    if (!atc) continue;
    for (const current of ctx.currentMedications) {
      const currentAtc = current.atc_code || findDrug(current.drug_name)?.atc;
      if (!currentAtc) continue;
      const inter = findInteraction(atc, currentAtc);
      if (inter) {
        alerts.push({
          severity: inter.severity === 'minor' ? 'info' : inter.severity === 'moderate' ? 'moderate' : 'major',
          kind: 'interaction',
          message: `${item.drug_name} interagit avec le traitement de fond ${current.drug_name} : ${inter.effect}`,
          items: [item.drug_name, current.drug_name],
          advice: inter.advice,
        });
      }
    }
  }

  // ---------------------------------------------------------------- doublons
  const seenClass = new Map<string, string[]>();
  for (const { item, def, atc } of resolved) {
    const key = def?.className || atc?.slice(0, 4);
    if (!key) continue;
    const list = seenClass.get(key) ?? [];
    list.push(item.drug_name);
    seenClass.set(key, list);
  }
  for (const [className, names] of seenClass) {
    if (names.length > 1) {
      alerts.push({
        severity: 'moderate',
        kind: 'duplicate',
        message: `Redondance therapeutique : ${names.join(' + ')} appartiennent a la meme classe (${className}).`,
        items: names,
        advice: 'Verifier que le cumul est intentionnel.',
      });
    }
  }

  // --------------------------------------------------- terrain : grossesse
  if (pregnant) {
    for (const { item, def } of resolved) {
      if (!def) continue;
      if (def.pregnancy === 'contraindicated') {
        alerts.push({
          severity: 'contraindicated',
          kind: 'pregnancy',
          message: `${item.drug_name} est contre-indique pendant la grossesse.${def.notes ? ` ${def.notes}` : ''}`,
          items: [item.drug_name],
          advice: 'Choisir une alternative compatible avec la grossesse.',
        });
      } else if (def.pregnancy === 'caution') {
        alerts.push({
          severity: 'moderate',
          kind: 'pregnancy',
          message: `${item.drug_name} : prudence pendant la grossesse.${def.notes ? ` ${def.notes}` : ''}`,
          items: [item.drug_name],
          advice: 'Evaluer le rapport benefice/risque et le terme de la grossesse.',
        });
      }
    }
  } else if (ctx.patient.gender === 'female' && ageYears !== null && ageYears >= 12 && ageYears <= 50) {
    const risky = resolved.filter((r) => r.def?.pregnancy === 'contraindicated').map((r) => r.item.drug_name);
    if (risky.length) {
      alerts.push({
        severity: 'info',
        kind: 'pregnancy',
        message: `Femme en age de procreer : statut de grossesse non renseigne alors que ${risky.join(', ')} est teratogene ou contre-indique.`,
        items: risky,
        advice: 'Verifier l absence de grossesse avant de valider.',
      });
    }
  }

  // ------------------------------------------------------- terrain : organes
  for (const { item, def } of resolved) {
    if (!def) continue;
    if (ctx.patient.renal_impairment === 1 && def.renalCaution) {
      alerts.push({
        severity: 'major',
        kind: 'renal',
        message: `Insuffisance renale connue : ${item.drug_name} necessite une adaptation posologique ou est a eviter.`,
        items: [item.drug_name],
        advice: 'Adapter la dose au debit de filtration glomerulaire.',
      });
    }
    if (ctx.patient.hepatic_impairment === 1 && def.hepaticCaution) {
      alerts.push({
        severity: 'major',
        kind: 'hepatic',
        message: `Insuffisance hepatique connue : ${item.drug_name} est hepatotoxique ou a metabolisme hepatique.`,
        items: [item.drug_name],
        advice: 'Reduire la dose et surveiller les transaminases.',
      });
    }
    if (def.pediatricMinAgeMonths !== undefined && ageMonths !== null && ageMonths < def.pediatricMinAgeMonths) {
      alerts.push({
        severity: 'contraindicated',
        kind: 'pediatric',
        message: `${item.drug_name} n est pas indique avant ${formatAgeLimit(def.pediatricMinAgeMonths)} (patient : ${ageYears} ans).`,
        items: [item.drug_name],
        advice: def.notes || 'Choisir une forme et une molecule adaptees a l age.',
      });
    }
  }

  // --------------------------------------------------------------- posologie
  for (const { item, def } of resolved) {
    if (!item.duration_days) {
      alerts.push({
        severity: 'info',
        kind: 'dosage',
        message: `Duree de traitement non precisee pour ${item.drug_name}.`,
        items: [item.drug_name],
        advice: 'Renseigner une duree : la pharmacie en a besoin pour delivrer.',
      });
    }
    if (!item.frequency_per_day) {
      alerts.push({
        severity: 'info',
        kind: 'dosage',
        message: `Frequence d administration non precisee pour ${item.drug_name}.`,
        items: [item.drug_name],
      });
    }
    // Paracetamol : garde-fou sur la dose journaliere adulte
    if (def?.atc === 'N02BE01' && item.frequency_per_day && item.strength) {
      const mg = parseStrengthMg(item.strength);
      if (mg && mg * item.frequency_per_day > 4000 && (ageYears === null || ageYears >= 15)) {
        alerts.push({
          severity: 'major',
          kind: 'dosage',
          message: `Paracetamol : ${mg * item.frequency_per_day} mg/j depasse la dose maximale adulte de 4 g/j.`,
          items: [item.drug_name],
          advice: 'Reduire la dose unitaire ou la frequence.',
        });
      }
    }
    if (ageYears !== null && ageYears < 12 && ctx.patient.weight_kg === null) {
      alerts.push({
        severity: 'moderate',
        kind: 'pediatric',
        message: 'Patient pediatrique sans poids enregistre : la posologie ne peut pas etre verifiee en mg/kg.',
        items: [item.drug_name],
        advice: 'Peser l enfant avant de valider l ordonnance.',
      });
    }
  }

  // -------------------------------------------------------------- formulaire
  for (const { item, def } of resolved) {
    if (!def) {
      alerts.push({
        severity: 'info',
        kind: 'formulary',
        message: `${item.drug_name} est absent du formulaire embarque : DCI, dosage et interactions n ont pas pu etre verifies.`,
        items: [item.drug_name],
        advice: 'Verifier manuellement la denomination et la posologie.',
      });
    } else if (!def.essential) {
      alerts.push({
        severity: 'info',
        kind: 'formulary',
        message: `${def.dci} ne figure pas sur la liste des medicaments essentiels : disponibilite et cout a verifier.`,
        items: [item.drug_name],
      });
    }
  }

  return dedupe(alerts);
}

export function highestSeverity(alerts: SafetyAlert[]): SafetyAlert['severity'] | null {
  const order: SafetyAlert['severity'][] = ['info', 'moderate', 'major', 'contraindicated'];
  let best: SafetyAlert['severity'] | null = null;
  for (const a of alerts) if (!best || order.indexOf(a.severity) > order.indexOf(best)) best = a.severity;
  return best;
}

/** Alertes qui exigent une justification ecrite du medecin pour passer outre. */
export function blockingAlerts(alerts: SafetyAlert[]): SafetyAlert[] {
  return alerts.filter((a) => a.severity === 'contraindicated');
}

// ------------------------------------------------------------------ helpers

function dedupe(alerts: SafetyAlert[]): SafetyAlert[] {
  const seen = new Set<string>();
  return alerts.filter((a) => {
    const k = `${a.kind}|${a.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function normalize(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function parseStrengthMg(strength: string): number | null {
  const m = strength.match(/(\d+(?:[.,]\d+)?)\s*(mg|g)/i);
  if (!m) return null;
  const v = Number(m[1].replace(',', '.'));
  return m[2].toLowerCase() === 'g' ? v * 1000 : v;
}

function formatAgeLimit(months: number): string {
  if (months < 24) return `${months} mois`;
  return `${Math.round(months / 12)} ans`;
}

export type { DrugDef };
