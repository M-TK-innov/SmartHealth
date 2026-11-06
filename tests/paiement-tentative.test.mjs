/**
 * Tentative de paiement en ligne.
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE :
 *
 *   - qu'une confirmation recue DEUX FOIS ne cree qu'un seul paiement.
 *     Tous les operateurs renvoient leur notification quand ils n'ont pas
 *     vu l'accuse de reception ; sans cet invariant, la facture serait
 *     creditee deux fois ;
 *   - qu'un echec annonce APRES une confirmation ne defasse pas le
 *     paiement : l'argent est arrive, le dire n'y change rien ;
 *   - qu'une reussite tardive apres un echec soit bien prise. Refuser un
 *     paiement reel se paie plus cher qu'un etat transitoire bizarre ;
 *   - qu'aucune ligne de paiement ne naisse d'autre chose qu'une
 *     confirmation ;
 *   - que le montant enregistre soit celui de l'OPERATEUR, jamais celui
 *     demande au depart.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALPHABET_REFERENCE,
  LONGUEUR_REFERENCE,
  appliquer,
  enAttente,
  formaterReference,
  messageEtat,
  referenceFacture,
  montantRecevable,
  normaliserReference,
} from '../lib/paiement/tentative.ts';

describe('montant demande', () => {
  test('un montant entier inferieur au reste a charge passe', () => {
    assert.equal(montantRecevable(2000, 5000).ok, true);
  });

  test('le montant exact du reste a charge passe', () => {
    assert.equal(montantRecevable(5000, 5000).ok, true);
  });

  test('un montant fractionnaire est refuse, pas arrondi', () => {
    // Le franc CFA n'a pas de centimes : une fraction vient d'un calcul
    // fait ailleurs, et l'arrondir en silence masquerait ce calcul.
    const r = montantRecevable(1500.5, 5000);
    assert.equal(r.ok, false);
    assert.match(r.motif, /entier/i);
  });

  test('zero et les negatifs sont refuses', () => {
    assert.equal(montantRecevable(0, 5000).ok, false);
    assert.equal(montantRecevable(-100, 5000).ok, false);
  });

  test('un depassement est refuse AVANT paiement, et le refus dit combien payer', () => {
    const r = montantRecevable(6000, 5000);
    assert.equal(r.ok, false);
    assert.match(r.motif, /5000/);
  });

  test('une facture soldee ne se paie pas', () => {
    const r = montantRecevable(1000, 0);
    assert.equal(r.ok, false);
    assert.match(r.motif, /soldee/i);
  });
});

describe('confirmation', () => {
  test('une confirmation cree le paiement et clot la tentative', () => {
    const t = appliquer({ etat: 'initiee' }, { type: 'confirmation', montant: 2000 });
    assert.equal(t.etat, 'confirmee');
    assert.equal(t.enregistrerPaiement, true);
    assert.equal(t.montant, 2000);
  });

  test('le montant enregistre est celui de l operateur, pas celui demande', () => {
    // Paiement partiel : l'ecart doit se voir sur la facture.
    const t = appliquer({ etat: 'initiee' }, { type: 'confirmation', montant: 1500 });
    assert.equal(t.montant, 1500);
  });

  test('une SECONDE confirmation ne cree pas un second paiement', () => {
    // Le cas le plus courant en production : l operateur renvoie sa
    // notification tant qu il n a pas vu notre accuse de reception.
    const t = appliquer({ etat: 'confirmee' }, { type: 'confirmation', montant: 2000 });
    assert.equal(t.enregistrerPaiement, false);
    assert.equal(t.etat, null);
  });

  test('un montant confirme aberrant n enregistre rien', () => {
    for (const montant of [0, -500, 12.5]) {
      const t = appliquer({ etat: 'initiee' }, { type: 'confirmation', montant });
      assert.equal(t.enregistrerPaiement, false, `montant ${montant}`);
      assert.equal(t.etat, null);
    }
  });
});

describe('ce qui ne cree jamais de paiement', () => {
  test('un echec', () => {
    const t = appliquer({ etat: 'initiee' }, { type: 'echec' });
    assert.equal(t.enregistrerPaiement, false);
    assert.equal(t.etat, 'echouee');
  });

  test('une expiration', () => {
    const t = appliquer({ etat: 'initiee' }, { type: 'expiration' });
    assert.equal(t.enregistrerPaiement, false);
    assert.equal(t.etat, 'expiree');
  });

  test('aucun evenement autre qu une confirmation n ecrit de ligne', () => {
    for (const etat of ['initiee', 'echouee', 'expiree', 'confirmee']) {
      for (const e of [{ type: 'echec' }, { type: 'expiration' }]) {
        assert.equal(appliquer({ etat }, e).enregistrerPaiement, false, `${etat} / ${e.type}`);
      }
    }
  });
});

describe('une confirmation est definitive', () => {
  test('un echec annonce apres une confirmation est ignore', () => {
    // L'argent est arrive. Le dire n'y change rien, et repasser la
    // tentative en echec ferait disparaitre le paiement des comptes.
    const t = appliquer({ etat: 'confirmee' }, { type: 'echec', motif: 'timeout operateur' });
    assert.equal(t.etat, null);
    assert.equal(t.enregistrerPaiement, false);
  });

  test('une expiration annoncee apres une confirmation est ignoree', () => {
    assert.equal(appliquer({ etat: 'confirmee' }, { type: 'expiration' }).etat, null);
  });
});

describe('un echec n est PAS definitif', () => {
  test('une reussite tardive apres un echec est prise', () => {
    // Refuser un paiement reellement recu se paie plus cher qu'un etat
    // transitoire bizarre : le patient aurait verse sans que cela compte.
    const t = appliquer({ etat: 'echouee' }, { type: 'confirmation', montant: 3000 });
    assert.equal(t.etat, 'confirmee');
    assert.equal(t.enregistrerPaiement, true);
    assert.equal(t.montant, 3000);
  });

  test('une reussite tardive apres expiration est prise aussi', () => {
    const t = appliquer({ etat: 'expiree' }, { type: 'confirmation', montant: 3000 });
    assert.equal(t.etat, 'confirmee');
    assert.equal(t.enregistrerPaiement, true);
  });

  test('une expiration apres un echec ne change rien', () => {
    assert.equal(appliquer({ etat: 'echouee' }, { type: 'expiration' }).etat, null);
  });
});

describe('references', () => {
  test('l alphabet ecarte les caracteres qui se confondent', () => {
    for (const c of ['O', '0', 'I', '1', 'L', 'S']) {
      assert.equal(ALPHABET_REFERENCE.includes(c), false, `${c} ne devrait pas y etre`);
    }
  });

  test('la saisie est nettoyee et mise en majuscules', () => {
    assert.equal(normaliserReference(' ab-cd ef9-2 '), 'ABCDEF92');
  });

  test('une reference complete se lit en deux groupes', () => {
    const r = 'ABCDE23456';
    assert.equal(r.length, LONGUEUR_REFERENCE);
    assert.equal(formaterReference(r), 'ABCDE 23456');
  });

  test('une valeur inattendue est rendue telle quelle, sans invention', () => {
    assert.equal(formaterReference('XX'), 'XX');
  });
});

describe('ce qui est dit au patient', () => {
  test('aucun message ne promet que la facture est soldee', () => {
    for (const etat of ['initiee', 'confirmee', 'echouee', 'expiree']) {
      assert.doesNotMatch(messageEtat(etat), /soldee/i, etat);
    }
  });

  test('un echec dit que rien n a ete preleve', () => {
    assert.match(messageEtat('echouee'), /rien n'?a ete preleve/i);
  });

  test('une expiration renvoie a la caisse avec la reference', () => {
    assert.match(messageEtat('expiree'), /caisse/i);
    assert.match(messageEtat('expiree'), /reference/i);
  });

  test('seule une tentative initiee est en attente', () => {
    assert.equal(enAttente('initiee'), true);
    for (const etat of ['confirmee', 'echouee', 'expiree']) {
      assert.equal(enAttente(etat), false, etat);
    }
  });
});

describe('reference d une facture', () => {
  test('une seule fonction la produit, donc le patient dicte ce que la caisse voit', () => {
    // Defaut qu'a nomme ce test : l'ecran affichait un identifiant court en
    // tete de facture et une reference differente dans le bloc de reglement.
    // Le patient dictait l'une, le caissier cherchait l'autre.
    const id = 'acf21d28-9f3b-4c7a-8e21-5d9b0c1e4477';
    assert.equal(referenceFacture(id), 'ACF2 1D28');
  });

  test('elle est stable : deux appels donnent le meme resultat', () => {
    const id = 'dd024e0d-67b4-46be-9c8d-9621b8290f20';
    assert.equal(referenceFacture(id), referenceFacture(id));
  });

  test('les tirets ne la decalent pas', () => {
    assert.equal(referenceFacture('ab-cd-ef-12-34'), referenceFacture('abcdef1234'));
  });

  test('un identifiant trop court est rendu tel quel, sans invention', () => {
    assert.equal(referenceFacture('abc'), 'ABC');
  });
});
