/**
 * Le sejour hospitalier : admission, transfert, sortie.
 *
 *   npm test
 *
 * Ce qui est verifie ici tient en une phrase : **deux patients ne peuvent pas
 * se retrouver dans le meme lit**. Ce n'est pas une incoherence de base de
 * donnees, c'est un brancard dans un couloir a trois heures du matin, ou pire,
 * un acte pratique sur la mauvaise personne.
 *
 * Le reste des cas protege les chemins par lesquels cette collision pourrait
 * revenir : un lit laisse « libre » par un incident alors qu'un sejour le
 * declare, un transfert vers un lit deja pris, une sortie qui ne libere rien.
 *
 * Module pur : teste tel qu'il tourne.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  admettre,
  transferer,
  fairesortir,
  litAttribuable,
  occupation,
  dureeJours,
} from '../lib/hopital/sejour.ts';

const QUAND = '2026-10-24T09:00:00.000Z';

function lit(extra = {}) {
  return { id: 'lit-1', code: 'MED-12-A', uniteId: 'med', chambreId: 'ch-12', etat: 'libre', isolement: false, ...extra };
}

function sejour(extra = {}) {
  return { id: 's-1', patientId: 'p-1', type: 'hospitalisation', statut: 'prevu', litId: null, admisLe: null, sortiLe: null, ...extra };
}

describe('admission', () => {
  test('un patient attendu est admis et installe', () => {
    const d = admettre({ sejour: sejour(), lit: lit(), sejoursEnCours: [], quand: QUAND });
    assert.equal(d.ok, true);
    assert.equal(d.resultat.sejour.statut, 'en-cours');
    assert.equal(d.resultat.sejour.litId, 'lit-1');
    assert.equal(d.resultat.sejour.admisLe, QUAND);
    assert.equal(d.resultat.lit.etat, 'occupe');
  });

  test('UN LIT NE PORTE PAS DEUX PATIENTS', () => {
    // L'invariant central. Tout le reste du module existe pour le tenir.
    const occupant = sejour({ id: 's-autre', patientId: 'p-2', statut: 'en-cours', litId: 'lit-1' });
    const d = admettre({ sejour: sejour(), lit: lit(), sejoursEnCours: [occupant], quand: QUAND });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'LIT_DEJA_OCCUPE');
    assert.match(d.message, /MED-12-A/, 'le message doit nommer le lit, sinon l agent cherche');
  });

  test('un lit dit « libre » mais declare par un sejour reste refuse', () => {
    // L'etat du lit est une donnee DERIVEE : un incident peut l'avoir laissee
    // en arriere. Ce qui fait foi, c'est le sejour. Se fier au seul champ
    // « etat » laisserait passer exactement la collision qu'on empeche.
    const occupant = sejour({ id: 's-autre', patientId: 'p-2', statut: 'en-cours', litId: 'lit-1' });
    const d = admettre({ sejour: sejour(), lit: lit({ etat: 'libre' }), sejoursEnCours: [occupant], quand: QUAND });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'LIT_DEJA_OCCUPE');
  });

  test('un lit hors service n est pas attribuable', () => {
    const d = admettre({ sejour: sejour(), lit: lit({ etat: 'hors-service' }), sejoursEnCours: [], quand: QUAND });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'LIT_HORS_SERVICE');
  });

  test('un lit libere mais non prepare n est pas attribuable', () => {
    // Un lit qui vient d etre occupe n est pas pret. Le rendre « libre »
    // inviterait a y installer le patient suivant avant le nettoyage.
    const d = admettre({ sejour: sejour(), lit: lit({ etat: 'a-preparer' }), sejoursEnCours: [], quand: QUAND });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'LIT_A_PREPARER');
  });

  test('un patient deja present n est pas readmis', () => {
    const d = admettre({ sejour: sejour({ statut: 'en-cours', litId: 'lit-9' }), lit: lit(), sejoursEnCours: [], quand: QUAND });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'PATIENT_DEJA_PRESENT');
    assert.match(d.remede, /transfert/i, 'le remede doit orienter vers le transfert');
  });

  test('un sejour clos ne se rouvre pas', () => {
    const d = admettre({ sejour: sejour({ statut: 'sorti' }), lit: lit(), sejoursEnCours: [], quand: QUAND });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'SEJOUR_CLOS');
  });

  test('un sejour externe est admis sans lit', () => {
    const d = admettre({ sejour: sejour({ type: 'externe' }), sejoursEnCours: [], quand: QUAND });
    assert.equal(d.ok, true);
    assert.equal(d.resultat.lit, null);
    assert.equal(d.resultat.sejour.litId, null);
  });

  test('un sejour externe ne prend pas de lit, meme si on lui en donne un', () => {
    // Lui en reserver un immobiliserait une place pour quelqu un qui repart
    // dans l heure.
    const d = admettre({ sejour: sejour({ type: 'externe' }), lit: lit(), sejoursEnCours: [], quand: QUAND });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'EXTERNE_SANS_LIT');
  });

  test('une hospitalisation sans lit est refusee', () => {
    const d = admettre({ sejour: sejour(), sejoursEnCours: [], quand: QUAND });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'EXTERNE_SANS_LIT');
  });
});

describe('transfert', () => {
  const present = () => sejour({ statut: 'en-cours', litId: 'lit-1', admisLe: QUAND });

  test('le lit quitte repasse « a preparer », jamais « libre »', () => {
    const d = transferer({
      sejour: present(),
      litCible: lit({ id: 'lit-2', code: 'MED-14-A' }),
      sejoursEnCours: [present()],
      quand: QUAND,
    });
    assert.equal(d.ok, true);
    assert.equal(d.resultat.litQuitte, 'lit-1');
    assert.equal(d.resultat.sejour.litId, 'lit-2');
    assert.equal(d.resultat.litPris.etat, 'occupe');
  });

  test('on ne transfere pas vers un lit occupe', () => {
    const autre = sejour({ id: 's-autre', patientId: 'p-2', statut: 'en-cours', litId: 'lit-2' });
    const d = transferer({
      sejour: present(),
      litCible: lit({ id: 'lit-2', code: 'MED-14-A' }),
      sejoursEnCours: [present(), autre],
      quand: QUAND,
    });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'LIT_DEJA_OCCUPE');
  });

  test('transferer vers le lit deja occupe par le patient ne fait rien', () => {
    const d = transferer({ sejour: present(), litCible: lit(), sejoursEnCours: [present()], quand: QUAND });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'LIT_INCHANGE');
  });

  test('un patient non admis ne se transfere pas', () => {
    const d = transferer({ sejour: sejour(), litCible: lit({ id: 'lit-2' }), sejoursEnCours: [], quand: QUAND });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'PAS_ENCORE_ADMIS');
  });
});

describe('sortie', () => {
  const present = () => sejour({ statut: 'en-cours', litId: 'lit-1', admisLe: QUAND });

  test('la sortie clot le sejour et rend le lit', () => {
    const d = fairesortir({ sejour: present(), quand: '2026-10-26T11:00:00.000Z' });
    assert.equal(d.ok, true);
    assert.equal(d.resultat.sejour.statut, 'sorti');
    assert.equal(d.resultat.sejour.litId, null, 'le sejour ne doit plus declarer de lit');
    assert.equal(d.resultat.litLibere, 'lit-1');
  });

  test('un patient deja sorti ne ressort pas', () => {
    const d = fairesortir({ sejour: sejour({ statut: 'sorti' }), quand: QUAND });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'SEJOUR_CLOS');
  });

  test('un patient jamais admis ne sort pas', () => {
    const d = fairesortir({ sejour: sejour(), quand: QUAND });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'PAS_ENCORE_ADMIS');
  });

  test('une sortie anterieure a l admission est refusee', () => {
    // Une saisie a rebours fausserait la duree de sejour, donc la statistique
    // et la facturation.
    const d = fairesortir({ sejour: present(), quand: '2026-10-23T08:00:00.000Z' });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'DATE_INCOHERENTE');
  });

  test('un sejour externe se clot sans liberer de lit', () => {
    const d = fairesortir({ sejour: sejour({ type: 'externe', statut: 'en-cours', admisLe: QUAND }), quand: QUAND });
    assert.equal(d.ok, true);
    assert.equal(d.resultat.litLibere, null);
  });
});

describe('occupation d une unite', () => {
  const parc = [
    lit({ id: 'a', code: 'MED-1', etat: 'occupe' }),
    lit({ id: 'b', code: 'MED-2', etat: 'libre' }),
    lit({ id: 'c', code: 'MED-3', etat: 'a-preparer' }),
    lit({ id: 'd', code: 'MED-4', etat: 'hors-service' }),
    lit({ id: 'e', code: 'CHIR-1', uniteId: 'chir', etat: 'libre' }),
  ];
  const occupants = [sejour({ id: 's-a', statut: 'en-cours', litId: 'a' })];

  test('les lits hors service sortent du denominateur', () => {
    // Les compter ferait paraitre une unite saturee moins pleine qu elle ne
    // l est — or c est le chiffre sur lequel on decide d ouvrir une place.
    const o = occupation('med', parc, occupants);
    assert.equal(o.total, 4);
    assert.equal(o.horsService, 1);
    assert.equal(o.occupes, 1);
    assert.equal(o.tauxOccupation, 33, '1 occupe sur 3 utilisables');
  });

  test('les lits a preparer ne comptent pas comme libres', () => {
    const o = occupation('med', parc, occupants);
    assert.equal(o.aPreparer, 1);
    assert.equal(o.libres, 1);
  });

  test('une unite sans lit utilisable ne divise pas par zero', () => {
    const o = occupation('vide', [lit({ id: 'z', uniteId: 'vide', etat: 'hors-service' })], []);
    assert.equal(o.tauxOccupation, 0);
  });

  test('une autre unite n est pas comptee', () => {
    assert.equal(occupation('chir', parc, occupants).total, 1);
  });
});

describe('duree de sejour', () => {
  test('une nuit compte pour un jour', () => {
    // Convention des statistiques hospitalieres, et celle que suit la
    // facturation. Rendre 0 serait faux des deux points de vue.
    assert.equal(dureeJours('2026-10-24T20:00:00.000Z', '2026-10-25T08:00:00.000Z'), 1);
  });

  test('deux jours pleins comptent pour deux', () => {
    assert.equal(dureeJours('2026-10-24T08:00:00.000Z', '2026-10-26T08:00:00.000Z'), 2);
  });

  test('une sortie le jour meme compte pour un jour', () => {
    assert.equal(dureeJours('2026-10-24T08:00:00.000Z', '2026-10-24T18:00:00.000Z'), 1);
  });

  test('des dates incoherentes rendent zero plutot qu un nombre negatif', () => {
    assert.equal(dureeJours('2026-10-26T08:00:00.000Z', '2026-10-24T08:00:00.000Z'), 0);
    assert.equal(dureeJours('pas une date', '2026-10-24T08:00:00.000Z'), 0);
  });
});

describe('attribution directe d un lit', () => {
  test('un lit libre et sans occupant est attribuable', () => {
    assert.equal(litAttribuable(lit(), []).ok, true);
  });
});
