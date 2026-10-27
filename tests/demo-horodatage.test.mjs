/**
 * Horodatages relatifs du jeu de demonstration.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE : qu'une demonstration ouverte dans trois
 * semaines reste credible. Avec des dates figees, elle afficherait un
 * patient qui attend depuis 31 680 minutes, une hospitalisation de
 * vingt-deux jours et un programme operatoire du mois dernier — c'est-a-
 * dire que tout ce que l'application sait mesurer deviendrait absurde.
 *
 * Et la contrepartie : une date de naissance ne bouge pas. Un patient ne
 * rajeunit pas parce qu'on redemarre le serveur, et son age commande une
 * posologie pediatrique.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLONNES_FIGEES,
  HORIZON_JOURS,
  enJeton,
  resoudre,
} from '../lib/demo/horodatage.ts';

const REFERENCE = new Date('2026-10-26T12:00:00Z');

describe('mise en jeton', () => {
  test('un horodatage devient un decalage en minutes', () => {
    assert.equal(enJeton('2026-10-26 11:15:00', REFERENCE, 'arrive_le'), '{{T-45}}');
    assert.equal(enJeton('2026-10-26 13:00:00', REFERENCE, 'debut_prevu'), '{{T+60}}');
  });

  test('la FORME d origine est conservee', () => {
    // Le defaut qui a vide le programme du bloc : un vidage rendait en
    // forme SQLite ce que la colonne contenait en ISO. Les deux designent
    // le meme instant mais ne se comparent pas comme des chaines —
    // l'espace precede le « T » dans l'ordre lexical — et la requete de
    // plage ne trouvait plus rien.
    assert.equal(enJeton('2026-10-26 11:15:00', REFERENCE, 'arrive_le'), '{{T-45}}');
    assert.equal(enJeton('2026-10-26T11:15:00.000Z', REFERENCE, 'debut_prevu'), '{{I-45}}');
  });

  test('une date seule devient un decalage en jours', () => {
    // « perime dans 21 jours » doit rester « dans 21 jours », pas
    // « dans 20 jours et 7 heures ».
    assert.equal(enJeton('2026-11-16', REFERENCE, 'perime_le'), '{{D+21}}');
    assert.equal(enJeton('2026-09-21', REFERENCE, 'perime_le'), '{{D-35}}');
  });

  test('une date de naissance ne bouge pas', () => {
    // Le cas qui dit ou passe la ligne.
    assert.equal(enJeton('1998-04-12', REFERENCE, 'birth_date'), '1998-04-12');
    assert.ok(COLONNES_FIGEES.has('birth_date'));
  });

  test('une date tres lointaine reste une donnee en propre', () => {
    const vieille = '1950-01-01';
    assert.equal(enJeton(vieille, REFERENCE, 'created_at'), vieille);
  });

  test('la frontiere de l horizon est nette', () => {
    const dedans = new Date(REFERENCE.getTime() + (HORIZON_JOURS - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const dehors = new Date(REFERENCE.getTime() + (HORIZON_JOURS + 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    assert.match(enJeton(dedans, REFERENCE, 'perime_le'), /^\{\{D/);
    assert.equal(enJeton(dehors, REFERENCE, 'perime_le'), dehors);
  });

  test('ce qui n est pas une date est laisse intact', () => {
    // Sans analyse stricte, « 500 » ou un code d etablissement
    // deviendraient des dates sur certains moteurs, et le vidage se
    // remplirait de jetons a la place de vraies valeurs.
    for (const valeur of ['500', 'BJ-LIT-CSC-001', 'Amoxicilline', '', '2026', '2026-13-45']) {
      assert.equal(enJeton(valeur, REFERENCE, 'code'), valeur, `« ${valeur} » a ete transforme`);
    }
  });
});

describe('resolution au chargement', () => {
  const MAINTENANT = new Date('2027-03-02T08:30:00Z');

  test('un jeton de minutes rend la forme horodatee de SQLite', () => {
    const sql = "INSERT INTO passage (arrive_le) VALUES ('{{T-45}}');";
    assert.equal(
      resoudre(sql, MAINTENANT),
      "INSERT INTO passage (arrive_le) VALUES ('2027-03-02 07:45:00');",
    );
  });

  test('un jeton ISO rend de l ISO, pas de la forme SQLite', () => {
    const sql = "INSERT INTO intervention (debut_prevu) VALUES ('{{I+60}}');";
    assert.equal(
      resoudre(sql, MAINTENANT),
      "INSERT INTO intervention (debut_prevu) VALUES ('2027-03-02T09:30:00.000Z');",
    );
  });

  test('les deux formes tombent dans la meme plage de jour', () => {
    // C est la propriete dont depend la requete du programme operatoire :
    // une borne en date nue doit attraper les deux ecritures.
    const sqlite = resoudre('{{T+60}}', MAINTENANT);
    const iso = resoudre('{{I+60}}', MAINTENANT);
    const jour = '2027-03-02';
    const lendemain = '2027-03-03';
    for (const [nom, v] of [['SQLite', sqlite], ['ISO', iso]]) {
      assert.ok(v >= jour && v < lendemain, `${nom} hors plage : ${v}`);
    }
  });

  test('un jeton de jours rend une date seule', () => {
    const sql = "INSERT INTO lot (perime_le) VALUES ('{{D+21}}');";
    assert.equal(resoudre(sql, MAINTENANT), "INSERT INTO lot (perime_le) VALUES ('2027-03-23');");
  });

  test('un jeton negatif en jours fonctionne aussi', () => {
    assert.equal(resoudre("('{{D-35}}')", MAINTENANT), "('2027-01-26')");
  });

  test('plusieurs jetons sur une meme ligne sont tous resolus', () => {
    const sql = "VALUES ('{{T-45}}', '{{T+60}}', '{{D+21}}')";
    assert.equal(resoudre(sql, MAINTENANT).includes('{{'), false);
  });

  test('le texte sans jeton est rendu intact', () => {
    const sql = "INSERT INTO patient (given_name) VALUES ('Adjoa');";
    assert.equal(resoudre(sql, MAINTENANT), sql);
  });
});

describe('aller-retour', () => {
  test('la duree relative est conservee, quelle que soit la date de lecture', () => {
    // C est l invariant qui fait tenir la demonstration : l ecart entre
    // deux evenements doit rester le meme, aujourd hui comme dans six mois.
    const arrivee = '2026-10-26 10:30:00';
    const jeton = enJeton(arrivee, REFERENCE, 'arrive_le');

    for (const lecture of ['2026-10-26T12:00:00Z', '2027-05-14T03:17:00Z']) {
      const maintenant = new Date(lecture);
      const rendu = resoudre(`'${jeton}'`, maintenant).slice(1, -1);
      const ecart = (maintenant.getTime() - Date.parse(`${rendu.replace(' ', 'T')}Z`)) / 60_000;
      assert.equal(ecart, 90, `ecart faux pour une lecture le ${lecture}`);
    }
  });

  test('une date seule garde son nombre de jours', () => {
    const jeton = enJeton('2026-11-16', REFERENCE, 'perime_le');
    const maintenant = new Date('2027-05-14T23:50:00Z');
    const rendu = resoudre(`'${jeton}'`, maintenant).slice(1, -1);
    const jours = (Date.parse(`${rendu}T00:00:00Z`) - Date.UTC(2027, 4, 14)) / 86_400_000;
    assert.equal(jours, 21, 'le lot doit toujours perimer dans 21 jours');
  });
});
