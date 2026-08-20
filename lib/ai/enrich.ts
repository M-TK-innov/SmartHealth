import { ClinicalExtraction } from './schema';
import { findVital, interpretVital, suggestIcd10, suggestLab, snomedForSymptom, VITALS } from '@/lib/terminology';
import { findDrug } from '@/lib/terminology/formulary';

/**
 * Post-traitement deterministe applique a TOUTE extraction (IA ou locale).
 *
 * Le modele peut oublier un code ou laisser une unite en clair. Ici on complete
 * ce qui est calculable sans ambiguite a partir des terminologies embarquees.
 * On ne modifie jamais une valeur clinique : on ne fait qu'ajouter du codage.
 */
export function enrichExtraction(e: ClinicalExtraction): ClinicalExtraction {
  // --- constantes : LOINC + unite normalisee
  e.vitals = e.vitals.map((v) => {
    const def = findVital(v.label) ?? VITALS.find((d) => d.loinc === v.loincCode);
    if (!def) return v;
    return {
      ...v,
      label: def.label,
      loincCode: v.loincCode || def.loinc,
      unit: v.unit || def.unit,
    };
  });

  // Deduire l'IMC si poids et taille sont presents et l'IMC absent
  const weight = e.vitals.find((v) => v.loincCode === '29463-7')?.value;
  const height = e.vitals.find((v) => v.loincCode === '8302-2')?.value;
  if (weight && height && height > 50 && !e.vitals.some((v) => v.loincCode === '39156-5')) {
    const bmi = Math.round((weight / Math.pow(height / 100, 2)) * 10) / 10;
    e.vitals.push({
      label: 'Indice de masse corporelle',
      loincCode: '39156-5',
      value: bmi,
      unit: 'kg/m2',
      quote: 'Calcule a partir du poids et de la taille',
      confidence: 0.99,
    });
  }

  // --- symptomes : SNOMED
  e.symptoms = e.symptoms.map((s) => ({ ...s, snomedCode: s.snomedCode || snomedForSymptom(s.label) }));

  // --- diagnostics : CIM-10
  e.diagnoses = e.diagnoses.map((d) => {
    if (d.icd10Code) return d;
    const hit = suggestIcd10(d.label);
    return hit ? { ...d, icd10Code: hit.code } : d;
  });

  // --- examens : LOINC
  e.investigations = e.investigations.map((i) => {
    if (i.loincCode) return i;
    const hit = suggestLab(i.label);
    return hit ? { ...i, loincCode: hit.loinc, category: i.category ?? hit.category } : i;
  });

  // --- medicaments : DCI normalisee + ATC + forme par defaut
  e.proposedPrescription = e.proposedPrescription.map((p) => {
    const drug = findDrug(p.dci);
    if (!drug) return p;
    return {
      ...p,
      dci: drug.dci,
      atcCode: p.atcCode || drug.atc,
      form: p.form || drug.forms[0],
      strength: p.strength || drug.strengths[0],
      route: p.route || (drug.forms[0] === 'injectable' ? 'intramusculaire' : 'oral'),
    };
  });

  e.currentMedications = e.currentMedications.map((m) => {
    const drug = findDrug(m.name);
    return drug ? { ...m, name: drug.dci, atcCode: m.atcCode || drug.atc } : m;
  });

  e.allergies = e.allergies.map((a) => {
    const drug = findDrug(a.substance);
    return drug ? { ...a, substance: drug.dci } : a;
  });

  // --- sante publique deduite du diagnostic principal
  if (!e.publicHealth?.notifiableDisease && e.diagnoses.length) {
    const hit = suggestIcd10(e.diagnoses[0].label);
    if (hit?.notifiable) {
      e.publicHealth = { ...e.publicHealth, notifiableDisease: hit.notifiable, icd10Code: hit.code };
    }
  }

  return e;
}

/** Interpretation N/H/L d'une constante, pour l'affichage et FHIR. */
export function vitalInterpretation(loinc: string | undefined, value: number | null | undefined): string | null {
  if (!loinc || value === null || value === undefined) return null;
  const def = VITALS.find((v) => v.loinc === loinc);
  return def ? interpretVital(def, value) : null;
}
