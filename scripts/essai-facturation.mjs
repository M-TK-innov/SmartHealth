/** Prouve qu'un acte facture automatiquement ne l'est jamais deux fois. */
process.env.SMARTHEALTH_DEMO = '1';

const R = 'file:///C:/Users/HomePC/Documents/CIT/ParleDocteur/';
const { all, get } = await import(R + 'lib/db.ts');
const { facturerActe, baremeDe, actesNonTarifes } = await import(R + 'lib/caisse/auto.ts');

const ORG = '175965d8-d5ec-4197-a368-898138d55e60';

console.log('bareme de l etablissement :', baremeDe(ORG).length, 'tarifs');

// Un sejour en cours, pour y accrocher des actes.
const sejour = get(
  "SELECT s.id, p.given_name || ' ' || p.family_name AS nom FROM sejour s JOIN patient p ON p.id = s.patient_id WHERE s.sorti_le IS NULL LIMIT 1",
);
console.log('sejour en cours :', sejour.nom);

const lignes = () =>
  get('SELECT COUNT(*) n FROM facture_ligne l JOIN facture f ON f.id = l.facture_id WHERE f.sejour_id = ?', [
    sejour.id,
  ]).n;

const avant = lignes();
console.log('lignes de facture avant :', avant);

const acte = {
  code: 'consultation-externe',
  libelle: 'Consultation externe',
  quantite: 1,
  urgence: 'programmable',
  source: 'essai:non-duplication',
};

const un = facturerActe(sejour.id, acte, { acteurId: null, organizationId: ORG });
console.log('1er appel  :', JSON.stringify(un));
const deux = facturerActe(sejour.id, acte, { acteurId: null, organizationId: ORG });
console.log('2e appel   :', JSON.stringify(deux));
const trois = facturerActe(sejour.id, acte, { acteurId: null, organizationId: ORG });
console.log('3e appel   :', JSON.stringify(trois));

const apres = lignes();
console.log('lignes de facture apres :', apres);
console.log(apres - avant === 1 ? 'OK : une seule ligne ajoutee' : 'ECHEC : ' + (apres - avant) + ' lignes');

// Un acte hors bareme : la kaliemie, laissee dehors expres.
const hors = facturerActe(
  sejour.id,
  {
    code: 'examen:2823-3',
    libelle: 'Kaliemie',
    quantite: 1,
    urgence: 'urgente',
    source: 'essai:hors-bareme',
  },
  { acteurId: null, organizationId: ORG },
);
console.log('hors bareme :', JSON.stringify(hors));
console.log(
  hors.ok === false && hors.codeManquant === 'examen:2823-3'
    ? 'OK : refuse, et le code manquant est nomme'
    : 'ECHEC : il aurait du refuser en nommant le code',
);

console.log('actes non tarifes :', JSON.stringify(actesNonTarifes(ORG)));
