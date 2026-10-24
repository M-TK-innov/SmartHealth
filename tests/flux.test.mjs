/**
 * Flux des patients et files d'attente.
 *
 *   npm test
 *
 * L'INVARIANT : une urgence vitale ne passe jamais derriere un cas moins
 * grave. Ce n'est pas une preference d'ordonnancement, c'est la raison d'etre
 * du triage.
 *
 * La regle d'anciennete est l'endroit ou cet invariant pourrait se perdre :
 * elle existe parce qu'une file strictement par gravite oublie les cas
 * legers un jour d'affluence, mais elle ne doit JAMAIS faire passer un cas
 * leger devant un cas vital. La moitie des cas ci-dessous verifie cette
 * frontiere.
 *
 * Module pur : l'instant est passe en parametre, donc l'attente se teste sans
 * attendre.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ordonner,
  prochain,
  placer,
  appeler,
  terminer,
  marquerParti,
  tension,
  ANCIENNETE_MINUTES,
} from '../lib/hopital/flux.ts';

const T = (minutes) => new Date(Date.UTC(2026, 9, 24, 8, minutes, 0)).toISOString();
const MAINTENANT = T(120);

function passage(extra = {}) {
  return {
    id: 'p-1',
    sejourId: 's-1',
    posteId: 'consultation',
    gravite: 'standard',
    etat: 'en-attente',
    arriveLe: T(0),
    prisEnChargeLe: null,
    termineLe: null,
    ...extra,
  };
}

const ordre = (file, quand = MAINTENANT) => ordonner(file, quand).map((p) => p.id);

describe('ordre de passage', () => {
  test('une urgence vitale passe devant tout le monde', () => {
    // Arrivees recentes a dessein : aucune n atteint le seuil d anciennete,
    // donc ce cas mesure bien l ordre par GRAVITE et rien d autre. Avec des
    // arrivees anciennes il mesurerait les deux regles a la fois.
    const file = [
      passage({ id: 'standard', gravite: 'standard', arriveLe: T(90) }),
      passage({ id: 'urgente', gravite: 'urgente', arriveLe: T(100) }),
      passage({ id: 'vitale', gravite: 'vitale', arriveLe: T(110) }),
    ];
    assert.deepEqual(ordre(file), ['vitale', 'urgente', 'standard']);
  });

  test('un cas tres ancien atteint le rang urgent, et y passe en premier arrive', () => {
    // Consequence assumee de la regle d anciennete : un standard qui attend
    // depuis deux heures est traite au rang urgent, et l ordre d arrivee
    // departage ensuite. Ce qu il ne fait jamais, c est atteindre le rang
    // vital — le cas suivant le verifie.
    const file = [
      passage({ id: 'standard-tres-ancien', gravite: 'standard', arriveLe: T(0) }),
      passage({ id: 'urgente-plus-recente', gravite: 'urgente', arriveLe: T(30) }),
    ];
    assert.deepEqual(ordre(file), ['standard-tres-ancien', 'urgente-plus-recente']);
  });

  test('AUCUNE ANCIENNETE N ATTEINT LE RANG VITAL', () => {
    // Le defaut que ce fichier a trouve dans la premiere version du module :
    // une urgence ayant attendu le seuil remontait AU rang vital et passait
    // devant un arret cardiaque qui venait d entrer. Les deux regles prises
    // separement semblaient pourtant justes.
    const file = [
      passage({ id: 'urgente-ancienne', gravite: 'urgente', arriveLe: T(0) }),
      passage({ id: 'standard-ancien', gravite: 'standard', arriveLe: T(5) }),
      passage({ id: 'vitale-neuve', gravite: 'vitale', arriveLe: T(119) }),
    ];
    assert.equal(ordre(file)[0], 'vitale-neuve');
  });

  test('UNE VITALE NE PASSE JAMAIS DERRIERE, meme arrivee en dernier et meme face a une longue attente', () => {
    // Le cas qui compte. Le differable attend depuis deux heures et sera
    // remonte d'un cran ; la vitale vient d arriver. L ordre ne s inverse pas.
    const file = [
      passage({ id: 'differable-ancien', gravite: 'differable', arriveLe: T(0) }),
      passage({ id: 'vitale-neuve', gravite: 'vitale', arriveLe: T(119) }),
    ];
    assert.equal(ordre(file)[0], 'vitale-neuve');
  });

  test('a gravite egale, le premier arrive passe le premier', () => {
    const file = [
      passage({ id: 'second', arriveLe: T(40) }),
      passage({ id: 'premier', arriveLe: T(10) }),
    ];
    assert.deepEqual(ordre(file), ['premier', 'second']);
  });

  test('les passages deja appeles ou clos ne sont plus dans la file', () => {
    const file = [
      passage({ id: 'en-cours', etat: 'en-cours' }),
      passage({ id: 'termine', etat: 'termine' }),
      passage({ id: 'parti', etat: 'parti' }),
      passage({ id: 'attend' }),
    ];
    assert.deepEqual(ordre(file), ['attend']);
  });

  test('une file vide ne rend personne', () => {
    assert.equal(prochain([], MAINTENANT), null);
    assert.equal(prochain([passage({ etat: 'termine' })], MAINTENANT), null);
  });
});

describe('la regle d anciennete', () => {
  test('un cas oublie remonte d un cran apres le seuil', () => {
    // Sans cette regle, un differable un jour d affluence reste derriere
    // chaque nouvel arrivant plus grave, et repart le soir sans etre vu.
    const file = [
      passage({ id: 'standard-neuf', gravite: 'standard', arriveLe: T(115) }),
      passage({ id: 'differable-ancien', gravite: 'differable', arriveLe: T(0) }),
    ];
    assert.deepEqual(ordre(file), ['differable-ancien', 'standard-neuf']);
  });

  test('elle ne fait gagner QU UN cran', () => {
    // Le differable ancien remonte au niveau standard, pas au niveau urgent.
    const file = [
      passage({ id: 'urgente-neuve', gravite: 'urgente', arriveLe: T(115) }),
      passage({ id: 'differable-ancien', gravite: 'differable', arriveLe: T(0) }),
    ];
    assert.deepEqual(ordre(file), ['urgente-neuve', 'differable-ancien']);
  });

  test('juste avant le seuil, rien ne bouge', () => {
    const file = [
      passage({ id: 'standard-neuf', gravite: 'standard', arriveLe: T(119) }),
      passage({ id: 'differable', gravite: 'differable', arriveLe: T(120 - ANCIENNETE_MINUTES + 1) }),
    ];
    assert.deepEqual(ordre(file), ['standard-neuf', 'differable']);
  });

  test('une vitale ne remonte pas : elle est deja au sommet', () => {
    const classes = ordonner([passage({ gravite: 'vitale', arriveLe: T(0) })], MAINTENANT);
    assert.equal(classes[0].remonte, false);
  });

  test('une vitale qui attend depuis longtemps reste premiere', () => {
    // Elle ne doit pas seulement « ne pas remonter » : elle ne doit pas non
    // plus etre RETROGRADEE par le calcul d anciennete. Un service deborde
    // est precisement le cas ou une vitale attend — et celui ou l inverser
    // couterait le plus cher.
    // L urgente est arrivee AVANT elle : si le calcul retrogradait la vitale
    // au rang de l urgente, l ordre d arrivee la ferait passer en second.
    const file = [
      passage({ id: 'urgente-arrivee-avant', gravite: 'urgente', arriveLe: T(0) }),
      passage({ id: 'vitale-qui-attend', gravite: 'vitale', arriveLe: T(5) }),
    ];
    assert.equal(ordre(file)[0], 'vitale-qui-attend');
  });

  test('l attente est calculee, et remontee avec le passage', () => {
    const classes = ordonner([passage({ arriveLe: T(45) })], MAINTENANT);
    assert.equal(classes[0].attenteMinutes, 75);
  });
});

describe('placer un patient dans une file', () => {
  test('un patient present est place', () => {
    const d = placer({ sejourId: 's-1', posteId: 'caisse', gravite: 'standard', sejourPresent: true, passagesOuverts: [], quand: T(0) });
    assert.equal(d.ok, true);
    assert.equal(d.resultat.etat, 'en-attente');
    assert.equal(d.resultat.posteId, 'caisse');
  });

  test('un patient non admis n entre pas dans une file', () => {
    const d = placer({ sejourId: 's-1', posteId: 'caisse', gravite: 'standard', sejourPresent: false, passagesOuverts: [], quand: T(0) });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'SEJOUR_NON_PRESENT');
  });

  test('un patient n attend pas a deux endroits a la fois', () => {
    // Sinon la file afficherait un patient que le poste ne verra pas venir,
    // et l attente mesuree serait fausse aux deux endroits.
    const d = placer({
      sejourId: 's-1', posteId: 'caisse', gravite: 'standard', sejourPresent: true,
      passagesOuverts: [passage({ posteId: 'consultation' })], quand: T(0),
    });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'DEJA_EN_ATTENTE');
  });

  test('un patient en cours de prise en charge n est pas place ailleurs', () => {
    const d = placer({
      sejourId: 's-1', posteId: 'caisse', gravite: 'standard', sejourPresent: true,
      passagesOuverts: [passage({ posteId: 'consultation', etat: 'en-cours' })], quand: T(0),
    });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'DEJA_EN_COURS');
  });

  test('un passage clos ne bloque pas un nouveau placement', () => {
    const d = placer({
      sejourId: 's-1', posteId: 'caisse', gravite: 'standard', sejourPresent: true,
      passagesOuverts: [passage({ etat: 'termine' }), passage({ id: 'p-2', etat: 'parti' })], quand: T(0),
    });
    assert.equal(d.ok, true);
  });
});

describe('cycle d un passage', () => {
  test('appeler puis terminer', () => {
    const a = appeler(passage(), T(10));
    assert.equal(a.ok, true);
    assert.equal(a.resultat.etat, 'en-cours');
    assert.equal(a.resultat.prisEnChargeLe, T(10));

    const t = terminer(a.resultat, T(25));
    assert.equal(t.ok, true);
    assert.equal(t.resultat.etat, 'termine');
  });

  test('on ne termine pas un passage qui n a pas ete appele', () => {
    const t = terminer(passage(), T(10));
    assert.equal(t.ok, false);
    assert.equal(t.motif, 'PAS_EN_COURS');
    assert.match(t.remede, /appeler/i);
  });

  test('un passage clos ne se retermine pas', () => {
    assert.equal(terminer(passage({ etat: 'termine' }), T(30)).motif, 'PASSAGE_CLOS');
  });

  test('un patient parti n est pas « termine »', () => {
    // La part de patients qui repartent avant d etre appeles est l indicateur
    // le plus direct d un poste sature. L enregistrer comme « termine » le
    // ferait disparaitre de cette mesure.
    const p = marquerParti(passage(), T(90));
    assert.equal(p.ok, true);
    assert.equal(p.resultat.etat, 'parti');
    assert.notEqual(p.resultat.etat, 'termine');
  });
});

describe('tension d un poste', () => {
  const file = [
    passage({ id: 'a', arriveLe: T(0), gravite: 'differable' }),
    passage({ id: 'b', arriveLe: T(90) }),
    passage({ id: 'c', arriveLe: T(110) }),
    passage({ id: 'd', etat: 'en-cours' }),
    passage({ id: 'e', etat: 'parti' }),
    passage({ id: 'f', posteId: 'caisse' }),
  ];

  test('les chiffres du poste ne comptent que ses propres passages', () => {
    const t = tension('consultation', file, MAINTENANT);
    assert.equal(t.enAttente, 3);
    assert.equal(t.enCours, 1);
    assert.equal(t.partis, 1);
  });

  test('l attente maximale est celle du patient le plus ancien', () => {
    assert.equal(tension('consultation', file, MAINTENANT).attenteMaxMinutes, 120);
  });

  test('les cas remontes sont comptes : un poste qui en accumule est sature', () => {
    assert.equal(tension('consultation', file, MAINTENANT).remontes, 1);
  });

  test('un poste vide ne divise pas par zero', () => {
    const t = tension('vide', [], MAINTENANT);
    assert.equal(t.attenteMaxMinutes, 0);
    assert.equal(t.attenteMedianeMinutes, 0);
  });
});
