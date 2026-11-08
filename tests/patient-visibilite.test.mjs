/**
 * Ce qu'un patient voit de son dossier.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE :
 *
 *   - qu'un brouillon d'ordonnance n'atteigne JAMAIS le patient. Son
 *     origine peut etre « ai-proposed » : une proposition de modele que le
 *     praticien n'a pas relue ;
 *   - qu'une ordonnance annulee reste visible mais SANS son jeton de
 *     pharmacie. La faire disparaitre pousserait le patient a se servir de
 *     la photo qu'il en a prise ;
 *   - que la liste des champs sortants ne grandisse pas par inadvertance.
 *     C'est l'invariant central : une colonne ajoutee a la base ne doit pas
 *     atteindre un telephone parce que personne n'y a pense ;
 *   - que le montant montre au patient soit celui de la caisse, et non un
 *     second calcul qui finira par diverger.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLES_AUTORISEES,
  analyseMontrable,
  ordonnanceMontrable,
  projeterAnalyse,
  projeterDossierMedical,
  projeterFacture,
  projeterOrdonnance,
  projeterRendezVous,
  projeterSejour,
} from '../lib/patient/visibilite.ts';
import { solde } from '../lib/hopital/caisse.ts';

const ligne = {
  medicament: 'Amoxicilline',
  dosage: '500 mg',
  posologie: '1 comprime 3 fois par jour',
  dureeJours: 7,
  quantite: '21 comprimes',
};

const ordonnance = (sur = {}) => ({
  id: 'ord-1',
  statut: 'validated',
  valideeLe: '2026-03-02 10:00:00',
  prescriteLe: '2026-03-02 09:40:00',
  prescripteur: 'Dr Ama Sossou',
  qr: 'JETON-PHARMACIE',
  lignes: [ligne],
  ...sur,
});

describe('ordonnances : ce qui sort et ce qui ne sort pas', () => {
  test('un brouillon ne sort pas, meme avec des lignes completes', () => {
    assert.equal(ordonnanceMontrable({ statut: 'draft', valideeLe: null }), false);
    assert.equal(projeterOrdonnance(ordonnance({ statut: 'draft', valideeLe: null })), null);
  });

  test('un brouillon portant une date de validation ne sort pas non plus', () => {
    // Incoherence de donnees : le statut fait foi, pas la date.
    assert.equal(projeterOrdonnance(ordonnance({ statut: 'draft' })), null);
  });

  test('une ordonnance validee sort', () => {
    const v = projeterOrdonnance(ordonnance());
    assert.equal(v?.id, 'ord-1');
    assert.equal(v?.annulee, false);
    assert.equal(v?.qr, 'JETON-PHARMACIE');
    assert.equal(v?.lignes.length, 1);
  });

  test('une ordonnance delivree sort encore : le patient doit pouvoir la relire', () => {
    assert.ok(projeterOrdonnance(ordonnance({ statut: 'dispensed' })));
  });

  test('sans validation, rien ne sort, quel que soit le statut', () => {
    for (const statut of ['draft', 'validated', 'dispensed', 'cancelled']) {
      assert.equal(
        projeterOrdonnance(ordonnance({ statut, valideeLe: null })),
        null,
        `${statut} sans validation`,
      );
    }
  });
});

describe('ordonnance annulee', () => {
  test('elle reste visible, et se dit annulee', () => {
    const v = projeterOrdonnance(ordonnance({ statut: 'cancelled' }));
    assert.ok(v, 'une annulation deja vue ne doit pas disparaitre');
    assert.equal(v.annulee, true);
  });

  test('mais son jeton de pharmacie est retire', () => {
    // Sinon elle resterait presentable au comptoir.
    const v = projeterOrdonnance(ordonnance({ statut: 'cancelled' }));
    assert.equal(v.qr, null);
  });

  test('annulee avant toute validation, elle n a jamais ete vue : rien ne sort', () => {
    assert.equal(projeterOrdonnance(ordonnance({ statut: 'cancelled', valideeLe: null })), null);
  });
});

describe('la frontiere ne s elargit pas toute seule', () => {
  test('une ordonnance ne produit que les cles autorisees', () => {
    const v = projeterOrdonnance(ordonnance());
    assert.deepEqual(Object.keys(v).sort(), [...CLES_AUTORISEES.ordonnance].sort());
    assert.deepEqual(Object.keys(v.lignes[0]).sort(), [...CLES_AUTORISEES.ligneOrdonnance].sort());
  });

  test('un champ sensible ajoute a la source ne traverse pas', () => {
    // Le cas qui compte : quelqu'un ajoute une colonne, le store la passe.
    const v = projeterOrdonnance(
      ordonnance({ notes: 'suspicion de tuberculose', safety_json: '{}', practitioner_id: 'p-1' }),
    );
    assert.equal('notes' in v, false);
    assert.equal('safety_json' in v, false);
    assert.equal('practitioner_id' in v, false);
  });

  test('un champ sensible ajoute a une LIGNE ne traverse pas non plus', () => {
    // La table prescription_item porte une douzaine de colonnes de plus :
    // voie, frequence, code ATC, nom de marque, indication. Une ligne
    // recopiee telle quelle les ferait toutes sortir d'un coup.
    const v = projeterOrdonnance(
      ordonnance({
        lignes: [
          {
            ...ligne,
            atc_code: 'J01CA04',
            brand_name: 'Clamoxyl',
            route: 'oral',
            frequency_per_day: 3,
            indication: 'infection urinaire',
            prescription_id: 'ord-1',
          },
        ],
      }),
    );
    assert.deepEqual(Object.keys(v.lignes[0]).sort(), [...CLES_AUTORISEES.ligneOrdonnance].sort());
    for (const interdit of ['atc_code', 'brand_name', 'route', 'indication', 'prescription_id']) {
      assert.equal(interdit in v.lignes[0], false, `${interdit} a traverse`);
    }
  });
});

describe('factures', () => {
  const facture = {
    id: 'f-1',
    sejourId: 's-1',
    partTiers: 2000,
    close: false,
    lignes: [
      { id: 'l1', libelle: 'Consultation', montant: 3000, quantite: 1, urgence: 'programmable' },
      { id: 'l2', libelle: 'Pansement', montant: 1500, quantite: 2, urgence: 'urgente' },
    ],
    paiements: [{ id: 'p1', montant: 1000, moyen: 'especes', recuLe: '2026-03-02 11:00:00' }],
  };

  test('le montant montre est celui de la caisse, pas un second calcul', () => {
    const attendu = solde(facture);
    const v = projeterFacture(facture);
    assert.equal(v.total, attendu.total);
    assert.equal(v.resteACharge, attendu.resteACharge);
    assert.equal(v.partTiers, attendu.partTiers);
    assert.equal(v.soldee, attendu.soldee);
  });

  test('elle ne produit que les cles autorisees', () => {
    const v = projeterFacture(facture);
    assert.deepEqual(Object.keys(v).sort(), [...CLES_AUTORISEES.facture].sort());
    assert.deepEqual(Object.keys(v.lignes[0]).sort(), [...CLES_AUTORISEES.ligneFacture].sort());
    assert.deepEqual(Object.keys(v.reglements[0]).sort(), [...CLES_AUTORISEES.reglement].sort());
  });

  test('la gravite de l acte ne sort pas : elle releve du dossier', () => {
    const v = projeterFacture(facture);
    assert.equal('urgence' in v.lignes[0], false);
  });

  test('aucun identifiant de soignant ne sort', () => {
    const v = projeterFacture(facture);
    assert.equal(JSON.stringify(v).includes('acteur'), false);
  });
});

describe('sejours', () => {
  test('un sejour sans date de sortie est en cours', () => {
    const v = projeterSejour({ id: 's-1', entreeLe: '2026-03-01', sortieLe: null, service: 'Medecine', motif: 'Paludisme' });
    assert.equal(v.enCours, true);
  });

  test('un sejour clos ne l est plus', () => {
    const v = projeterSejour({ id: 's-1', entreeLe: '2026-03-01', sortieLe: '2026-03-04', service: null, motif: null });
    assert.equal(v.enCours, false);
  });

  test('il ne produit que les cles autorisees', () => {
    const v = projeterSejour({ id: 's', entreeLe: 'a', sortieLe: null, service: null, motif: null });
    assert.deepEqual(Object.keys(v).sort(), [...CLES_AUTORISEES.sejour].sort());
  });
});


// ---------------------------------------------------------------- analyses

function analyse(extra = {}) {
  return {
    id: 'a-1',
    examen: 'Kaliemie',
    domaine: 'laboratoire',
    demandeeLe: '2026-11-07 08:00:00',
    etat: 'validee',
    priorite: 'routine',
    valeurNum: 3.9,
    valeurTexte: null,
    unite: 'mmol/L',
    interpretation: 'normal',
    rendueLe: '2026-11-07 10:00:00',
    remplacePar: null,
    aTransmettre: false,
    ...extra,
  };
}

describe('analyses : ce que le patient lit de ses resultats', () => {
  test('un resultat courant sort avec sa valeur', () => {
    const v = projeterAnalyse(analyse());
    assert.equal(v.valeur, '3.9');
    assert.equal(v.unite, 'mmol/L');
    assert.equal(v.critique, false);
    assert.equal(v.centreNonJoint, false);
  });

  test('une valeur texte prend la place de la valeur numerique', () => {
    // Les deux colonnes existent en base ; une seule est remplie a la fois, et
    // l ecran du patient n a pas la place d en montrer deux.
    const v = projeterAnalyse(analyse({ valeurNum: null, valeurTexte: 'Positif', unite: null }));
    assert.equal(v.valeur, 'Positif');
  });

  test('un resultat REMPLACE par une correction ne sort jamais', () => {
    // Le cas qui compte : le laboratoire a corrige. Montrer l ancienne valeur
    // ferait agir le patient sur un chiffre que son dossier ne porte plus.
    assert.equal(analyseMontrable({ remplacePar: 'a-2' }), false);
    assert.equal(projeterAnalyse(analyse({ remplacePar: 'a-2' })), null);
  });

  test('une valeur critique NON acquittee previent que personne n a ete joint', () => {
    // C est la raison d etre de ce champ : le patient est le premier au
    // courant, et il doit le savoir pour appeler lui-meme.
    const v = projeterAnalyse(analyse({ interpretation: 'critique', aTransmettre: true, valeurNum: 7.4 }));
    assert.equal(v.critique, true);
    assert.equal(v.centreNonJoint, true);
    // La valeur n est PAS retenue : on ne cache pas a quelqu un ce qui le concerne.
    assert.equal(v.valeur, '7.4');
  });

  test('une valeur critique DEJA acquittee ne declenche pas l alerte', () => {
    const v = projeterAnalyse(analyse({ interpretation: 'critique', aTransmettre: false }));
    assert.equal(v.critique, true);
    assert.equal(v.centreNonJoint, false);
  });

  test('une analyse ne produit que les cles autorisees', () => {
    const v = projeterAnalyse(analyse());
    assert.deepEqual(Object.keys(v).sort(), [...CLES_AUTORISEES.analyse].sort());
  });

  test('un champ sensible ajoute a la source ne traverse pas', () => {
    const v = projeterAnalyse(
      analyse({ rendu_par: 'p-1', seuil_bas: 3.5, commentaire_labo: 'hemolyse probable' }),
    );
    for (const interdit of ['rendu_par', 'seuil_bas', 'commentaire_labo']) {
      assert.equal(interdit in v, false, `${interdit} ne doit pas sortir`);
    }
  });
});

// ------------------------------------------------------------- rendez-vous

function rdv(extra = {}) {
  return {
    id: 'r-1',
    mode: 'distance',
    motif: 'Controle post-operatoire',
    debut: '2026-11-20 09:30:00',
    dureeMin: 20,
    etat: 'confirme',
    praticien: 'Ama Sossou',
    lieu: 'Centre de Sante de Cotonou',
    salle: 'jeton-opaque-abcdef',
    consentementLe: '2026-11-18 12:00:00',
    annuleMotif: null,
    ...extra,
  };
}

describe('rendez-vous : le jeton de salle est une entree, pas un libelle', () => {
  test('une teleconsultation a venir et consentie donne la salle', () => {
    const v = projeterRendezVous(rdv(), false);
    assert.equal(v.salle, 'jeton-opaque-abcdef');
    assert.equal(v.aDistance, true);
  });

  test('sans consentement, pas de salle', () => {
    const v = projeterRendezVous(rdv({ consentementLe: null }), false);
    assert.equal(v.salle, null);
    assert.equal(v.consentementDonne, false);
  });

  test('un rendez-vous PASSE ne laisse pas sa salle ouverte', () => {
    // Sinon le lien d une consultation terminee reste utilisable.
    assert.equal(projeterRendezVous(rdv(), true).salle, null);
  });

  test('un rendez-vous ANNULE ne laisse pas sa salle ouverte', () => {
    assert.equal(projeterRendezVous(rdv({ etat: 'annule' }), false).salle, null);
  });

  test('un rendez-vous en presentiel n a pas de salle', () => {
    assert.equal(projeterRendezVous(rdv({ mode: 'presentiel' }), false).salle, null);
  });

  test('un rendez-vous ne produit que les cles autorisees', () => {
    const v = projeterRendezVous(rdv(), false);
    assert.deepEqual(Object.keys(v).sort(), [...CLES_AUTORISEES.rendezVous].sort());
  });

  test('l identifiant du praticien ne traverse pas', () => {
    const v = projeterRendezVous(rdv({ practitioner_id: 'p-1', notes_internes: 'patient difficile' }), false);
    assert.equal('practitioner_id' in v, false);
    assert.equal('notes_internes' in v, false);
  });
});

// --------------------------------------------------------- dossier medical

function dossierMedical(extra = {}) {
  return {
    nom: 'Bernard Houngbedji',
    neLe: '1979-04-02',
    naissanceEstimee: false,
    sexe: 'male',
    groupeSanguin: 'O+',
    numeroDossier: 'CSC-000123',
    npi: null,
    allergies: [{ substance: 'Penicilline', reaction: 'Urticaire', criticite: 'high' }],
    problemes: [{ libelle: 'Hypertension arterielle', depuis: '2021-03-01', actif: true }],
    traitements: [{ medicament: 'Amlodipine', dose: '5 mg', depuis: '2021-03-10' }],
    ...extra,
  };
}

describe('dossier medical : ce qui remplace le carnet', () => {
  test('il porte allergies, maladies au long cours et traitements', () => {
    const v = projeterDossierMedical(dossierMedical());
    assert.equal(v.allergies[0].substance, 'Penicilline');
    assert.equal(v.problemes[0].libelle, 'Hypertension arterielle');
    assert.equal(v.traitements[0].medicament, 'Amlodipine');
  });

  test('il ne produit que les cles autorisees, listes comprises', () => {
    const v = projeterDossierMedical(dossierMedical());
    assert.deepEqual(Object.keys(v).sort(), [...CLES_AUTORISEES.dossierMedical].sort());
    assert.deepEqual(Object.keys(v.allergies[0]).sort(), [...CLES_AUTORISEES.allergie].sort());
    assert.deepEqual(Object.keys(v.problemes[0]).sort(), [...CLES_AUTORISEES.probleme].sort());
    assert.deepEqual(Object.keys(v.traitements[0]).sort(), [...CLES_AUTORISEES.traitement].sort());
  });

  test('un champ sensible ajoute aux listes ne traverse pas', () => {
    // Le cas qui compte : une colonne ajoutee a allergy, que le store passe
    // sans y penser. Elle ne doit pas atteindre le telephone.
    const v = projeterDossierMedical(
      dossierMedical({
        allergies: [
          {
            substance: 'Penicilline',
            reaction: 'Urticaire',
            criticite: 'high',
            source_consultation_id: 'c-1',
            atc_code: 'J01CE02',
          },
        ],
      }),
    );
    assert.equal('source_consultation_id' in v.allergies[0], false);
    assert.equal('atc_code' in v.allergies[0], false);
  });
});
