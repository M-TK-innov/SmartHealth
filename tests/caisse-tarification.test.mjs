/**
 * Ce qu'un acte coute, et ce qui se passe quand on ne le sait pas.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE : qu'un acte sans tarif ne soit JAMAIS facture a
 * zero. C'est la tentation evidente quand la facturation devient automatique —
 * il faut bien ecrire quelque chose — et c'est l'erreur la plus difficile a
 * rattraper ensuite : une ligne a zero ressemble a une gratuite decidee par
 * quelqu'un, et personne ne la corrige jamais.
 *
 * Et la seconde : qu'un acte ne soit pas facturable sans origine. Sans elle,
 * signer deux fois une consultation la facture deux fois.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  codeConsultation,
  codeExamen,
  codeMedicament,
  tarifDe,
  tarifer,
} from '../lib/caisse/tarification.ts';

const BAREME = [
  { code: 'consultation-externe', libelle: 'Consultation externe', montant: 2000 },
  { code: 'consultation-urgence', libelle: "Consultation d urgence", montant: 5000 },
  { code: 'examen:2339-0', libelle: 'Glycemie', montant: 1000 },
  { code: 'prise-en-charge-totale', libelle: 'Acte pris en charge', montant: 0 },
];

const acte = (extra = {}) => ({
  code: 'consultation-externe',
  libelle: 'Consultation',
  quantite: 1,
  urgence: 'programmable',
  source: 'consultation:c-1',
  ...extra,
});

describe('un acte tarife donne sa ligne', () => {
  test('le montant et le libelle viennent du bareme', () => {
    const d = tarifer(acte(), BAREME);
    assert.equal(d.ok, true);
    assert.equal(d.ligne.montant, 2000);
    // Le libelle du bareme fait foi : c est celui que le caissier reconnait
    // et que le patient retrouvera sur son telephone.
    assert.equal(d.ligne.libelle, 'Consultation externe');
    assert.equal(d.ligne.source, 'consultation:c-1');
  });

  test('la quantite et l urgence sont celles de l acte, pas du bareme', () => {
    // L urgence decide si un impaye peut bloquer un acte : c est une decision
    // de soin, pas de comptabilite. La facturation la recoit, elle ne la juge
    // pas.
    const d = tarifer(acte({ quantite: 3, urgence: 'vitale' }), BAREME);
    assert.equal(d.ligne.quantite, 3);
    assert.equal(d.ligne.urgence, 'vitale');
  });

  test('un tarif POSE a zero est accepte', () => {
    // Un acte pris en charge integralement existe. Ce qui est interdit, c est
    // le zero DEDUIT d une absence de tarif.
    const d = tarifer(acte({ code: 'prise-en-charge-totale' }), BAREME);
    assert.equal(d.ok, true);
    assert.equal(d.ligne.montant, 0);
  });
});

describe('un acte sans tarif n est PAS facture', () => {
  test('il est refuse, et le refus nomme le code manquant', () => {
    const d = tarifer(acte({ code: 'echographie-obstetricale' }), BAREME);
    assert.equal(d.ok, false);
    assert.equal(d.codeManquant, 'echographie-obstetricale');
    // Le motif doit permettre d agir : sans le code, le responsable cherche
    // a l aveugle ce qu il manque au bareme.
    assert.match(d.motif, /echographie-obstetricale/);
    assert.match(d.motif, /bareme/i);
  });

  test('IL N EST SURTOUT PAS FACTURE A ZERO', () => {
    const d = tarifer(acte({ code: 'inconnu-au-bareme' }), BAREME);
    assert.equal(d.ok, false);
    assert.equal('ligne' in d, false, 'aucune ligne ne doit sortir');
  });

  test('un bareme vide refuse tout', () => {
    assert.equal(tarifer(acte(), []).ok, false);
  });

  test('un montant negatif ou non entier est refuse', () => {
    assert.equal(tarifer(acte({ code: 'x' }), [{ code: 'x', libelle: 'X', montant: -5 }]).ok, false);
    assert.equal(tarifer(acte({ code: 'y' }), [{ code: 'y', libelle: 'Y', montant: 12.5 }]).ok, false);
  });
});

describe('sans origine, rien n est facturable', () => {
  test('un acte sans source est refuse', () => {
    // Sans source, rien n empeche de facturer deux fois le meme acte :
    // signer deux fois, recharger la page, rejouer un appel.
    const d = tarifer(acte({ source: '' }), BAREME);
    assert.equal(d.ok, false);
    assert.match(d.motif, /origine|refactur/i);
  });

  test('une quantite nulle ou fractionnaire est refusee', () => {
    assert.equal(tarifer(acte({ quantite: 0 }), BAREME).ok, false);
    assert.equal(tarifer(acte({ quantite: 1.5 }), BAREME).ok, false);
  });

  test('un acte sans code est refuse', () => {
    assert.equal(tarifer(acte({ code: '  ' }), BAREME).ok, false);
  });
});

describe('les codes du bareme', () => {
  test('une consultation d urgence ne porte pas le code d une consultation externe', () => {
    assert.equal(codeConsultation('programmable'), 'consultation-externe');
    assert.equal(codeConsultation('urgente'), 'consultation-urgence');
    assert.equal(codeConsultation('vitale'), 'consultation-urgence');
  });

  test('un examen prend son code LOINC quand il en a un', () => {
    assert.equal(codeExamen('2339-0', 'Glycemie'), 'examen:2339-0');
    // Sans LOINC, on retombe sur le nom : c est moins stable, mais c est
    // mieux que de ne pas pouvoir tarifer du tout.
    assert.equal(codeExamen(null, 'Goutte epaisse'), 'examen:goutte-epaisse');
  });

  test('un medicament prend son code ATC quand il en a un', () => {
    assert.equal(codeMedicament('J01CA04', 'Amoxicilline'), 'medicament:J01CA04');
    assert.equal(codeMedicament(null, 'Sirop de fer'), 'medicament:sirop-de-fer');
  });

  test('tarifDe rend null plutot que de deviner', () => {
    assert.equal(tarifDe(BAREME, 'inconnu'), null);
    assert.equal(tarifDe(BAREME, 'examen:2339-0').montant, 1000);
  });
});
