/**
 * Localisation de l'etablissement.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE :
 *
 *   - qu'un etablissement ait UNE journee. Prendre le fuseau du
 *     navigateur serait plus automatique encore, et ferait voir a deux
 *     agents du meme service deux journees differentes : l'un la file
 *     d'hier, l'autre celle d'aujourd'hui ;
 *   - qu'un poste mal regle soit SIGNALE. Il affiche des heures fausses
 *     partout — admission, prelevement, incision — et le soignant n'a
 *     aucun moyen de s'en apercevoir par lui-meme ;
 *   - qu'un fuseau non reconnu ne se substitue jamais en silence au
 *     fuseau detecte.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  FUSEAU_DEFAUT,
  ecartMinutes,
  formaterInstant,
  fuseauValide,
  remarquerEcart,
  resoudreFuseau,
} from '../lib/localisation.ts';

const JANVIER = new Date('2026-01-15T12:00:00Z');
const JUILLET = new Date('2026-07-15T12:00:00Z');

describe('validite d un fuseau', () => {
  test('les fuseaux connus passent', () => {
    for (const z of ['UTC', 'Africa/Porto-Novo', 'America/Lima', 'Europe/Paris']) {
      assert.equal(fuseauValide(z), true, z);
    }
  });

  test('tout le reste est refuse', () => {
    for (const z of ['', '   ', 'Mars/Olympus', 'UTC+1', null, undefined, 42]) {
      assert.equal(fuseauValide(z), false, String(z));
    }
  });
});

describe('resolution du fuseau', () => {
  test('la machine suffit : rien a saisir a l installation', () => {
    // La plateforme se localise seule. Le serveur tourne dans
    // l'etablissement, donc la machine sait ou elle est.
    const l = resoudreFuseau({ detecte: 'Africa/Porto-Novo' });
    assert.equal(l.fuseau, 'Africa/Porto-Novo');
    assert.equal(l.source, 'detecte');
  });

  test('un reglage pose l emporte', () => {
    // Le cas d un serveur mutualise, ou d une demonstration servie depuis
    // un centre de donnees lointain.
    const l = resoudreFuseau({ configure: 'Africa/Porto-Novo', detecte: 'Europe/Paris' });
    assert.equal(l.fuseau, 'Africa/Porto-Novo');
    assert.equal(l.source, 'configure');
  });

  test('UN REGLAGE INVALIDE NE SE SUBSTITUE PAS EN SILENCE', () => {
    // Le cas qui compte. Un fuseau mal saisi doit laisser la detection
    // faire son travail, sans quoi toutes les dates de l'application
    // basculeraient sur un repli que personne n'a choisi.
    const l = resoudreFuseau({ configure: 'Afrique/Cotonou', detecte: 'Africa/Porto-Novo' });
    assert.equal(l.fuseau, 'Africa/Porto-Novo');
    assert.equal(l.source, 'detecte');
  });

  test('rien de connu : UTC, et la source le dit', () => {
    const l = resoudreFuseau({});
    assert.equal(l.fuseau, FUSEAU_DEFAUT);
    assert.equal(l.source, 'defaut');
  });

  test('une detection invalide ne passe pas non plus', () => {
    assert.equal(resoudreFuseau({ detecte: 'Mars/Olympus' }).source, 'defaut');
  });
});

describe('ecart entre deux fuseaux', () => {
  test('une heure entre Cotonou et Greenwich', () => {
    assert.equal(ecartMinutes('Africa/Porto-Novo', 'UTC', JANVIER), 60);
    assert.equal(ecartMinutes('UTC', 'Africa/Porto-Novo', JANVIER), -60);
  });

  test('aucun ecart avec soi-meme', () => {
    assert.equal(ecartMinutes('Africa/Porto-Novo', 'Africa/Porto-Novo', JANVIER), 0);
  });

  test("L ECART DEPEND DE L INSTANT, a cause de l heure d ete", () => {
    // Paris est a +1 en janvier et a +2 en juillet. Un ecart calcule une
    // fois pour toutes serait faux la moitie de l'annee — et le serait
    // justement pendant les mois ou l'on travaille le plus tard.
    assert.equal(ecartMinutes('Europe/Paris', 'UTC', JANVIER), 60);
    assert.equal(ecartMinutes('Europe/Paris', 'UTC', JUILLET), 120);

    // Cotonou ne change pas d'heure : l'ecart avec Paris, lui, varie.
    assert.equal(ecartMinutes('Europe/Paris', 'Africa/Porto-Novo', JANVIER), 0);
    assert.equal(ecartMinutes('Europe/Paris', 'Africa/Porto-Novo', JUILLET), 60);
  });

  test('les fuseaux a l ouest rendent un ecart negatif', () => {
    assert.equal(ecartMinutes('America/Lima', 'UTC', JANVIER), -300);
  });

  test('un fuseau inconnu ne fait pas inventer un ecart', () => {
    assert.equal(ecartMinutes('Mars/Olympus', 'UTC', JANVIER), 0);
  });
});

describe('poste mal regle', () => {
  test('un poste a l heure ne declenche rien', () => {
    assert.equal(remarquerEcart('Africa/Porto-Novo', 'Africa/Porto-Novo', JANVIER), null);
  });

  test('une heure d ecart est une remarque', () => {
    const r = remarquerEcart('Africa/Porto-Novo', 'UTC', JANVIER);
    assert.equal(r.niveau, 'remarque');
    assert.equal(r.ecartMinutes, -60);
    assert.match(r.message, /en retard/);
    assert.match(r.message, /Africa\/Porto-Novo/);
  });

  test('AU-DELA D UNE HEURE, C EST LIMITANT', () => {
    // Une demi-heure se repere a l'oeil sur une journee de travail. Cinq
    // heures ne se reperent pas, et c'est alors la chronologie du dossier
    // qui devient trompeuse.
    const r = remarquerEcart('Africa/Porto-Novo', 'America/Lima', JANVIER);
    assert.equal(r.niveau, 'limitant');
    assert.match(r.message, /en retard/);
  });

  test('la frontiere est nette a une heure', () => {
    assert.equal(remarquerEcart('UTC', 'Africa/Porto-Novo', JANVIER).niveau, 'remarque');
    assert.equal(remarquerEcart('UTC', 'Europe/Paris', JUILLET).niveau, 'limitant');
  });

  test('le remede dit que les heures affichees sont fausses', () => {
    // Sans cette phrase, on corrige le fuseau et on continue a lire les
    // heures deja affichees comme si elles etaient bonnes.
    const r = remarquerEcart('Africa/Porto-Novo', 'UTC', JANVIER);
    assert.match(r.remede, /heures affichees/i);
  });

  test('un poste qui ne declare pas son fuseau ne declenche rien', () => {
    // On ne reproche pas a un navigateur de se taire.
    assert.equal(remarquerEcart('Africa/Porto-Novo', null, JANVIER), null);
    assert.equal(remarquerEcart('Africa/Porto-Novo', 'Mars/Olympus', JANVIER), null);
  });
});

describe('affichage a l heure de l etablissement', () => {
  const INSTANT = '2026-10-27T07:05:00.000Z';

  test('l heure affichee est celle du service, pas celle du navigateur', () => {
    assert.equal(formaterInstant(INSTANT, 'Africa/Porto-Novo', 'heure'), '08:05');
    assert.equal(formaterInstant(INSTANT, 'UTC', 'heure'), '07:05');
    assert.equal(formaterInstant(INSTANT, 'America/Lima', 'heure'), '02:05');
  });

  test('la forme SQLite est lue comme de l UTC', () => {
    // Les deux formes cohabitent en base et designent le meme instant.
    assert.equal(
      formaterInstant('2026-10-27 07:05:00', 'Africa/Porto-Novo', 'heure'),
      formaterInstant(INSTANT, 'Africa/Porto-Novo', 'heure'),
    );
  });

  test('la date peut franchir le jour selon le fuseau', () => {
    // 23 h 30 UTC le 26 est deja le 27 a Cotonou. L'ecran doit montrer le
    // jour du service.
    assert.equal(formaterInstant('2026-10-26T23:30:00Z', 'Africa/Porto-Novo', 'date'), '27/10/2026');
    assert.equal(formaterInstant('2026-10-26T23:30:00Z', 'UTC', 'date'), '26/10/2026');
  });

  test('un fuseau invalide retombe sur UTC plutot que sur le navigateur', () => {
    assert.equal(formaterInstant(INSTANT, 'Mars/Olympus', 'heure'), '07:05');
  });

  test('une valeur absente ou illisible rend une chaine vide', () => {
    // Pas « Invalid Date » dans un dossier medical.
    for (const v of [null, undefined, '', 'hier matin']) {
      assert.equal(formaterInstant(v, 'UTC'), '');
    }
  });
});
