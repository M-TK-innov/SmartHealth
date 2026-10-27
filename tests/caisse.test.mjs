/**
 * Caisse : tarification, encaissement, tiers payant.
 *
 *   npm test
 *
 * DEUX INVARIANTS, et les cas ci-dessous existent surtout pour eux :
 *
 *   1. L'argent ne barre jamais la route d'un soin urgent. Un module de caisse
 *      qui PEUT bloquer une prise en charge finira par le faire, un soir de
 *      garde, pour une somme derisoire. La derniere section verifie que ce
 *      chemin n'existe pas.
 *
 *   2. Une caisse tombe juste, ou elle ne sert a rien. Pas de reste a charge
 *      negatif, pas de trop-percu avale en silence, pas de part tiers
 *      superieure a la facture.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { solde, facturer, encaisser, avisAvantActe, francs } from '../lib/hopital/caisse.ts';

function facture(extra = {}) {
  return {
    id: 'f-1',
    sejourId: 's-1',
    lignes: [],
    paiements: [],
    partTiers: 0,
    close: false,
    ...extra,
  };
}

const ligne = (montant, quantite = 1, urgence = 'programmable') => ({
  id: `l-${montant}-${quantite}`,
  libelle: 'acte',
  montant,
  quantite,
  urgence,
});

const paiement = (montant, moyen = 'especes') => ({
  id: `p-${montant}`,
  montant,
  moyen,
  recuLe: '2026-10-24T09:00:00.000Z',
});

describe('solde', () => {
  test('le total compte les quantites, pas seulement les lignes', () => {
    // 3 x 500 et non 500 : une consultation facturee trois fois ne coute pas
    // le prix d une.
    const s = solde(facture({ lignes: [ligne(500, 3), ligne(1500, 1)] }));
    assert.equal(s.total, 3000);
    assert.equal(s.duPatient, 3000);
    assert.equal(s.resteACharge, 3000);
    assert.equal(s.soldee, false);
  });

  test('le tiers payant vient en deduction', () => {
    const s = solde(facture({ lignes: [ligne(10_000)], partTiers: 8000 }));
    assert.equal(s.total, 10_000);
    assert.equal(s.partTiers, 8000);
    assert.equal(s.duPatient, 2000);
    assert.equal(s.resteACharge, 2000);
  });

  test('un tiers payant superieur a la facture ne rend pas de monnaie', () => {
    // Une prise en charge plafonnee a 50 000 F sur une facture de 3 000 F :
    // le patient doit zero, et surtout pas moins que zero. Sans le plafond,
    // duPatient vaudrait -47 000 et la facture passerait pour creditrice.
    const s = solde(facture({ lignes: [ligne(3000)], partTiers: 50_000 }));
    assert.equal(s.partTiers, 3000);
    assert.equal(s.duPatient, 0);
    assert.equal(s.resteACharge, 0);
    assert.equal(s.soldee, true);
  });

  test('un trop-percu est nomme, pas absorbe', () => {
    // Cas reel : le patient paie 5 000 F, puis la mutuelle accorde sa prise
    // en charge apres coup. L argent verse est maintenant en trop. Une caisse
    // qui affiche « soldee, reste 0 » et s arrete la vient de transformer un
    // remboursement du en recette.
    const s = solde(
      facture({ lignes: [ligne(5000)], paiements: [paiement(5000)], partTiers: 4000 }),
    );
    assert.equal(s.duPatient, 1000);
    assert.equal(s.regle, 5000);
    assert.equal(s.resteACharge, 0, 'un reste a charge ne descend jamais sous zero');
    assert.equal(s.tropPercu, 4000, 'le trop-percu doit etre visible pour etre rendu');
  });

  test('le paiement exact solde la facture', () => {
    // Frontiere : regle === duPatient. C est le cas le plus frequent de la
    // journee, et celui ou un comparateur trop strict laisserait la facture
    // ouverte pour zero franc.
    const s = solde(facture({ lignes: [ligne(2500)], paiements: [paiement(2500)] }));
    assert.equal(s.resteACharge, 0);
    assert.equal(s.tropPercu, 0);
    assert.equal(s.soldee, true);
  });
});

describe('facturer', () => {
  test('une facture close n accepte plus d acte, et le refus dit ou aller', () => {
    const d = facturer(facture({ close: true }), ligne(1000));
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'FACTURE_CLOSE');
    assert.match(d.remede, /complementaire/i);
  });

  test('un montant fractionnaire est refuse', () => {
    // Les montants sont des francs entiers. Un centime qui se glisse ici
    // derive ligne apres ligne jusqu a ce que la caisse ne tombe plus juste.
    const d = facturer(facture(), ligne(1000.5));
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'LIGNE_INVALIDE');
  });

  test('une quantite nulle est refusee, une quantite de 1 passe', () => {
    // Frontiere exacte : 0 est invalide, 1 est valide. Une ligne a quantite
    // zero facture zero franc et fait croire que l acte est enregistre.
    const zero = facturer(facture(), ligne(1000, 0));
    assert.equal(zero.ok, false);
    assert.equal(zero.motif, 'LIGNE_INVALIDE');

    const un = facturer(facture(), ligne(1000, 1));
    assert.equal(un.ok, true);
  });

  test('un acte gratuit reste facturable', () => {
    // Montant zero : consultation prise en charge par un programme national.
    // Elle doit apparaitre sur la facture, sinon l acte n est pas trace.
    const d = facturer(facture(), ligne(0));
    assert.equal(d.ok, true);
  });
});

describe('encaisser', () => {
  test('le paiement exact passe', () => {
    // Frontiere : montant === resteACharge. Doit passer.
    const d = encaisser(facture({ lignes: [ligne(2000)] }), 2000, 'especes');
    assert.equal(d.ok, true);
    assert.equal(d.resultat.montant, 2000);
  });

  test('un versement superieur au reste a charge est refuse, et le refus chiffre le rendu', () => {
    // La caisse n a pas a decider seule qu un patient vient de faire un don.
    // Et le message doit donner le montant a encaisser, sinon l agent
    // recommence a l aveugle.
    const d = encaisser(facture({ lignes: [ligne(2000)] }), 5000, 'especes');
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'DEPASSE_RESTE_A_CHARGE');
    assert.match(d.message, /2 000 F/);
    assert.match(d.remede, /2 000 F/);
  });

  test('un montant nul, negatif ou fractionnaire est refuse', () => {
    for (const montant of [0, -500, 12.5]) {
      const d = encaisser(facture({ lignes: [ligne(2000)] }), montant, 'especes');
      assert.equal(d.ok, false, `${montant} aurait du etre refuse`);
      assert.equal(d.motif, 'MONTANT_INVALIDE');
    }
  });

  test('on n encaisse pas deux fois la meme facture', () => {
    const f = facture({ lignes: [ligne(2000)], paiements: [paiement(2000)] });
    const d = encaisser(f, 2000, 'especes');
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'DEJA_SOLDEE');
  });

  test('le solde restant se paie en plusieurs fois', () => {
    const f = facture({ lignes: [ligne(5000)], paiements: [paiement(3000)] });
    const d = encaisser(f, 2000, 'mobile');
    assert.equal(d.ok, true);
    assert.equal(d.resultat.moyen, 'mobile');

    const trop = encaisser(f, 2001, 'mobile');
    assert.equal(trop.ok, false, '2001 depasse de 1 franc le reste a charge');
  });
});

describe("l'argent ne barre pas la route d'un soin", () => {
  const impayee = facture({ lignes: [ligne(50_000)] });

  test('une urgence vitale n est jamais bloquee par un impaye', () => {
    const a = avisAvantActe(impayee, 'vitale');
    assert.notEqual(a.niveau, 'bloquant');
    assert.equal(a.niveau, 'avis');
    assert.equal(a.resteACharge, 50_000);
  });

  test('une urgence non vitale non plus', () => {
    // Le cas qui compte vraiment. « Vitale » est facile a proteger ; c est
    // « urgente » qu une relecture distraite laisse passer du cote bloquant,
    // et c est la majorite des patients d une nuit de garde.
    const a = avisAvantActe(impayee, 'urgente');
    assert.notEqual(a.niveau, 'bloquant');
    assert.equal(a.niveau, 'avis');
  });

  test('l avis sur un acte urgent dit que l acte est fait', () => {
    // Un avis qui se contente d afficher une dette se lit comme un refus.
    // Il doit nommer la conduite a tenir : on soigne, on regularise apres.
    const a = avisAvantActe(impayee, 'vitale');
    assert.match(a.message, /apres|ne retarde pas/i);
  });

  test('un acte programmable, lui, peut attendre le reglement', () => {
    const a = avisAvantActe(impayee, 'programmable');
    assert.equal(a.niveau, 'bloquant');
    assert.match(a.message, /50 000 F/);
  });

  test('sans dette, aucun avis nulle part', () => {
    const f = facture({ lignes: [ligne(2000)], paiements: [paiement(2000)] });
    for (const u of ['vitale', 'urgente', 'programmable']) {
      assert.equal(avisAvantActe(f, u).niveau, 'aucun');
    }
  });
});

describe('ecriture des montants', () => {
  test('les milliers sont groupes par une espace insecable', () => {
    // Insecable et non ordinaire : « 50 000 F » ne doit pas se couper en fin
    // de ligne sur un ecran etroit, ou il se lirait « 50 » puis « 000 F ».
    assert.equal(francs(50_000), '50\u00a0000 F');
    assert.equal(francs(1_250_000), '1\u00a0250\u00a0000 F');
  });

  test('les petits montants ne sont pas groupes', () => {
    assert.equal(francs(0), '0 F');
    assert.equal(francs(999), '999 F');
    assert.equal(francs(1000), '1\u00a0000 F');
  });

  test('un refus et un tableau ecrivent le meme montant de la meme facon', () => {
    // C'est la raison d'etre du formateur partage : deux graphies du meme
    // chiffre sur un ecran de caisse, et on rend 5 000 F au lieu de 50 000.
    const f = facture({ lignes: [ligne(50_000)] });
    const refus = encaisser(f, 90_000, 'especes');
    assert.equal(refus.ok, false);
    assert.ok(
      refus.remede.includes(francs(50_000)),
      `le remede doit contenir ${francs(50_000)} : ${refus.remede}`,
    );
  });
});
