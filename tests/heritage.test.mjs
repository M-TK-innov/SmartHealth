/**
 * Compatibilite avec l'ancien nom du produit.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE : une base de dossiers medicaux, au moment
 * d'un renommage.
 *
 * Renommer le produit renomme les identifiants qui en derivent — variables
 * d'environnement, nom du fichier de base, dossier de donnees. Chacun de
 * ces renommages, pris seul, fait demarrer l'application SANS ERREUR sur
 * une base vide, a cote d'un fichier plein que plus rien n'ouvre.
 * L'etablissement decouvre la perte en cherchant un patient.
 *
 * Les noms sont assembles a partir des constantes du module, jamais
 * recopies en clair : un remplacement de texte applique a tout le depot a
 * deja efface ce dispositif une fois, en renommant l'ancien nom dans le
 * code meme qui existait pour le reconnaitre.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  FICHIER_ANCIEN,
  FICHIER_COURANT,
  PREFIXE_ANCIEN,
  PREFIXE_COURANT,
  choisirBase,
  messageHeritage,
  reglage,
} from '../lib/heritage.ts';

const ANCIENNE = `${PREFIXE_ANCIEN}_DB`;
const COURANTE = `${PREFIXE_COURANT}_DB`;

describe('les deux noms sont bien distincts', () => {
  test('sinon tout le reste de ce fichier ne verifie rien', () => {
    // Garde-fou : si un renommage futur rend les deux prefixes
    // identiques, la compatibilite devient un alias de soi-meme et les
    // cas ci-dessous passeraient tous sans rien prouver.
    assert.notEqual(PREFIXE_ANCIEN, PREFIXE_COURANT);
    assert.notEqual(FICHIER_ANCIEN, FICHIER_COURANT);
    assert.equal(FICHIER_ANCIEN, PREFIXE_ANCIEN.toLowerCase());
  });
});

describe('variables d environnement', () => {
  test('le nouveau nom est lu', () => {
    assert.equal(reglage('DB', { [COURANTE]: '/data/a.db' }), '/data/a.db');
  });

  test('L ANCIEN NOM EST ENCORE LU', () => {
    // Le cas qui compte. Un script de demarrage ecrit il y a six mois
    // porte l ancien nom ; l ignorer ferait ouvrir une base vide.
    assert.equal(reglage('DB', { [ANCIENNE]: '/data/a.db' }), '/data/a.db');
  });

  test('le nouveau l emporte quand les deux sont poses', () => {
    // Poser le nouveau est un geste delibere ; l ancien peut n etre qu un
    // reste dans un profil utilisateur.
    assert.equal(reglage('DB', { [COURANTE]: '/neuf.db', [ANCIENNE]: '/vieux.db' }), '/neuf.db');
  });

  test('une variable vide ne compte pas', () => {
    // Une variable posee a la chaine vide est un accident de script, pas
    // un choix : on retombe sur l autre plutot que d ouvrir « ».
    assert.equal(reglage('DB', { [COURANTE]: '', [ANCIENNE]: '/vieux.db' }), '/vieux.db');
    assert.equal(reglage('DB', { [COURANTE]: '', [ANCIENNE]: '' }), undefined);
  });

  test('aucune des deux : rien', () => {
    assert.equal(reglage('DB', {}), undefined);
  });
});

describe('choix du fichier de base', () => {
  const NEUF = `/data/${FICHIER_COURANT}.db`;
  const VIEUX = `/data/${FICHIER_ANCIEN}.db`;
  const avec = (...presents) => (c) => presents.includes(c);

  test('la base au nouveau nom est ouverte', () => {
    const c = choisirBase(NEUF, VIEUX, avec(NEUF));
    assert.equal(c.chemin, NEUF);
    assert.equal(c.heritee, false);
  });

  test('LA BASE HERITEE EST REPRISE, PAS IGNOREE', () => {
    // LE cas. Sans lui, la premiere mise a jour apres le renommage ouvre
    // une base vide a cote d un fichier plein.
    const c = choisirBase(NEUF, VIEUX, avec(VIEUX));
    assert.equal(c.chemin, VIEUX, 'la base existante doit etre ouverte');
    assert.equal(c.heritee, true, 'et la reprise doit etre signalee');
  });

  test('quand les deux existent, le nouveau gagne', () => {
    // Les deux presents veut dire que l application a deja tourne sous le
    // nouveau nom : la base recente est celle-la.
    const c = choisirBase(NEUF, VIEUX, avec(NEUF, VIEUX));
    assert.equal(c.chemin, NEUF);
    assert.equal(c.heritee, false);
  });

  test('aucune des deux : on cree au nouveau nom', () => {
    const c = choisirBase(NEUF, VIEUX, avec());
    assert.equal(c.chemin, NEUF);
    assert.equal(c.heritee, false);
  });

  test('l ancienne base n est jamais supprimee ni deplacee', () => {
    // La fonction est PURE : elle ne peut pas toucher au disque, et c est
    // la garantie. Le sort d une base de dossiers medicaux se decide par
    // un responsable, pas par une mise a jour.
    const touches = [];
    choisirBase(NEUF, VIEUX, (c) => {
      touches.push(c);
      return c === VIEUX;
    });
    assert.deepEqual(touches, [NEUF, VIEUX], 'seules des lectures d existence');
  });
});

describe('message de reprise', () => {
  test('il nomme le fichier', () => {
    // « Base heritee reprise » sans chemin ne dit pas quoi sauvegarder.
    const chemin = `/data/${FICHIER_ANCIEN}.db`;
    assert.ok(messageHeritage(chemin).includes(chemin));
  });

  test('il dit quoi faire, et dans quel ordre', () => {
    const m = messageHeritage('/data/x.db');
    assert.match(m, /arretez/i);
    assert.match(m, /sauvegarde/i);
  });
});
