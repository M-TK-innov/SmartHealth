/**
 * Ce qui attend un patient, et qui doit s'en charger.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE : L'ORDRE. Ce module ne calcule rien de
 * compliquer — il choisit lequel de dix besoins passe devant. C'est
 * exactement le genre de regle qu'une modification bien intentionnee casse
 * sans bruit : on ajoute un cas en tete « parce qu'il est urgent aussi », et
 * la valeur critique se retrouve en troisieme position.
 *
 * Et la seconde garantie : RIEN DE CLINIQUE N'EST AUTOMATIQUE. Une
 * automatisation qui signe a la place de quelqu'un ne fait pas gagner du
 * temps, elle deplace la responsabilite sans le dire.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ETAT_VIDE, prochaineEtape, toutCeQuiAttend } from '../lib/parcours/regles.ts';

const etat = (extra = {}) => ({ ...ETAT_VIDE, ...extra });

describe('ce qui passe devant', () => {
  test('une valeur critique non acquittee passe avant TOUT le reste', () => {
    // Le cas qui compte : le patient doit aussi de l argent, a une ordonnance
    // a retirer et un compte rendu a signer. Rien de cela ne tue.
    const s = prochaineEtape(
      etat({
        critiqueNonAcquittee: true,
        consultationASigner: 'c-1',
        ordonnanceAValider: true,
        ordonnanceARetirer: true,
        resteACharge: 17_500,
        aPrelever: 3,
      }),
    );
    assert.equal(s.etape, 'resultat');
    assert.match(s.libelle, /critique/i);
    assert.equal(s.qui, 'medecin');
  });

  test('la signature passe avant l ordonnance a valider', () => {
    // Tant que le compte rendu n est pas signe, rien n en sort : ni
    // ordonnance valable, ni ligne de rapport mensuel.
    const s = prochaineEtape(etat({ consultationASigner: 'c-1', ordonnanceAValider: true }));
    assert.equal(s.etape, 'consultation');
  });

  test('le prelevement passe avant la relecture d un resultat', () => {
    const s = prochaineEtape(etat({ aPrelever: 2, resultatsNonLus: 5 }));
    assert.equal(s.etape, 'examen');
    assert.equal(s.qui, 'laboratoire');
  });

  test('LA CAISSE VIENT APRES LE SOIN, jamais avant', () => {
    // Facturer avant de soigner est precisement ce qu on ne veut pas
    // automatiser. L ordonnance a delivrer passe devant le reste a charge.
    const s = prochaineEtape(etat({ ordonnanceARetirer: true, resteACharge: 17_500 }));
    assert.equal(s.etape, 'pharmacie');
  });

  test('un lit manquant passe avant la pharmacie et la caisse', () => {
    const s = prochaineEtape(
      etat({ sejour: { id: 's-1', litAssigne: false }, ordonnanceARetirer: true, resteACharge: 900 }),
    );
    assert.equal(s.etape, 'lit');
  });

  test('sans rien en attente, la reponse est « rien »', () => {
    assert.equal(prochaineEtape(ETAT_VIDE).etape, 'rien');
  });
});

describe('ce que la plateforme fait seule, et ce qu elle ne fait pas', () => {
  test('AUCUN GESTE CLINIQUE N EST AUTOMATIQUE', () => {
    const cliniques = [
      etat({ critiqueNonAcquittee: true }),
      etat({ consultationASigner: 'c-1' }),
      etat({ ordonnanceAValider: true }),
      etat({ aPrelever: 1 }),
      etat({ resultatsNonLus: 1 }),
      etat({ ordonnanceARetirer: true }),
      etat({ resteACharge: 500 }),
    ];
    for (const e of cliniques) {
      const s = prochaineEtape(e);
      assert.equal(s.automatique, false, `${s.etape} ne doit jamais etre automatique`);
    }
  });

  test('l assignation d un lit n est PAS automatique', () => {
    // La plateforme sait proposer un lit libre. Choisir qui va ou releve de
    // l accueil, qui sait ce que la liste ne dit pas : un voisin de chambre,
    // une famille, une contagion.
    const s = prochaineEtape(etat({ sejour: { id: 's-1', litAssigne: false } }));
    assert.equal(s.automatique, false);
  });

  test('le placement en file est le seul enchainement automatique', () => {
    const s = prochaineEtape(etat({ file: { posteId: 'p-1', posteNom: 'Accueil', etat: 'en-attente' } }));
    assert.equal(s.etape, 'accueil');
    assert.equal(s.automatique, true);
  });
});

describe('chaque suite dit POURQUOI, quand ce n est pas evident', () => {
  test('les etapes qui bloquent portent leur motif', () => {
    for (const e of [
      etat({ critiqueNonAcquittee: true }),
      etat({ consultationASigner: 'c-1' }),
      etat({ ordonnanceAValider: true }),
      etat({ aPrelever: 1 }),
      etat({ sejour: { id: 's-1', litAssigne: false } }),
    ]) {
      const s = prochaineEtape(e);
      assert.ok(s.pourquoi.length > 10, `${s.etape} doit dire pourquoi maintenant`);
    }
  });

  test('une consultation en cours ne se justifie pas : elle se constate', () => {
    assert.equal(prochaineEtape(etat({ consultationOuverte: 'c-1' })).pourquoi, '');
  });
});

describe('tout ce qui attend, et non la seule suite', () => {
  test('les etapes sortent dans l ordre du risque', () => {
    const suites = toutCeQuiAttend(
      etat({
        critiqueNonAcquittee: true,
        consultationASigner: 'c-1',
        ordonnanceARetirer: true,
        resteACharge: 17_500,
      }),
    );
    assert.deepEqual(
      suites.map((s) => s.etape),
      ['resultat', 'consultation', 'pharmacie', 'caisse'],
    );
  });

  test('un etat vide ne rend aucune suite', () => {
    assert.deepEqual(toutCeQuiAttend(ETAT_VIDE), []);
  });

  test('l enumeration se termine toujours', () => {
    // Une regle qui ne consomme pas ce qu elle rend ferait une boucle
    // infinie en production. La borne est ici, et ce test la verifie sur
    // l etat le plus charge qu on puisse construire.
    const suites = toutCeQuiAttend(
      etat({
        file: { posteId: 'p-1', posteNom: 'Accueil', etat: 'en-attente' },
        consultationOuverte: 'c-0',
        consultationASigner: 'c-1',
        aPrelever: 4,
        resultatsNonLus: 2,
        critiqueNonAcquittee: true,
        ordonnanceAValider: true,
        ordonnanceARetirer: true,
        resteACharge: 42_000,
        sejour: { id: 's-1', litAssigne: false },
      }),
    );
    assert.ok(suites.length > 0 && suites.length < 20);

    // AUCUNE SUITE IDENTIQUE DEUX FOIS. On compare le couple etape + libelle,
    // et non la seule etape : « acquitter une valeur critique » et « relire
    // deux resultats » sont tous deux de l etape `resultat`, et ce sont bien
    // deux gestes distincts. Ne comparer que l etape ferait echouer ce test
    // sur un comportement correct, et pousserait a fondre les deux en un.
    const vues = suites.map((s) => `${s.etape}:${s.libelle}`);
    assert.equal(new Set(vues).size, vues.length, vues.join(' | '));
  });
});
