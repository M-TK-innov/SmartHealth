/**
 * Ce qu'un systeme tiers apprend AVANT de s'authentifier.
 *
 *   npm test
 *
 * Le CapabilityStatement est la seule chose que l'API FHIR sert a un appelant
 * anonyme. S'il ne dit pas qu'une authentification est attendue, l'integrateur
 * d'en face recoit un 401 sans savoir quoi presenter, et conclut a une panne du
 * serveur. La declaration doit donc suivre la configuration REELLE : annoncer
 * une authentification la ou l'API est ouverte serait un mensonge, et l'inverse
 * bloquerait l'integration.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { securiteRest } from '../lib/fhir/securite.ts';

describe('declaration de securite du CapabilityStatement', () => {
  test('API ouverte : aucune securite annoncee', () => {
    // Annoncer une authentification qui n'existe pas ferait echouer un
    // integrateur qui la chercherait.
    assert.equal(securiteRest('open'), undefined);
  });

  test('mode session : le droit attendu est nomme', () => {
    const s = securiteRest('session');
    assert.ok(s, 'une securite doit etre declaree');
    assert.match(s.description, /export:read/);
    // On indique aussi la porte de sortie pour un appel serveur a serveur,
    // sinon l'integrateur reste bloque sur un mode qui ne lui convient pas.
    assert.match(s.description, /jeton de service/i);
  });

  test('mode jeton : l en-tete a presenter est donne en clair', () => {
    const s = securiteRest('token');
    assert.ok(s);
    assert.match(s.description, /Authorization: Bearer/);
  });

  test('le vocabulaire FHIR est respecte', () => {
    const coding = securiteRest('token').service[0].coding[0];
    assert.equal(coding.system, 'http://terminology.hl7.org/CodeSystem/restful-security-service');
    // « OAuth » promettrait une negociation que ce serveur n'offre pas : le
    // declarer ferait echouer un client SMART qui suivrait l'annonce.
    assert.notEqual(coding.code, 'OAuth');
    assert.notEqual(coding.code, 'SMART-on-FHIR');
  });

  test('les deux modes fermes se distinguent', () => {
    // Sinon le CapabilityStatement dirait la meme chose quelle que soit la
    // configuration, et ne servirait plus a rien.
    assert.notEqual(securiteRest('session').service[0].text, securiteRest('token').service[0].text);
  });
});
