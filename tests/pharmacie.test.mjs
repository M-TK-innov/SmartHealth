/**
 * Pharmacie : stock par lot, peremption, dispensation.
 *
 *   npm test
 *
 * LES CAS QUI COMPTENT, par ordre de gravite de ce qu'ils empechent :
 *
 *   - un lot perime qui sort quand meme. Un antibiotique perime n'est pas un
 *     antibiotique moins efficace : c'est un traitement qui echoue pendant
 *     qu'on croit traiter ;
 *   - une dispensation a un patient allergique ;
 *   - une dispensation partielle silencieuse, qui renvoie le patient avec un
 *     traitement incomplet qu'il croit complet.
 *
 * Module pur : la date du jour est passee en parametre, donc la peremption
 * se teste sans attendre.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  alerteStock,
  dansNJours,
  dispenser,
  disponible,
  ordreDeSortie,
  servable,
  HORIZON_PEREMPTION_JOURS,
} from '../lib/hopital/pharmacie.ts';

const AUJOURDHUI = '2026-10-24';

const lot = (numero, perimeLe, quantite) => ({
  id: `lot-${numero}`,
  articleId: 'amox',
  numero,
  perimeLe,
  quantite,
});

const demande = (extra = {}) => ({
  articleId: 'amox',
  dci: 'Amoxicilline',
  quantite: 10,
  lots: [],
  allergies: [],
  aujourdhui: AUJOURDHUI,
  ...extra,
});

describe('peremption', () => {
  test('un lot perime hier ne sort pas', () => {
    assert.equal(servable(lot('A', '2026-10-23', 100), AUJOURDHUI), false);
  });

  test('le jour de peremption lui-meme ne sort pas', () => {
    // Frontiere exacte, et elle est volontairement stricte. Une boite
    // marquee pour ce mois n'est pas garantie le dernier jour au soir ;
    // c'est une bordure qui n'a aucune raison d'etre jouee.
    assert.equal(servable(lot('A', AUJOURDHUI, 100), AUJOURDHUI), false);
    assert.equal(servable(lot('A', '2026-10-25', 100), AUJOURDHUI), true);
  });

  test('un lot vide ne sort pas, meme non perime', () => {
    assert.equal(servable(lot('A', '2027-01-01', 0), AUJOURDHUI), false);
  });

  test('la comparaison ne depend pas du fuseau du poste', () => {
    // Comparaison de chaines AAAA-MM-JJ : la meme decision partout. Passer
    // par Date() ferait qu un lot servable a Cotonou serait refuse ailleurs
    // le meme jour.
    assert.equal(servable(lot('A', '2026-12-31', 5), '2026-12-30'), true);
    assert.equal(servable(lot('A', '2027-01-01', 5), '2026-12-31'), true);
    assert.equal(servable(lot('A', '2026-12-31', 5), '2026-12-31'), false);
  });
});

describe('ordre de sortie', () => {
  test('ce qui perime le plus tot sort le premier, quel que soit l ordre d arrivee', () => {
    // FEFO et non FIFO. Un lot recu recemment mais proche de sa date doit
    // partir avant un lot ancien a longue peremption, sinon il se perime en
    // rayon pendant qu on sert l autre.
    const lots = [
      lot('ancien-longue-date', '2027-06-01', 50),
      lot('recent-courte-date', '2026-11-05', 20),
      lot('milieu', '2027-01-15', 30),
    ];
    assert.deepEqual(
      ordreDeSortie(lots, AUJOURDHUI).map((l) => l.numero),
      ['recent-courte-date', 'milieu', 'ancien-longue-date'],
    );
  });

  test('les lots perimes sont exclus du disponible', () => {
    const lots = [lot('bon', '2027-01-01', 30), lot('perime', '2026-01-01', 500)];
    assert.equal(disponible(lots, AUJOURDHUI), 30, 'les 500 perimees ne comptent pas');
  });
});

describe('dispensation', () => {
  test('elle puise dans le lot le plus proche de la peremption', () => {
    const lots = [lot('longue', '2027-06-01', 50), lot('courte', '2026-11-05', 4)];
    const d = dispenser(demande({ quantite: 4, lots }));
    assert.equal(d.ok, true);
    assert.deepEqual(d.resultat.prelevements.map((p) => p.numero), ['courte']);
    assert.equal(d.resultat.partielle, false);
  });

  test('elle enchaine sur le lot suivant quand le premier est epuise', () => {
    const lots = [lot('courte', '2026-11-05', 4), lot('longue', '2027-06-01', 50)];
    const d = dispenser(demande({ quantite: 10, lots }));
    assert.equal(d.ok, true);
    assert.deepEqual(
      d.resultat.prelevements.map((p) => [p.numero, p.quantite]),
      [['courte', 4], ['longue', 6]],
      'on vide le lot le plus proche de la date avant d entamer l autre',
    );
    assert.equal(d.resultat.servi, 10);
  });

  test('un lot perime n est jamais prelevé, meme s il est le seul a avoir du stock', () => {
    // LE cas. S il ne reste que du perime, on refuse — on ne sert pas « faute
    // de mieux ».
    const lots = [lot('perime', '2026-10-01', 500)];
    const d = dispenser(demande({ quantite: 1, lots }));
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'TOUT_PERIME');
    assert.match(d.remede, /retirer du rayon|destruction/i);
  });

  test('rupture et peremption totale ne se confondent pas', () => {
    // Le remede n est pas le meme : dans un cas on commande, dans l autre on
    // commande ET on retire des boites du rayon avant que quelqu un ne les
    // serve.
    const rupture = dispenser(demande({ quantite: 1, lots: [] }));
    assert.equal(rupture.motif, 'STOCK_INSUFFISANT');
    assert.match(rupture.message, /rupture/i);

    const perime = dispenser(demande({ quantite: 1, lots: [lot('p', '2020-01-01', 10)] }));
    assert.equal(perime.motif, 'TOUT_PERIME');
  });

  test('une dispensation partielle est refusee par defaut', () => {
    // Servir trois comprimes sur vingt sans le nommer renvoie le patient
    // avec un traitement incomplet qu il croit complet.
    const d = dispenser(demande({ quantite: 20, lots: [lot('a', '2027-01-01', 3)] }));
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'STOCK_INSUFFISANT');
    assert.match(d.message, /3 disponibles sur 20/);
    assert.match(d.remede, /partielle/i);
  });

  test('elle passe quand le pharmacien l accepte explicitement, et le manque est chiffre', () => {
    const d = dispenser(
      demande({ quantite: 20, lots: [lot('a', '2027-01-01', 3)], accepterPartiel: true }),
    );
    assert.equal(d.ok, true);
    assert.equal(d.resultat.servi, 3);
    assert.equal(d.resultat.manquant, 17);
    assert.equal(d.resultat.partielle, true);
  });

  test('une quantite nulle ou fractionnaire est refusee', () => {
    for (const quantite of [0, -5, 2.5]) {
      const d = dispenser(demande({ quantite, lots: [lot('a', '2027-01-01', 100)] }));
      assert.equal(d.ok, false, `${quantite} aurait du etre refuse`);
      assert.equal(d.motif, 'QUANTITE_INVALIDE');
    }
  });

  test('on ne preleve jamais plus que ce que le lot contient', () => {
    const lots = [lot('a', '2026-11-01', 7), lot('b', '2027-01-01', 7)];
    const d = dispenser(demande({ quantite: 14, lots }));
    assert.equal(d.ok, true);
    for (const p of d.resultat.prelevements) {
      const source = lots.find((l) => l.id === p.lotId);
      assert.ok(p.quantite <= source.quantite, `${p.numero} : ${p.quantite} > ${source.quantite}`);
    }
    assert.equal(
      d.resultat.prelevements.reduce((n, p) => n + p.quantite, 0),
      14,
    );
  });
});

describe('allergie', () => {
  test('une allergie a la substance bloque la dispensation', () => {
    const d = dispenser(
      demande({ lots: [lot('a', '2027-01-01', 100)], allergies: ['Amoxicilline'] }),
    );
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'ALLERGIE');
    assert.match(d.remede, /prescripteur/i);
  });

  test('le dosage et la casse ne font pas echouer la detection', () => {
    const d = dispenser(
      demande({ dci: 'AMOXICILLINE 500 mg', lots: [lot('a', '2027-01-01', 100)], allergies: ['amoxicilline'] }),
    );
    assert.equal(d.motif, 'ALLERGIE', 'une difference de casse ou de dosage ne doit pas laisser passer');
  });

  test('une association declenche sur chacun de ses composants', () => {
    const d = dispenser(
      demande({
        dci: 'Amoxicilline/acide clavulanique',
        lots: [lot('a', '2027-01-01', 100)],
        allergies: ['Acide clavulanique'],
      }),
    );
    assert.equal(d.motif, 'ALLERGIE');
  });

  test('une association declenche aussi quand l allergie porte un dosage', () => {
    // C'est ce cas qui justifie de decomposer l'association plutot que de
    // comparer les deux chaines entieres : ni « amoxicilline/acide
    // clavulanique » ni « amoxicilline 1 g » n'est contenue dans l'autre.
    // Composant par composant, « amoxicilline » l'est — et c'est bien le
    // meme patient, la meme substance.
    const d = dispenser(
      demande({
        dci: 'Amoxicilline/acide clavulanique',
        lots: [lot('a', '2027-01-01', 100)],
        allergies: ['Amoxicilline 1 g'],
      }),
    );
    assert.equal(d.motif, 'ALLERGIE');
  });

  test('une allergie a autre chose ne bloque rien', () => {
    // Le controle doit etre large, pas aveugle : s il refuse tout, le
    // pharmacien apprend a passer outre, et il passera outre le vrai cas.
    const d = dispenser(
      demande({ lots: [lot('a', '2027-01-01', 100)], allergies: ['Penicilline G', 'Arachide'] }),
    );
    assert.equal(d.ok, true);
  });

  test('une classe portee en suffixe du nom declenche', () => {
    // LE cas qui a fait tomber une premiere version de cette regle. Elle
    // n'acceptait une correspondance qu'en DEBUT de mot — et les
    // denominations portent justement leur classe a la fin. Un patient
    // allergique aux thiazides recevait de l'hydrochlorothiazide sans le
    // moindre signalement.
    const thiazide = dispenser(
      demande({
        dci: 'Hydrochlorothiazide',
        lots: [lot('a', '2027-01-01', 100)],
        allergies: ['Thiazide'],
      }),
    );
    assert.equal(thiazide.motif, 'ALLERGIE', 'une allergie aux thiazides doit bloquer un -thiazide');

    const cilline = dispenser(
      demande({ dci: 'Amoxicilline', lots: [lot('a', '2027-01-01', 100)], allergies: ['cilline'] }),
    );
    assert.equal(cilline.motif, 'ALLERGIE');
  });

  test('une saisie trop courte ne bloque pas la moitie de la pharmacie', () => {
    // Une fiche remplie vite contient « a », « RAS », « non ». Sans
    // plancher de longueur, « a » se retrouve dans presque toutes les
    // denominations — et un pharmacien qui voit l'alerte partout apprend a
    // passer outre, puis passe outre le vrai cas.
    const d = dispenser(
      demande({
        dci: 'Amoxicilline',
        lots: [lot('a', '2027-01-01', 100)],
        allergies: ['a', 'ol', 'RAS', 'non'],
      }),
    );
    assert.equal(d.ok, true, 'une saisie de une a trois lettres ne doit pas bloquer');
  });

  test('le controle precede le stock', () => {
    // Un patient allergique doit etre renvoye vers le prescripteur, et non
    // vers une autre pharmacie ou il trouvera le produit.
    const d = dispenser(demande({ lots: [], allergies: ['Amoxicilline'] }));
    assert.equal(d.motif, 'ALLERGIE');
  });
});

describe('alertes de stock', () => {
  const article = { id: 'amox', dci: 'Amoxicilline', forme: 'comprime', dosage: '500 mg', seuilAlerte: 20 };

  test('une rupture et un rayon entierement perime ne se disent pas pareil', () => {
    assert.equal(alerteStock(article, [], AUJOURDHUI).niveau, 'rupture');
    assert.equal(alerteStock(article, [lot('p', '2020-01-01', 80)], AUJOURDHUI).niveau, 'perime');
  });

  test('le seuil d alerte est inclusif', () => {
    // A 20 pile on alerte deja : attendre 19 fait commander un jour trop
    // tard, et un jour de rupture est un jour de patients renvoyes.
    assert.equal(alerteStock(article, [lot('a', '2027-01-01', 20)], AUJOURDHUI).niveau, 'bas');
    assert.equal(alerteStock(article, [lot('a', '2027-01-01', 21)], AUJOURDHUI).niveau, 'ok');
  });

  test('ce qui perime bientot est compte a part de ce qui est deja perdu', () => {
    const lots = [
      lot('perdu', '2026-01-01', 15),
      lot('bientot', dansNJours(AUJOURDHUI, HORIZON_PEREMPTION_JOURS - 1), 10),
      lot('tranquille', dansNJours(AUJOURDHUI, HORIZON_PEREMPTION_JOURS + 10), 40),
    ];
    const a = alerteStock(article, lots, AUJOURDHUI);

    assert.equal(a.disponible, 50, 'le perime ne compte pas dans le disponible');
    assert.equal(a.perimees, 15);
    assert.equal(
      a.bientotPerimees,
      10,
      'sur ce chiffre-la on peut encore agir : servir en priorite ou transferer',
    );
    assert.equal(a.niveau, 'ok');
  });
});
