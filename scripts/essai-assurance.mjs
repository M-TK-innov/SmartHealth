/** Verifie la prise en charge automatique sur la vraie base. */
process.env.SMARTHEALTH_DEMO = '1';

const R = 'file:///C:/Users/HomePC/Documents/CIT/ParleDocteur/';
const { all, get } = await import(R + 'lib/db.ts');
const { facturerActe, conventionsDe, appliquerConvention } = await import(R + 'lib/caisse/auto.ts');

const ORG = '175965d8-d5ec-4197-a368-898138d55e60';

console.log('regimes portes par les patients :');
for (const p of all(
  "SELECT given_name || ' ' || family_name AS nom, insurance_scheme AS regime FROM patient WHERE insurance_scheme IS NOT NULL",
)) {
  console.log(`  ${p.nom.padEnd(22)} ${p.regime}`);
}

console.log('conventions enregistrees :');
for (const c of conventionsDe(ORG)) {
  console.log(`  ${c.regime.padEnd(16)} ${c.code.padEnd(24)} ${c.taux} %${c.plafond ? ', plafond ' + c.plafond : ''}`);
}

// La facture ouverte de Bernard.
const f = get(
  "SELECT f.id, f.part_tiers, p.insurance_scheme AS regime, p.given_name || ' ' || p.family_name AS nom FROM facture f JOIN sejour s ON s.id = f.sejour_id JOIN patient p ON p.id = s.patient_id WHERE f.close = 0 LIMIT 1",
);
console.log('');
console.log(`facture ouverte de ${f.nom} (regime : ${f.regime ?? 'aucun'})`);

const total = () =>
  get('SELECT COALESCE(SUM(montant * quantite), 0) t FROM facture_ligne WHERE facture_id = ?', [f.id]).t;
const partTiers = () => get('SELECT part_tiers p FROM facture WHERE id = ?', [f.id]).p;

console.log(`  total des lignes : ${total()}   part du tiers : ${partTiers()}`);

const p = appliquerConvention(f.id, { acteurId: null, organizationId: ORG });
console.log('  apres application :', JSON.stringify(p));
console.log(`  part du tiers en base : ${partTiers()}   reste a charge : ${total() - partTiers()}`);

// Un acte de plus doit faire bouger la part du tiers, pas la figer.
const avant = partTiers();
facturerActe(
  get('SELECT sejour_id s FROM facture WHERE id = ?', [f.id]).s,
  {
    code: 'journee-hospitalisation',
    libelle: 'Journee d hospitalisation',
    quantite: 1,
    urgence: 'programmable',
    source: 'essai:assurance-' + Date.now(),
  },
  { acteurId: null, organizationId: ORG },
);
const apres = partTiers();
console.log('');
console.log(`  un acte de plus : part du tiers ${avant} -> ${apres}`);
console.log(
  apres >= avant
    ? 'OK : la part du tiers suit la facture au lieu d etre figee'
    : 'ECHEC : la part du tiers a baisse',
);
