/**
 * Verification des prerequis du poste.
 *
 *   npm test
 *
 * Ce qui est teste ici n'est pas la collecte — elle depend de la machine — mais
 * la REGLE : qu'est-ce qui empeche l'application de fonctionner, qu'est-ce qui
 * lui retire une capacite, et qu'est-ce qui n'est qu'une information.
 *
 * La distinction est tout l'interet du dispositif. Presenter une absence de
 * microphone comme un blocage ferait renoncer un centre de sante qui aurait
 * parfaitement pu saisir ses consultations a la main ; presenter un disque
 * plein comme une remarque ferait perdre des dossiers.
 *
 * Le module evalue est pur : ces environnements — un poste Linux sans Python,
 * un Windows sans disque — sont decrits, pas simules a moitie.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { verifier, bilan, NODE_MINIMUM } from '../lib/prerequis/regles.ts';
import { origineSure } from '../lib/prerequis/collecte.ts';

/** Un poste sain : tout est la, rien a signaler d'important. */
function posteSain(extra = {}) {
  return {
    plateforme: 'win32',
    nodeMajeur: 24,
    memoireMo: 8192,
    disqueLibreMo: 20480,
    donneesInscriptibles: true,
    cheminDonnees: 'C:/SmartHealth/donnees',
    origine: 'https://smarthealth.csc-cotonou.bj',
    origineSure: true,
    whisperLocalPresent: true,
    pythonPresent: true,
    pythonModulesManquants: [],
    serviceLangueLocalePresent: true,
    cleModeleLangage: true,
    ...extra,
  };
}

const codes = (r) => verifier(r).map((c) => c.code);
const niveau = (r, code) => verifier(r).find((c) => c.code === code)?.niveau;

describe('ce qui empeche l application de fonctionner', () => {
  test('un dossier de donnees non inscriptible bloque', () => {
    // L application s ouvrirait pour perdre tout ce qu on y saisit : c est le
    // pire des cas, parce qu il ne se voit qu apres la consultation.
    assert.equal(niveau(posteSain({ donneesInscriptibles: false }), 'DONNEES_NON_INSCRIPTIBLES'), 'bloquant');
  });

  test('un Node trop ancien bloque : SQLite y est absent', () => {
    assert.equal(niveau(posteSain({ nodeMajeur: NODE_MINIMUM - 1 }), 'NODE_TROP_ANCIEN'), 'bloquant');
  });

  test('la version de Node exigee passe', () => {
    assert.ok(!codes(posteSain({ nodeMajeur: NODE_MINIMUM })).includes('NODE_TROP_ANCIEN'));
  });

  test('un disque presque plein bloque', () => {
    assert.equal(niveau(posteSain({ disqueLibreMo: 120 }), 'DISQUE_INSUFFISANT'), 'bloquant');
  });

  test('un disque non mesurable ne bloque pas', () => {
    // Une sonde qui echoue ne doit pas empecher une installation : on ne sait
    // pas, donc on ne prononce pas.
    const c = codes(posteSain({ disqueLibreMo: null }));
    assert.ok(!c.includes('DISQUE_INSUFFISANT'));
    assert.ok(!c.includes('DISQUE_JUSTE'));
  });
});

describe('ce qui retire une capacite sans tout arreter', () => {
  test('sans HTTPS, le micro tombe mais le dossier medical reste', () => {
    // Bloquer ici serait faux : la saisie manuelle couvre toute la chaine.
    assert.equal(niveau(posteSain({ origineSure: false, origine: 'http://192.168.1.10:3000' }), 'ORIGINE_NON_SURE'), 'limitant');
  });

  test('sans modele local, il reste les autres moteurs', () => {
    assert.equal(niveau(posteSain({ whisperLocalPresent: false }), 'MODELE_LOCAL_ABSENT'), 'limitant');
  });

  test('sans Python, la langue locale tombe seule', () => {
    assert.equal(niveau(posteSain({ pythonPresent: false }), 'PYTHON_ABSENT'), 'limitant');
  });

  test('les modules absents sont nommes, pas resumes', () => {
    // Un message qui dit « des dependances manquent » oblige a chercher ;
    // celui qui les nomme se recopie dans un pip install.
    const c = verifier(posteSain({ pythonModulesManquants: ['torch', 'librosa'] })).find(
      (x) => x.code === 'MODULES_PYTHON_ABSENTS',
    );
    assert.ok(c.detail.includes('torch'));
    assert.ok(c.detail.includes('librosa'));
  });

  test('un poste sans le service de langue locale ne reclame ni Python ni ses modules', () => {
    // Le cas le plus frequent : une structure francophone qui n a jamais
    // installe le service. Lui parler de torch serait du bruit.
    const c = codes(posteSain({ serviceLangueLocalePresent: false, pythonPresent: false, pythonModulesManquants: ['torch'] }));
    assert.ok(!c.includes('PYTHON_ABSENT'));
    assert.ok(!c.includes('MODULES_PYTHON_ABSENTS'));
  });

  test('une memoire trop faible est signalee sans bloquer', () => {
    assert.equal(niveau(posteSain({ memoireMo: 1024 }), 'MEMOIRE_FAIBLE'), 'limitant');
  });
});

describe('ce qui n empeche rien', () => {
  test('l absence de cle de modele de langage est une remarque', () => {
    // Le moteur local deterministe prend le relais : c est un mode de marche
    // assume, pas une panne.
    assert.equal(niveau(posteSain({ cleModeleLangage: false }), 'MODELE_LANGAGE_ABSENT'), 'remarque');
  });

  test('un disque juste suffisant est une remarque, pas un blocage', () => {
    assert.equal(niveau(posteSain({ disqueLibreMo: 1024 }), 'DISQUE_JUSTE'), 'remarque');
  });
});

describe('bilan', () => {
  test('un poste sain est utilisable et ne raconte pas sa vie', () => {
    const c = verifier(posteSain());
    assert.equal(bilan(c).utilisable, true);
    assert.equal(bilan(c).bloquants, 0);
    assert.deepEqual(c, [], 'un poste sans probleme ne doit produire aucun constat');
  });

  test('un seul bloquant rend le poste inutilisable', () => {
    assert.equal(bilan(verifier(posteSain({ donneesInscriptibles: false }))).utilisable, false);
  });

  test('des capacites en moins laissent le poste utilisable', () => {
    const b = bilan(verifier(posteSain({ origineSure: false, whisperLocalPresent: false, pythonPresent: false })));
    assert.equal(b.utilisable, true);
    assert.equal(b.limitants, 3);
  });

  test('les bloquants sont listes en premier', () => {
    // L ordre est l ordre de lecture : ce qui decide si l installation peut
    // continuer doit etre en haut.
    //
    // Le cas est choisi pour que l ordre d ECRITURE des regles soit l inverse
    // de l ordre de lecture : le disque juste suffisant (remarque) appartient
    // au groupe STOCKAGE, ecrit avant le groupe PLATEFORME d ou vient le Node
    // trop ancien (bloquant). Sans tri, la remarque sortirait en tete.
    const c = verifier(posteSain({ disqueLibreMo: 1024, nodeMajeur: NODE_MINIMUM - 1 }));
    assert.deepEqual(
      c.map((x) => x.code),
      ['NODE_TROP_ANCIEN', 'DISQUE_JUSTE'],
    );
  });

  test('les trois niveaux sortent dans l ordre de gravite', () => {
    const c = verifier(
      posteSain({ disqueLibreMo: 1024, nodeMajeur: NODE_MINIMUM - 1, origineSure: false, cleModeleLangage: false }),
    );
    const rang = { bloquant: 0, limitant: 1, remarque: 2 };
    for (let i = 1; i < c.length; i++) {
      assert.ok(
        rang[c[i - 1].niveau] <= rang[c[i].niveau],
        `${c[i - 1].code} (${c[i - 1].niveau}) ne peut pas preceder ${c[i].code} (${c[i].niveau})`,
      );
    }
  });
});

describe('origine sure au sens des navigateurs', () => {
  test('https et boucle locale sont sures', () => {
    for (const o of ['https://csc.bj', 'http://localhost:3000', 'http://127.0.0.1:8080', 'http://app.localhost:3000']) {
      assert.equal(origineSure(o), true, `${o} devrait etre sure`);
    }
  });

  test('une adresse de reseau local en clair ne l est pas', () => {
    // C est precisement le cas du dispensaire : le serveur est joint en http
    // depuis une tablette, et le micro y est refuse.
    for (const o of ['http://192.168.1.10:3000', 'http://10.0.0.5', 'http://serveur-csc:3000']) {
      assert.equal(origineSure(o), false, `${o} ne devrait pas etre sure`);
    }
  });

  test('une origine illisible n est pas declaree sure', () => {
    assert.equal(origineSure('pas une url'), false);
  });
});
