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
  ordonnanceMontrable,
  projeterFacture,
  projeterOrdonnance,
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
