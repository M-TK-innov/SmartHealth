/**
 * Regles des rendez-vous et de la teleconsultation.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE : un planning qui accepte deux patients sur le
 * meme creneau ne se voit pas a l'ecriture. Il se voit le matin, quand deux
 * personnes attendent la meme porte, et il est alors trop tard pour le nier.
 *
 * Et la seconde garantie, qui compte autant : la video ne s'ouvre pas sans
 * l'accord du patient. Un consentement demande apres coup n'en est pas un.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DUREE_MAX,
  DUREE_MIN,
  OUVERTURE_SALLE_MIN,
  occupeLeCreneau,
  peutAnnuler,
  peutConsentir,
  peutDemarrer,
  peutPoser,
  salleOuverte,
  seChevauchent,
} from '../lib/rdv/regles.ts';

const MAINTENANT = '2026-11-10 08:00:00';

function demande(extra = {}) {
  return {
    debut: '2026-11-10 09:00:00',
    dureeMin: 20,
    mode: 'presentiel',
    motif: 'Controle',
    ...extra,
  };
}

function pris(debut, dureeMin = 20, etat = 'confirme') {
  return { id: 'r-' + debut, debut, dureeMin, etat };
}

describe('chevauchement de creneaux', () => {
  test('deux creneaux qui se recouvrent sont en conflit', () => {
    assert.equal(seChevauchent('2026-11-10 09:00:00', 20, '2026-11-10 09:10:00', 20), true);
  });

  test('un creneau qui commence quand l autre finit ne l est pas', () => {
    // Bornes ouvertes a droite : sans cela, un planning serre deviendrait
    // impossible, alors que c'est la norme en consultation.
    assert.equal(seChevauchent('2026-11-10 09:00:00', 20, '2026-11-10 09:20:00', 20), false);
  });

  test('un creneau entierement contenu dans un autre est en conflit', () => {
    assert.equal(seChevauchent('2026-11-10 09:00:00', 60, '2026-11-10 09:20:00', 10), true);
  });
});

describe('poser un rendez-vous', () => {
  test('un creneau libre est accorde', () => {
    const d = peutPoser(demande(), [], MAINTENANT);
    assert.equal(d.ok, true);
  });

  test('UN CRENEAU DEJA PRIS EST REFUSE, et le refus dit l heure du conflit', () => {
    const d = peutPoser(demande(), [pris('2026-11-10 09:10:00')], MAINTENANT);
    assert.equal(d.ok, false);
    // Le motif doit permettre d'agir : sans l'heure, l'agent d'accueil
    // cherche a l'aveugle quel creneau proposer.
    assert.match(d.motif, /09:10/);
  });

  test('un creneau pris par un rendez-vous ANNULE est libre', () => {
    const d = peutPoser(demande(), [pris('2026-11-10 09:10:00', 20, 'annule')], MAINTENANT);
    assert.equal(d.ok, true);
  });

  test('un creneau pris par un patient ABSENT est libre', () => {
    const d = peutPoser(demande(), [pris('2026-11-10 09:10:00', 20, 'absent')], MAINTENANT);
    assert.equal(d.ok, true);
  });

  test('un rendez-vous dans le passe est refuse', () => {
    const d = peutPoser(demande({ debut: '2026-11-09 09:00:00' }), [], MAINTENANT);
    assert.equal(d.ok, false);
    assert.match(d.motif, /passe/i);
  });

  test('une duree hors bornes est refusee', () => {
    assert.equal(peutPoser(demande({ dureeMin: DUREE_MIN - 1 }), [], MAINTENANT).ok, false);
    assert.equal(peutPoser(demande({ dureeMin: DUREE_MAX + 1 }), [], MAINTENANT).ok, false);
  });

  test('une date illisible est refusee plutot qu interpretee', () => {
    assert.equal(peutPoser(demande({ debut: 'demain matin' }), [], MAINTENANT).ok, false);
  });

  test('occupeLeCreneau distingue annule et absent du reste', () => {
    assert.equal(occupeLeCreneau('confirme'), true);
    assert.equal(occupeLeCreneau('en-cours'), true);
    assert.equal(occupeLeCreneau('annule'), false);
    assert.equal(occupeLeCreneau('absent'), false);
  });
});

describe('annuler un rendez-vous', () => {
  test('le motif est exige', () => {
    // Une annulation sans motif ne se distingue pas d'une fausse manoeuvre,
    // et c'est le patient qui appelle pour comprendre.
    assert.equal(peutAnnuler('confirme', null).ok, false);
    assert.equal(peutAnnuler('confirme', '  ').ok, false);
  });

  test('avec un motif, l annulation est accordee et le motif nettoye', () => {
    const d = peutAnnuler('confirme', '  praticien absent  ');
    assert.equal(d.ok, true);
    assert.equal(d.resultat, 'praticien absent');
  });

  test('un rendez-vous honore ne s annule plus', () => {
    assert.equal(peutAnnuler('honore', 'erreur').ok, false);
  });

  test('une consultation en cours se termine, elle ne s annule pas', () => {
    const d = peutAnnuler('en-cours', 'erreur');
    assert.equal(d.ok, false);
    assert.match(d.motif, /en cours/i);
  });
});

describe('accord du patient pour la consultation a distance', () => {
  test('un rendez-vous a distance peut etre consenti', () => {
    assert.equal(peutConsentir('distance', 'confirme', false).ok, true);
  });

  test('un rendez-vous EN PRESENTIEL ne se consent pas', () => {
    // Sinon on laisserait croire qu'un accord a l'enregistrement a ete
    // recueilli, alors qu'il n'a jamais ete demande.
    assert.equal(peutConsentir('presentiel', 'confirme', false).ok, false);
  });

  test('un accord deja donne ne se redonne pas', () => {
    assert.equal(peutConsentir('distance', 'confirme', true).ok, false);
  });

  test('un rendez-vous annule ne se consent pas', () => {
    assert.equal(peutConsentir('distance', 'annule', false).ok, false);
  });
});

describe('ouverture de la salle', () => {
  test('la salle ouvre un quart d heure avant', () => {
    assert.equal(salleOuverte('2026-11-10 09:00:00', 20, '2026-11-10 08:44:00'), false);
    assert.equal(salleOuverte('2026-11-10 09:00:00', 20, '2026-11-10 08:45:00'), true);
    assert.equal(OUVERTURE_SALLE_MIN, 15);
  });

  test('elle reste ouverte apres l heure prevue', () => {
    // Une consultation qui deborde ne doit pas se couper au milieu d'une
    // phrase : la marge est la pour cela.
    assert.equal(salleOuverte('2026-11-10 09:00:00', 20, '2026-11-10 09:45:00'), true);
  });

  test('elle finit par fermer', () => {
    assert.equal(salleOuverte('2026-11-10 09:00:00', 20, '2026-11-10 10:30:00'), false);
  });
});

describe('demarrer la consultation a distance', () => {
  const DEBUT = '2026-11-10 09:00:00';

  test('tout reuni, le praticien peut demarrer', () => {
    assert.equal(peutDemarrer('distance', 'confirme', true, DEBUT, 20, '2026-11-10 08:55:00').ok, true);
  });

  test('SANS ACCORD DU PATIENT, c est refuse', () => {
    // La garantie centrale : on n'ouvre pas la camera chez quelqu'un qui n'a
    // rien accepte.
    const d = peutDemarrer('distance', 'confirme', false, DEBUT, 20, '2026-11-10 08:55:00');
    assert.equal(d.ok, false);
    assert.match(d.motif, /accord/i);
  });

  test('trop tot, c est refuse, et le refus dit quand revenir', () => {
    const d = peutDemarrer('distance', 'confirme', true, DEBUT, 20, '2026-11-10 07:00:00');
    assert.equal(d.ok, false);
    assert.match(d.motif, /15 minutes/);
  });

  test('un rendez-vous en presentiel n ouvre aucune salle', () => {
    assert.equal(
      peutDemarrer('presentiel', 'confirme', true, DEBUT, 20, '2026-11-10 08:55:00').ok,
      false,
    );
  });

  test('un rendez-vous annule n ouvre aucune salle', () => {
    assert.equal(
      peutDemarrer('distance', 'annule', true, DEBUT, 20, '2026-11-10 08:55:00').ok,
      false,
    );
  });
});
