/**
 * Ce que l'assurance prend en charge, et ce qui reste au patient.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE : qu'une convention INCONNUE ne soit jamais
 * remplacee par un taux « habituel ». C'est la tentation quand on automatise
 * la prise en charge — il faut bien mettre un chiffre — et elle produit
 * l'inverse exact de ce que l'assurance pour tous cherche a obtenir : un
 * reste a charge qu'aucune des deux parties ne reconnait, decouvert a la
 * caisse, devant le patient.
 *
 * Et la seconde : que la prise en charge se calcule LIGNE PAR LIGNE. Un
 * regime couvre des actes, pas des factures.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { appliquer, appliquerAFacture, conventionPour } from '../lib/caisse/convention.ts';

const CONVENTIONS = [
  { regime: 'ARCH', code: '*', taux: 50, plafond: null },
  { regime: 'ARCH', code: 'consultation-urgence', taux: 100, plafond: null },
  { regime: 'mutuelle-oueme', code: '*', taux: 80, plafond: 20_000 },
  { regime: 'sans-effet', code: '*', taux: 0, plafond: null },
];

describe('sans convention connue, rien n est pris en charge', () => {
  test('un patient sans regime paie tout', () => {
    const p = appliquer(10_000, CONVENTIONS, null, 'consultation-externe');
    assert.equal(p.partTiers, 0);
    assert.equal(p.resteACharge, 10_000);
    assert.match(p.motif, /sans regime/i);
  });

  test('UN REGIME INCONNU NE DECLENCHE AUCUN TAUX PAR DEFAUT', () => {
    // Le cas qui compte : le patient DIT etre couvert, et la convention n a
    // pas ete saisie. Appliquer « le taux habituel » serait inventer un
    // accord que personne n a signe.
    const p = appliquer(10_000, CONVENTIONS, 'regime-jamais-saisi', 'consultation-externe');
    assert.equal(p.partTiers, 0);
    assert.equal(p.resteACharge, 10_000);
    // Le motif doit distinguer « pas couvert » de « on ne sait pas » : les
    // deux n appellent pas le meme geste.
    assert.match(p.motif, /aucune convention/i);
    assert.match(p.motif, /regime-jamais-saisi/);
  });

  test('un taux pose a zero couvre bel et bien zero, et le dit autrement', () => {
    const p = appliquer(10_000, CONVENTIONS, 'sans-effet', 'consultation-externe');
    assert.equal(p.partTiers, 0);
    assert.match(p.motif, /ne couvre pas/i);
    assert.doesNotMatch(p.motif, /aucune convention/i);
  });
});

describe('le taux et le plafond', () => {
  test('un taux simple s applique', () => {
    const p = appliquer(10_000, CONVENTIONS, 'ARCH', 'consultation-externe');
    assert.equal(p.partTiers, 5_000);
    assert.equal(p.resteACharge, 5_000);
    assert.equal(p.regime, 'ARCH');
  });

  test('une regle sur le code exact l emporte sur la regle generale', () => {
    // ARCH couvre tout a 50 %, mais les urgences a 100 %. L ordre de
    // recherche doit respecter cette intention.
    const p = appliquer(10_000, CONVENTIONS, 'ARCH', 'consultation-urgence');
    assert.equal(p.partTiers, 10_000);
    assert.equal(p.resteACharge, 0);
  });

  test('LE PLAFOND PORTE SUR LA FACTURE, pas sur l acte', () => {
    // 80 % de 50 000 font 40 000, mais la mutuelle plafonne a 20 000. Le
    // plafond se verifie au niveau de la facture : une fonction qui ne voit
    // qu un acte ne peut pas le faire respecter, et elle ne pretend pas le
    // faire.
    assert.equal(appliquer(50_000, CONVENTIONS, 'mutuelle-oueme', 'cure-hernie').partTiers, 40_000);

    const f = appliquerAFacture([{ code: 'cure-hernie', montant: 50_000 }], CONVENTIONS, 'mutuelle-oueme');
    assert.equal(f.partTiers, 20_000);
    assert.equal(f.resteACharge, 30_000);
    assert.match(f.motif, /plafond/i);
  });

  test('UN PLAFOND NE SE MULTIPLIE PAS PAR LE NOMBRE DE LIGNES', () => {
    // LE DEFAUT QUE CE TEST FERME. Applique ligne par ligne, un plafond de
    // 20 000 laisse passer 20 000 PAR LIGNE : cinq lignes et la mutuelle a
    // verse 100 000 au lieu de 20 000. Cela ne se voit pas en testant sur un
    // acte seul, et c est exactement ainsi que le defaut etait ne.
    const cinq = Array.from({ length: 5 }, () => ({ code: 'acte', montant: 10_000 }));
    const f = appliquerAFacture(cinq, CONVENTIONS, 'mutuelle-oueme');
    assert.equal(f.partTiers, 20_000, 'le plafond tient quel que soit le nombre de lignes');
    assert.equal(f.resteACharge, 30_000);
  });

  test('quand deux plafonds s appliquent, le PLUS BAS tient', () => {
    // Un plafond est un engagement maximal : retenir le plus haut ferait
    // payer a l assureur ce qu il n a pas promis.
    const conv = [
      { regime: 'R', code: '*', taux: 100, plafond: 30_000 },
      { regime: 'R', code: 'serre', taux: 100, plafond: 5_000 },
    ];
    const f = appliquerAFacture(
      [
        { code: 'large', montant: 20_000 },
        { code: 'serre', montant: 20_000 },
      ],
      conv,
      'R',
    );
    assert.equal(f.partTiers, 5_000);
  });

  test('sous le plafond, le taux seul joue', () => {
    const p = appliquer(10_000, CONVENTIONS, 'mutuelle-oueme', 'consultation-externe');
    assert.equal(p.partTiers, 8_000);
  });

  test('L ARRONDI PROFITE AU PATIENT, pas a l assureur', () => {
    // 50 % de 1 001 font 500,5. Le franc indivisible va a celui qui paie de
    // sa poche : sur un acte c est negligeable, sur un exercice c est une
    // direction qu il vaut mieux choisir que subir.
    const p = appliquer(1_001, CONVENTIONS, 'ARCH', 'consultation-externe');
    assert.equal(p.partTiers, 500);
    assert.equal(p.resteACharge, 501);
  });

  test('la part ne depasse jamais le montant', () => {
    const p = appliquer(100, [{ regime: 'R', code: '*', taux: 100, plafond: 99_999 }], 'R', 'x');
    assert.equal(p.partTiers, 100);
    assert.equal(p.resteACharge, 0);
  });

  test('un taux ou un plafond invalide ne prend rien en charge', () => {
    assert.equal(appliquer(1_000, [{ regime: 'R', code: '*', taux: 150, plafond: null }], 'R', 'x').partTiers, 0);
    assert.equal(appliquer(1_000, [{ regime: 'R', code: '*', taux: -1, plafond: null }], 'R', 'x').partTiers, 0);
    assert.equal(appliquer(1_000, [{ regime: 'R', code: '*', taux: 50, plafond: -5 }], 'R', 'x').partTiers, 0);
  });
});

describe('une facture entiere', () => {
  test('LE CALCUL SE FAIT LIGNE PAR LIGNE, pas sur le total', () => {
    // Une consultation d urgence couverte a 100 % et un acte couvert a 50 %.
    // Un taux unique applique au total couvrirait a 75 % les deux, dont un
    // acte qui ne devrait l etre qu a moitie.
    const p = appliquerAFacture(
      [
        { code: 'consultation-urgence', montant: 10_000 },
        { code: 'journee-hospitalisation', montant: 10_000 },
      ],
      CONVENTIONS,
      'ARCH',
    );
    assert.equal(p.partTiers, 15_000, '10 000 + 5 000');
    assert.equal(p.resteACharge, 5_000);
  });

  test('une facture sans ligne ne doit rien', () => {
    const p = appliquerAFacture([], CONVENTIONS, 'ARCH');
    assert.equal(p.partTiers, 0);
    assert.equal(p.resteACharge, 0);
  });

  test('sans regime, toute la facture reste au patient', () => {
    const p = appliquerAFacture([{ code: 'x', montant: 7_000 }], CONVENTIONS, null);
    assert.equal(p.partTiers, 0);
    assert.equal(p.resteACharge, 7_000);
    assert.match(p.motif, /sans regime/i);
  });
});

describe('la recherche de convention', () => {
  test('sans regime, aucune convention', () => {
    assert.equal(conventionPour(CONVENTIONS, null, 'x'), null);
  });

  test('un regime connu sans regle generale ne couvre que ses codes', () => {
    const c = [{ regime: 'R', code: 'precis', taux: 100, plafond: null }];
    assert.equal(conventionPour(c, 'R', 'precis').taux, 100);
    assert.equal(conventionPour(c, 'R', 'autre'), null);
  });
});
