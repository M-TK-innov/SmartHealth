/**
 * Plateau technique : laboratoire et imagerie.
 *
 *   npm test
 *
 * LES CAS QUI COMPTENT, par ordre de ce qu'ils empechent :
 *
 *   - une valeur critique qui dort dans une liste sans que personne ne
 *     l'ait lue ;
 *   - un resultat declare « normal » alors qu'aucun seuil n'a ete pose ;
 *   - deux tubes echanges, qui rendent deux resultats plausibles attribues
 *     a l'envers ;
 *   - un echantillon analyse trop tard, qui fait traiter une anomalie qui
 *     n'existe pas ;
 *   - une correction qui efface la valeur sur laquelle un clinicien a
 *     deja prescrit.
 *
 * Module pur : l'instant est passe en parametre, donc les delais se
 * testent sans attendre.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  acquitter,
  corriger,
  interpreter,
  prelever,
  rendreResultat,
  tensionPlateau,
} from '../lib/hopital/plateau.ts';

const T = (minutes) => new Date(Date.UTC(2026, 9, 26, 8, minutes, 0)).toISOString();

const demande = (extra = {}) => ({
  id: 'd-1',
  patientId: 'p-1',
  domaine: 'laboratoire',
  examen: 'Kaliemie',
  priorite: 'urgente',
  etat: 'demandee',
  demandeeLe: T(0),
  preleveeLe: null,
  ...extra,
});

const SEUILS = [{ examen: 'Kaliemie', unite: 'mmol/l', bas: 2.8, haut: 6.0 }];
const STABILITES = [{ examen: 'Kaliemie', minutes: 60 }];

const IDENTITE = { nom: 'Bernard Houngbedji', naissance: '1968-04-12' };

describe('controle d identite au prelevement', () => {
  test('une identite concordante laisse prelever', () => {
    const d = prelever({
      demande: demande(),
      identiteAnnoncee: IDENTITE,
      identiteDossier: IDENTITE,
      quand: T(10),
    });
    assert.equal(d.ok, true);
    assert.equal(d.resultat.preleveLe, T(10));
  });

  test('un nom qui differe arrete le prelevement', () => {
    const d = prelever({
      demande: demande(),
      identiteAnnoncee: { nom: 'Bernard Hounkpatin', naissance: '1968-04-12' },
      identiteDossier: IDENTITE,
      quand: T(10),
    });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'IDENTITE_DISCORDANTE');
    assert.match(d.remede, /ne pas prelever/i);
  });

  test('une date de naissance qui differe aussi, meme avec le bon nom', () => {
    // Deux homonymes dans un meme service ne sont pas une hypothese
    // d'ecole : c'est l'ordinaire d'une maternite. Le nom seul ne suffit
    // pas a identifier quelqu un.
    const d = prelever({
      demande: demande(),
      identiteAnnoncee: { nom: 'Bernard Houngbedji', naissance: '1992-11-03' },
      identiteDossier: IDENTITE,
      quand: T(10),
    });
    assert.equal(d.motif, 'IDENTITE_DISCORDANTE');
  });

  test('l ordre nom-prenom ne declenche pas une fausse alerte', () => {
    // Une alerte qui se declenche a tort est une alerte qu on apprend a
    // ignorer — et qu on ignorera le jour ou elle a raison.
    const d = prelever({
      demande: demande(),
      identiteAnnoncee: { nom: 'HOUNGBEDJI Bernard', naissance: '1968-04-12' },
      identiteDossier: IDENTITE,
      quand: T(10),
    });
    assert.equal(d.ok, true, 'un prenom annonce en premier reste la meme personne');
  });

  test('une identite vide ne passe jamais pour concordante', () => {
    const d = prelever({
      demande: demande(),
      identiteAnnoncee: { nom: '   ', naissance: '1968-04-12' },
      identiteDossier: { nom: '  ', naissance: '1968-04-12' },
      quand: T(10),
    });
    assert.equal(d.ok, false, 'deux chaines vides ne sont pas une identite verifiee');
  });

  test('on ne preleve pas deux fois sous la meme demande', () => {
    const d = prelever({
      demande: demande({ etat: 'prelevee', preleveeLe: T(5) }),
      identiteAnnoncee: IDENTITE,
      identiteDossier: IDENTITE,
      quand: T(10),
    });
    assert.equal(d.motif, 'DEJA_PRELEVEE');
    assert.match(d.remede, /etiquette|rattachable/i);
  });
});

describe('interpretation', () => {
  test('sans seuil configure, le resultat est non interprete — jamais normal', () => {
    // LE cas. Afficher « normal » faute de seuil est le mensonge le plus
    // couteux qu un logiciel de laboratoire puisse dire.
    assert.equal(interpreter('Ferritine', 12, SEUILS), 'non-interprete');
  });

  test('une valeur dans les bornes est normale', () => {
    assert.equal(interpreter('Kaliemie', 4.1, SEUILS), 'normal');
  });

  test('les bornes elles-memes sont critiques', () => {
    // Frontiere inclusive, et c est voulu : un seuil pose a 6,0 veut dire
    // « a partir de 6,0 on appelle », pas « au-dela de 6,0 ».
    assert.equal(interpreter('Kaliemie', 6.0, SEUILS), 'critique');
    assert.equal(interpreter('Kaliemie', 2.8, SEUILS), 'critique');
    assert.equal(interpreter('Kaliemie', 5.9, SEUILS), 'normal');
  });

  test('une valeur non chiffree n est pas interpretee', () => {
    assert.equal(interpreter('Kaliemie', null, SEUILS), 'non-interprete');
  });

  test('une ligne de seuil SANS AUCUNE BORNE n interprete pas davantage', () => {
    // Le cas qu on n avait pas vu, et le plus trompeur des deux : la ligne
    // existe — l examen est declare, son unite aussi — mais aucune borne
    // n a ete posee. Rendre « normal » laisserait croire que le
    // laboratoire s est prononce, alors qu il a justement choisi de ne pas
    // le faire. La goutte epaisse du jeu de demonstration est exactement
    // dans ce cas.
    const sansBorne = [{ examen: 'Goutte epaisse', unite: 'parasites/ul', bas: null, haut: null }];
    assert.equal(interpreter('Goutte epaisse', 2400, sansBorne), 'non-interprete');
    assert.equal(interpreter('Goutte epaisse', 0, sansBorne), 'non-interprete');
  });

  test('un seuil a une seule borne fonctionne', () => {
    const unSeul = [{ examen: 'Parasitemie', unite: '%', bas: null, haut: 5 }];
    assert.equal(interpreter('Parasitemie', 8, unSeul), 'critique');
    assert.equal(interpreter('Parasitemie', 1, unSeul), 'normal');
  });
});

describe('rendu du resultat', () => {
  const prelevee = demande({ etat: 'prelevee', preleveeLe: T(10) });

  const rendre = (extra = {}) =>
    rendreResultat({
      demande: prelevee,
      valeurNum: 4.2,
      unite: 'mmol/l',
      seuils: SEUILS,
      stabilites: STABILITES,
      quand: T(40),
      ...extra,
    });

  test('un resultat ordinaire passe et n appelle pas de transmission', () => {
    const d = rendre();
    assert.equal(d.ok, true);
    assert.equal(d.resultat.interpretation, 'normal');
    assert.equal(d.resultat.aTransmettre, false);
  });

  test('une valeur critique part « a transmettre »', () => {
    const d = rendre({ valeurNum: 7.2 });
    assert.equal(d.resultat.interpretation, 'critique');
    assert.equal(d.resultat.aTransmettre, true, 'une kaliemie a 7,2 ne se pose pas dans une liste');
  });

  test('on ne rend pas un resultat sans prelevement enregistre', () => {
    const d = rendre({ demande: demande() });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'PAS_PRELEVEE');
    assert.match(d.remede, /identite/i);
  });

  test('un echantillon hors delai de stabilite est refuse', () => {
    // Un tube oublie deux heures rend une kaliemie faussement haute : le
    // potassium sort des hematies. On traiterait une hyperkaliemie qui
    // n existe pas.
    const d = rendre({ quand: T(10 + 61) });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'ECHANTILLON_HORS_DELAI');
    assert.match(d.remede, /reprelever/i);
  });

  test('le delai de stabilite est une frontiere nette', () => {
    assert.equal(rendre({ quand: T(10 + 60) }).ok, true, 'a 60 minutes pile, on rend encore');
    assert.equal(rendre({ quand: T(10 + 61) }).ok, false, 'a 61 minutes, non');
  });

  test('un examen sans stabilite declaree n est pas bloque par le temps', () => {
    // L imagerie n a pas d echantillon : lui appliquer un delai de
    // stabilite bloquerait des comptes rendus relus le lendemain.
    const irm = demande({ domaine: 'imagerie', examen: 'Radiographie thoracique', etat: 'prelevee', preleveeLe: T(10) });
    const d = rendreResultat({
      demande: irm,
      valeurTexte: 'Opacite de la base droite.',
      seuils: SEUILS,
      stabilites: STABILITES,
      quand: T(10 + 600),
    });
    assert.equal(d.ok, true);
    assert.equal(d.resultat.interpretation, 'non-interprete');
  });

  test('un resultat sans aucune valeur est refuse', () => {
    const d = rendre({ valeurNum: null, valeurTexte: '   ' });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'VALEUR_INVALIDE');
  });

  test('un compte rendu redige suffit, sans valeur chiffree', () => {
    const d = rendre({ valeurNum: null, valeurTexte: 'Pas d anomalie decelable.' });
    assert.equal(d.ok, true);
  });

  test('on ne rend pas un resultat sur une demande annulee', () => {
    const d = rendre({ demande: demande({ etat: 'annulee', preleveeLe: T(10) }) });
    assert.equal(d.motif, 'DEMANDE_CLOSE');
  });

  test('un resultat deja valide ne se reecrit pas', () => {
    const d = rendre({ demande: demande({ etat: 'validee', preleveeLe: T(10) }) });
    assert.equal(d.motif, 'RESULTAT_DEJA_VALIDE');
    assert.match(d.remede, /correction|nouvelle version/i);
  });
});

describe('acquittement d une valeur critique', () => {
  const critique = {
    demandeId: 'd-1',
    examen: 'Kaliemie',
    valeurNum: 7.2,
    valeurTexte: null,
    unite: 'mmol/l',
    interpretation: 'critique',
    aTransmettre: true,
    renduLe: T(40),
  };

  test('un destinataire nomme acquitte', () => {
    const d = acquitter(critique, 'Dr Ama Sossou', T(45), 'Jointe par telephone');
    assert.equal(d.ok, true);
    assert.equal(d.resultat.transmisA, 'Dr Ama Sossou');
  });

  test('un acquittement anonyme est refuse', () => {
    // « Transmis » sans destinataire est ce qu on retrouve dans les
    // dossiers apres un accident : la case est cochee, et personne ne se
    // souvient d avoir ete appele.
    const d = acquitter(critique, '   ', T(45));
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'MOTIF_REQUIS');
  });

  test('un resultat ordinaire ne s acquitte pas', () => {
    const d = acquitter({ ...critique, interpretation: 'normal', aTransmettre: false }, 'Dr X', T(45));
    assert.equal(d.ok, false);
  });
});

describe('correction d un resultat', () => {
  const ancien = {
    demandeId: 'd-1',
    examen: 'Kaliemie',
    valeurNum: 7.2,
    valeurTexte: null,
    unite: 'mmol/l',
    interpretation: 'critique',
    aTransmettre: true,
    renduLe: T(40),
  };
  const nouveau = { ...ancien, valeurNum: 4.3, interpretation: 'normal', aTransmettre: false };

  test('l ancienne valeur est conservee', () => {
    // Un clinicien a pu prescrire sur sa foi. L effacer efface aussi la
    // raison de ce qu il a fait.
    const d = corriger(ancien, nouveau, 'Recontrole sur nouvel echantillon');
    assert.equal(d.ok, true);
    assert.equal(d.resultat.remplace.valeurNum, 7.2);
    assert.equal(d.resultat.nouveau.valeurNum, 4.3);
  });

  test('une correction sans motif est refusee', () => {
    const d = corriger(ancien, nouveau, '  ');
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'MOTIF_REQUIS');
  });
});

describe('tension du plateau', () => {
  test('les critiques non transmises sont comptees a part', () => {
    // Le chiffre qui doit etre a zero : il compte des patients dont le
    // resultat dangereux attend dans une liste.
    const demandes = [
      demande({ id: 'a', etat: 'resultat-disponible' }),
      demande({ id: 'b', etat: 'resultat-disponible' }),
      demande({ id: 'c', etat: 'demandee' }),
      demande({ id: 'i', domaine: 'imagerie', etat: 'demandee' }),
    ];
    const resultats = [
      { demandeId: 'a', examen: 'Kaliemie', valeurNum: 7.2, valeurTexte: null, unite: 'mmol/l', interpretation: 'critique', aTransmettre: true, renduLe: T(30) },
      { demandeId: 'b', examen: 'Kaliemie', valeurNum: 7.4, valeurTexte: null, unite: 'mmol/l', interpretation: 'critique', aTransmettre: false, renduLe: T(50) },
    ];

    const t = tensionPlateau('laboratoire', demandes, resultats);
    assert.equal(t.critiquesNonTransmises, 1, 'celle qui est acquittee ne compte plus');
    assert.equal(t.enAttenteDeResultat, 1);
    assert.equal(t.delaiMedianMinutes, 50, 'mediane de 30 et 50 sur deux valeurs');
  });

  test('l imagerie et le laboratoire se comptent separement', () => {
    const demandes = [
      demande({ id: 'a' }),
      demande({ id: 'i', domaine: 'imagerie' }),
    ];
    assert.equal(tensionPlateau('imagerie', demandes, []).demandees, 1);
    assert.equal(tensionPlateau('laboratoire', demandes, []).demandees, 1);
  });
});
