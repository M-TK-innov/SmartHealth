/**
 * Signalisation de la consultation a distance.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE : un pair qui se relit lui-meme. C'est le defaut
 * classique d'une boite partagee — le praticien recoit sa propre offre, la
 * prend pour celle d'en face, et repond a lui-meme. La consultation reste
 * noire des deux cotes, et rien dans les journaux ne le dit.
 *
 * Et la seconde garantie : aucun serveur externe par defaut. Une application
 * de sante qui pointerait d'office vers un service public installerait une
 * dependance que personne n'a choisie, et ferait fuir l'adresse des pairs.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  boitesOuvertes,
  deposer,
  fermer,
  relaisDisponible,
  relever,
  serveursGlace,
} from '../lib/teleconsultation/signal.ts';

describe('la boite ne renvoie jamais a l expediteur', () => {
  test('le praticien ne releve pas ce qu il a depose', () => {
    const salle = 's-' + Math.random();
    deposer(salle, 'praticien', { type: 'offer' });
    const r = relever(salle, 'praticien', 0);
    assert.deepEqual(r.messages, []);
    fermer(salle);
  });

  test('le patient releve ce que le praticien a depose', () => {
    const salle = 's-' + Math.random();
    deposer(salle, 'praticien', { type: 'offer', sdp: 'x' });
    const r = relever(salle, 'patient', 0);
    assert.equal(r.messages.length, 1);
    assert.deepEqual(r.messages[0].charge, { type: 'offer', sdp: 'x' });
    fermer(salle);
  });

  test('le curseur evite de relever deux fois la meme chose', () => {
    const salle = 's-' + Math.random();
    deposer(salle, 'praticien', { n: 1 });
    const a = relever(salle, 'patient', 0);
    assert.equal(a.messages.length, 1);

    const b = relever(salle, 'patient', a.curseur);
    assert.equal(b.messages.length, 0, 'rien de neuf depuis le curseur');

    deposer(salle, 'praticien', { n: 2 });
    const c = relever(salle, 'patient', a.curseur);
    assert.equal(c.messages.length, 1);
    assert.deepEqual(c.messages[0].charge, { n: 2 });
    fermer(salle);
  });

  test('deux salles ne se melangent pas', () => {
    const a = 's-' + Math.random();
    const b = 's-' + Math.random();
    deposer(a, 'praticien', { salle: 'a' });
    assert.equal(relever(b, 'patient', 0).messages.length, 0);
    fermer(a);
    fermer(b);
  });

  test('une salle inconnue ne fait pas d erreur, elle est simplement vide', () => {
    const r = relever('salle-qui-n-existe-pas', 'patient', 0);
    assert.deepEqual(r.messages, []);
    assert.equal(r.curseur, 0);
  });
});

describe('la boite ne grossit pas sans fin', () => {
  test('une boite oubliee est nettoyee', () => {
    const salle = 's-' + Math.random();
    const t0 = 1_000_000;
    deposer(salle, 'praticien', { n: 1 }, t0);
    const avant = boitesOuvertes();
    assert.ok(avant >= 1);

    // Une negociation dure quelques secondes ; une demi-heure plus tard, la
    // boite ne sert plus a rien et sa presence signale une fuite.
    deposer('autre-salle', 'praticien', {}, t0 + 31 * 60 * 1000);
    assert.equal(relever(salle, 'patient', 0, t0 + 31 * 60 * 1000).messages.length, 0);
    fermer('autre-salle');
  });

  test('un deluge de messages garde les DERNIERS', () => {
    // Une negociation qui dure a besoin de ses candidats recents ; jeter les
    // nouveaux pour garder les vieux bloquerait la liaison.
    const salle = 's-' + Math.random();
    for (let i = 1; i <= 260; i += 1) deposer(salle, 'praticien', { i });
    const r = relever(salle, 'patient', 0);
    assert.equal(r.messages.length <= 200, true);
    assert.deepEqual(r.messages[r.messages.length - 1].charge, { i: 260 });
    fermer(salle);
  });
});

describe('aucun serveur externe par defaut', () => {
  test('sans reglage, la liste est vide', () => {
    assert.deepEqual(serveursGlace({}), []);
    assert.equal(relaisDisponible({}), false);
  });

  test('un relais declare est repris avec ses identifiants', () => {
    const s = serveursGlace({
      SMARTHEALTH_STUN_URL: 'stun:stun.local:3478',
      SMARTHEALTH_TURN_URL: 'turn:relais.local:3478',
      SMARTHEALTH_TURN_USER: 'centre',
      SMARTHEALTH_TURN_PASS: 'secret',
    });
    assert.equal(s.length, 2);
    assert.equal(s[0].urls, 'stun:stun.local:3478');
    assert.equal(s[1].username, 'centre');
    assert.equal(relaisDisponible({ SMARTHEALTH_TURN_URL: 'turn:relais.local:3478' }), true);
  });

  test('un reglage vide ne compte pas pour un reglage', () => {
    // Une variable presente mais vide est une erreur de configuration, pas
    // une declaration : la traiter comme un relais ferait echouer la liaison
    // en silence.
    assert.deepEqual(serveursGlace({ SMARTHEALTH_TURN_URL: '   ' }), []);
    assert.equal(relaisDisponible({ SMARTHEALTH_TURN_URL: '   ' }), false);
  });
});
