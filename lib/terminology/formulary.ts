/**
 * Formulaire medicamenteux embarque.
 *
 * Base : Liste Modele OMS des Medicaments Essentiels (adaptee aux listes
 * nationales ouest-africaines) + codes ATC. Sert a :
 *   - normaliser la DCI entendue en consultation,
 *   - controler les contre-indications (grossesse, rein, foie, pediatrie),
 *   - detecter les interactions et les doublons de classe.
 *
 * AVERTISSEMENT : aide a la decision, jamais une prescription automatique.
 * Le medecin valide et engage seul sa responsabilite.
 */

export interface DrugDef {
  dci: string;
  atc: string;
  aliases?: string[];
  forms: string[];
  strengths: string[];
  className: string;
  essential: boolean;
  pregnancy: 'safe' | 'caution' | 'contraindicated' | 'unknown';
  renalCaution?: boolean;
  hepaticCaution?: boolean;
  pediatricMinAgeMonths?: number;
  notes?: string;
}

export const FORMULARY: DrugDef[] = [
  // --- Antalgiques / antipyretiques / AINS
  { dci: 'Paracetamol', atc: 'N02BE01', aliases: ['acetaminophene', 'doliprane', 'efferalgan'], forms: ['comprime', 'sirop', 'suppositoire', 'injectable'], strengths: ['500 mg', '1 g', '125 mg', '250 mg', '120 mg/5 mL'], className: 'Antalgique - antipyretique', essential: true, pregnancy: 'safe', hepaticCaution: true, notes: 'Max 4 g/j adulte ; 60 mg/kg/j enfant.' },
  { dci: 'Ibuprofene', atc: 'M01AE01', aliases: ['advil', 'brufen'], forms: ['comprime', 'sirop'], strengths: ['200 mg', '400 mg', '100 mg/5 mL'], className: 'AINS', essential: true, pregnancy: 'contraindicated', renalCaution: true, pediatricMinAgeMonths: 3, notes: 'Contre-indique apres 24 SA. Prudence si deshydratation ou paludisme grave.' },
  { dci: 'Diclofenac', atc: 'M01AB05', aliases: ['voltarene'], forms: ['comprime', 'injectable', 'gel'], strengths: ['50 mg', '75 mg'], className: 'AINS', essential: false, pregnancy: 'contraindicated', renalCaution: true },
  { dci: 'Acide acetylsalicylique', atc: 'N02BA01', aliases: ['aspirine', 'aspirin'], forms: ['comprime'], strengths: ['100 mg', '500 mg'], className: 'AINS - antiagregant', essential: true, pregnancy: 'caution', pediatricMinAgeMonths: 192, notes: 'Eviter chez l enfant (syndrome de Reye) et en cas de dengue suspectee.' },
  { dci: 'Tramadol', atc: 'N02AX02', forms: ['gelule', 'injectable'], strengths: ['50 mg', '100 mg'], className: 'Antalgique palier II', essential: true, pregnancy: 'caution', renalCaution: true, hepaticCaution: true, pediatricMinAgeMonths: 144 },

  // --- Antipaludiques
  { dci: 'Artemether + Lumefantrine', atc: 'P01BF01', aliases: ['coartem', 'al', 'arthemeter lumefantrine'], forms: ['comprime', 'comprime dispersible'], strengths: ['20/120 mg', '80/480 mg'], className: 'Antipaludique (CTA)', essential: true, pregnancy: 'caution', notes: 'Traitement de 1re intention du paludisme simple. 6 prises sur 3 jours, avec un aliment gras. Eviter au 1er trimestre.' },
  { dci: 'Artesunate', atc: 'P01BE03', forms: ['injectable', 'suppositoire'], strengths: ['60 mg', '100 mg'], className: 'Antipaludique injectable', essential: true, pregnancy: 'safe', notes: 'Traitement de reference du paludisme grave a tous les trimestres.' },
  { dci: 'Artesunate + Amodiaquine', atc: 'P01BF03', aliases: ['asaq'], forms: ['comprime'], strengths: ['25/67,5 mg', '100/270 mg'], className: 'Antipaludique (CTA)', essential: true, pregnancy: 'caution' },
  { dci: 'Sulfadoxine + Pyrimethamine', atc: 'P01BD51', aliases: ['sp', 'fansidar'], forms: ['comprime'], strengths: ['500/25 mg'], className: 'Antipaludique - TPI', essential: true, pregnancy: 'caution', notes: 'TPIg a partir du 2e trimestre, mensuel.' },
  { dci: 'Quinine', atc: 'P01BC01', forms: ['comprime', 'injectable'], strengths: ['300 mg', '500 mg'], className: 'Antipaludique', essential: true, pregnancy: 'safe', notes: 'Risque d hypoglycemie, surtout chez la femme enceinte.' },

  // --- Antibiotiques
  { dci: 'Amoxicilline', atc: 'J01CA04', aliases: ['clamoxyl'], forms: ['gelule', 'sirop', 'injectable'], strengths: ['250 mg', '500 mg', '1 g', '125 mg/5 mL', '250 mg/5 mL'], className: 'Beta-lactamine (penicilline A)', essential: true, pregnancy: 'safe', renalCaution: true },
  { dci: 'Amoxicilline + Acide clavulanique', atc: 'J01CR02', aliases: ['augmentin', 'co-amoxiclav'], forms: ['comprime', 'sirop'], strengths: ['500/62,5 mg', '875/125 mg'], className: 'Beta-lactamine + inhibiteur', essential: true, pregnancy: 'safe', hepaticCaution: true },
  { dci: 'Ceftriaxone', atc: 'J01DD04', aliases: ['rocephine'], forms: ['injectable'], strengths: ['500 mg', '1 g', '2 g'], className: 'Cephalosporine 3e generation', essential: true, pregnancy: 'safe' },
  { dci: 'Ciprofloxacine', atc: 'J01MA02', aliases: ['cipro'], forms: ['comprime', 'injectable'], strengths: ['250 mg', '500 mg'], className: 'Fluoroquinolone', essential: true, pregnancy: 'contraindicated', pediatricMinAgeMonths: 192, renalCaution: true, notes: 'Eviter chez l enfant et l adolescent en croissance sauf indication vitale.' },
  { dci: 'Metronidazole', atc: 'J01XD01', aliases: ['flagyl'], forms: ['comprime', 'sirop', 'injectable', 'ovule'], strengths: ['250 mg', '500 mg'], className: 'Nitro-imidazole', essential: true, pregnancy: 'caution', notes: 'Effet antabuse : interdire l alcool pendant le traitement et 48 h apres.' },
  { dci: 'Azithromycine', atc: 'J01FA10', forms: ['comprime', 'sirop'], strengths: ['250 mg', '500 mg'], className: 'Macrolide', essential: true, pregnancy: 'safe' },
  { dci: 'Cotrimoxazole', atc: 'J01EE01', aliases: ['bactrim', 'sulfamethoxazole trimethoprime'], forms: ['comprime', 'sirop'], strengths: ['400/80 mg', '800/160 mg'], className: 'Sulfamide', essential: true, pregnancy: 'caution', renalCaution: true, notes: 'Prophylaxie chez le patient VIH+. Eviter au 3e trimestre (ictere nucleaire).' },
  { dci: 'Doxycycline', atc: 'J01AA02', forms: ['gelule'], strengths: ['100 mg'], className: 'Cycline', essential: true, pregnancy: 'contraindicated', pediatricMinAgeMonths: 96, notes: 'Contre-indiquee chez la femme enceinte et l enfant < 8 ans (dents).' },
  { dci: 'Gentamicine', atc: 'J01GB03', forms: ['injectable'], strengths: ['40 mg/mL', '80 mg'], className: 'Aminoside', essential: true, pregnancy: 'caution', renalCaution: true },

  // --- Antiparasitaires
  { dci: 'Albendazole', atc: 'P02CA03', forms: ['comprime', 'sirop'], strengths: ['400 mg'], className: 'Antihelminthique', essential: true, pregnancy: 'caution', pediatricMinAgeMonths: 12, notes: 'Eviter au 1er trimestre.' },
  { dci: 'Mebendazole', atc: 'P02CA01', forms: ['comprime'], strengths: ['100 mg', '500 mg'], className: 'Antihelminthique', essential: true, pregnancy: 'caution', pediatricMinAgeMonths: 12 },
  { dci: 'Ivermectine', atc: 'P02CF01', forms: ['comprime'], strengths: ['3 mg'], className: 'Antiparasitaire', essential: true, pregnancy: 'contraindicated' },

  // --- Digestif
  { dci: 'Omeprazole', atc: 'A02BC01', forms: ['gelule', 'injectable'], strengths: ['20 mg', '40 mg'], className: 'Inhibiteur de la pompe a protons', essential: true, pregnancy: 'safe' },
  { dci: 'Sels de rehydratation orale', atc: 'A07CA', aliases: ['sro', 'ors'], forms: ['sachet'], strengths: ['1 sachet / 1 L'], className: 'Rehydratation', essential: true, pregnancy: 'safe', notes: 'Traitement de 1re intention de toute diarrhee.' },
  { dci: 'Zinc', atc: 'A12CB01', forms: ['comprime dispersible'], strengths: ['20 mg', '10 mg'], className: 'Oligo-element', essential: true, pregnancy: 'safe', notes: '10-14 jours avec les SRO chez l enfant diarrheique.' },
  { dci: 'Metoclopramide', atc: 'A03FA01', forms: ['comprime', 'injectable'], strengths: ['10 mg'], className: 'Antiemetique', essential: true, pregnancy: 'caution', pediatricMinAgeMonths: 216 },
  { dci: 'Butylscopolamine', atc: 'A03BB01', aliases: ['buscopan'], forms: ['comprime', 'injectable'], strengths: ['10 mg', '20 mg'], className: 'Antispasmodique', essential: false, pregnancy: 'caution' },

  // --- Cardiovasculaire / metabolique
  { dci: 'Amlodipine', atc: 'C08CA01', forms: ['comprime'], strengths: ['5 mg', '10 mg'], className: 'Inhibiteur calcique', essential: true, pregnancy: 'caution' },
  { dci: 'Enalapril', atc: 'C09AA02', forms: ['comprime'], strengths: ['5 mg', '10 mg', '20 mg'], className: 'IEC', essential: true, pregnancy: 'contraindicated', renalCaution: true },
  { dci: 'Hydrochlorothiazide', atc: 'C03AA03', forms: ['comprime'], strengths: ['25 mg'], className: 'Diuretique thiazidique', essential: true, pregnancy: 'caution', renalCaution: true },
  { dci: 'Furosemide', atc: 'C03CA01', aliases: ['lasilix'], forms: ['comprime', 'injectable'], strengths: ['40 mg', '20 mg/2 mL'], className: 'Diuretique de l anse', essential: true, pregnancy: 'caution', renalCaution: true },
  { dci: 'Atenolol', atc: 'C07AB03', forms: ['comprime'], strengths: ['50 mg', '100 mg'], className: 'Beta-bloquant', essential: true, pregnancy: 'caution' },
  { dci: 'Metformine', atc: 'A10BA02', forms: ['comprime'], strengths: ['500 mg', '850 mg', '1000 mg'], className: 'Antidiabetique oral (biguanide)', essential: true, pregnancy: 'caution', renalCaution: true, notes: 'Arreter si DFG < 30 mL/min ou avant injection de produit de contraste.' },
  { dci: 'Glibenclamide', atc: 'A10BB01', forms: ['comprime'], strengths: ['5 mg'], className: 'Sulfamide hypoglycemiant', essential: true, pregnancy: 'caution', renalCaution: true },
  { dci: 'Insuline humaine', atc: 'A10AB01', forms: ['injectable'], strengths: ['100 UI/mL'], className: 'Insuline', essential: true, pregnancy: 'safe' },
  { dci: 'Simvastatine', atc: 'C10AA01', forms: ['comprime'], strengths: ['20 mg', '40 mg'], className: 'Statine', essential: true, pregnancy: 'contraindicated', hepaticCaution: true },

  // --- Respiratoire / allergie
  { dci: 'Salbutamol', atc: 'R03AC02', aliases: ['ventoline'], forms: ['aerosol doseur', 'solution nebulisation', 'sirop'], strengths: ['100 µg/dose', '5 mg/mL'], className: 'Beta-2 mimetique', essential: true, pregnancy: 'safe' },
  { dci: 'Beclometasone', atc: 'R03BA01', forms: ['aerosol doseur'], strengths: ['250 µg/dose'], className: 'Corticoide inhale', essential: true, pregnancy: 'safe' },
  { dci: 'Prednisolone', atc: 'H02AB06', forms: ['comprime'], strengths: ['5 mg', '20 mg'], className: 'Corticoide oral', essential: true, pregnancy: 'caution' },
  { dci: 'Cetirizine', atc: 'R06AE07', forms: ['comprime', 'sirop'], strengths: ['10 mg', '5 mg/5 mL'], className: 'Antihistaminique H1', essential: true, pregnancy: 'safe', pediatricMinAgeMonths: 24 },
  { dci: 'Chlorphenamine', atc: 'R06AB04', forms: ['comprime', 'sirop'], strengths: ['4 mg'], className: 'Antihistaminique H1 sedatif', essential: true, pregnancy: 'caution' },

  // --- Nutrition / grossesse
  { dci: 'Fer + Acide folique', atc: 'B03AD', aliases: ['fer folate', 'sulfate ferreux'], forms: ['comprime'], strengths: ['60 mg / 400 µg'], className: 'Supplementation martiale', essential: true, pregnancy: 'safe', notes: 'Supplementation systematique pendant la grossesse.' },
  { dci: 'Acide folique', atc: 'B03BB01', forms: ['comprime'], strengths: ['5 mg'], className: 'Vitamine B9', essential: true, pregnancy: 'safe' },
  { dci: 'Vitamine A', atc: 'A11CA01', forms: ['capsule'], strengths: ['100 000 UI', '200 000 UI'], className: 'Vitamine', essential: true, pregnancy: 'contraindicated', notes: 'Fortes doses contre-indiquees pendant la grossesse.' },
  { dci: 'Calcium', atc: 'A12AA', forms: ['comprime'], strengths: ['500 mg'], className: 'Mineral', essential: true, pregnancy: 'safe' },

  // --- Antiretroviraux / TB (programmes nationaux)
  { dci: 'Tenofovir + Lamivudine + Dolutegravir', atc: 'J05AR27', aliases: ['tld', 'tdf 3tc dtg'], forms: ['comprime'], strengths: ['300/300/50 mg'], className: 'Antiretroviral (1re ligne)', essential: true, pregnancy: 'safe', renalCaution: true },
  { dci: 'Isoniazide', atc: 'J04AC01', forms: ['comprime'], strengths: ['100 mg', '300 mg'], className: 'Antituberculeux', essential: true, pregnancy: 'safe', hepaticCaution: true, notes: 'Associer la vitamine B6 (pyridoxine).' },
  { dci: 'Rifampicine + Isoniazide + Pyrazinamide + Ethambutol', atc: 'J04AM06', aliases: ['rhze', 'quadritherapie'], forms: ['comprime'], strengths: ['150/75/400/275 mg'], className: 'Antituberculeux (phase intensive)', essential: true, pregnancy: 'safe', hepaticCaution: true, notes: 'Coloration orange des urines. Inducteur enzymatique puissant.' },
];

/** Interactions medicamenteuses cliniquement significatives (par code ATC). */
export interface InteractionDef {
  a: string;
  b: string;
  severity: 'minor' | 'moderate' | 'major' | 'contraindicated';
  effect: string;
  advice: string;
}

export const INTERACTIONS: InteractionDef[] = [
  { a: 'M01AE01', b: 'C09AA02', severity: 'major', effect: 'Les AINS reduisent l effet antihypertenseur des IEC et majorent le risque d insuffisance renale aigue.', advice: 'Eviter l association ; surveiller la creatinine et la tension.' },
  { a: 'M01AE01', b: 'N02BA01', severity: 'major', effect: 'Association de deux AINS : risque hemorragique et ulcerogene cumulatif.', advice: 'Ne pas associer deux AINS.' },
  { a: 'M01AB05', b: 'M01AE01', severity: 'contraindicated', effect: 'Deux AINS : toxicite digestive et renale cumulee sans benefice.', advice: 'Choisir un seul AINS.' },
  { a: 'M01AE01', b: 'C03CA01', severity: 'moderate', effect: 'Les AINS antagonisent l effet diuretique et majorent le risque renal.', advice: 'Surveiller la fonction renale et l etat d hydratation.' },
  { a: 'J01XD01', b: 'B01AA03', severity: 'major', effect: 'Le metronidazole potentialise l effet des antivitamines K.', advice: 'Controler l INR de facon rapprochee.' },
  { a: 'J01MA02', b: 'A02BC01', severity: 'minor', effect: 'Absorption possiblement modifiee.', advice: 'Espacer les prises de 2 heures.' },
  { a: 'J04AM06', b: 'J05AR27', severity: 'major', effect: 'La rifampicine (inducteur enzymatique) diminue fortement les concentrations de dolutegravir.', advice: 'Doubler la dose de dolutegravir ou adapter le schema ARV selon le protocole national.' },
  { a: 'J04AM06', b: 'A10BB01', severity: 'moderate', effect: 'La rifampicine reduit l effet des sulfamides hypoglycemiants.', advice: 'Renforcer la surveillance glycemique.' },
  { a: 'C10AA01', b: 'J01FA10', severity: 'moderate', effect: 'Risque accru de myopathie et de rhabdomyolyse.', advice: 'Suspendre la statine pendant le macrolide si possible.' },
  { a: 'A10BA02', b: 'C03AA03', severity: 'moderate', effect: 'Les thiazidiques augmentent la glycemie et le risque d acidose lactique en cas de deshydratation.', advice: 'Surveiller la glycemie et la fonction renale.' },
  { a: 'N02AX02', b: 'N06AB', severity: 'major', effect: 'Risque de syndrome serotoninergique et abaissement du seuil epileptogene.', advice: 'Eviter ; preferer un autre antalgique.' },
  { a: 'H02AB06', b: 'M01AE01', severity: 'major', effect: 'Corticoide + AINS : risque ulcerogene et hemorragique majore.', advice: 'Eviter, ou associer une protection gastrique.' },
  { a: 'P01BC01', b: 'P01BF01', severity: 'moderate', effect: 'Allongement additif du QT avec les antipaludiques.', advice: 'Ne pas associer ; respecter le protocole national de prise en charge.' },
  { a: 'J01CA04', b: 'J01AA02', severity: 'minor', effect: 'Les cyclines (bacteriostatiques) peuvent antagoniser les beta-lactamines (bactericides).', advice: 'Eviter l association sauf indication precise.' },
];

// ------------------------------------------------------------------ helpers

const norm = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Retrouve une DCI a partir d un nom entendu (DCI, nom de marque, faute d orthographe simple). */
export function findDrug(name: string): DrugDef | undefined {
  const n = norm(name);
  if (!n) return undefined;

  const exact = FORMULARY.find((d) => norm(d.dci) === n || d.aliases?.some((a) => norm(a) === n));
  if (exact) return exact;

  const partial = FORMULARY.find(
    (d) => n.includes(norm(d.dci)) || norm(d.dci).includes(n) || d.aliases?.some((a) => n.includes(norm(a))),
  );
  if (partial) return partial;

  // tolerance aux erreurs de transcription vocale (distance de Levenshtein)
  let best: { d: DrugDef; dist: number } | undefined;
  for (const d of FORMULARY) {
    const candidates = [d.dci, ...(d.aliases ?? [])];
    for (const c of candidates) {
      const dist = levenshtein(n, norm(c));
      const tolerance = Math.max(1, Math.floor(norm(c).length * 0.25));
      if (dist <= tolerance && (!best || dist < best.dist)) best = { d, dist };
    }
  }
  return best?.d;
}

export function findInteraction(atcA: string, atcB: string): InteractionDef | undefined {
  const startsWith = (full: string, prefix: string) => full.startsWith(prefix);
  return INTERACTIONS.find(
    (i) =>
      (startsWith(atcA, i.a) && startsWith(atcB, i.b)) || (startsWith(atcA, i.b) && startsWith(atcB, i.a)),
  );
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
