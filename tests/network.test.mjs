/**
 * Tests des restrictions appliquees aux adresses et aux serveurs.
 *
 *   npm test
 *
 * Ce qui est teste ici n'est pas l'ergonomie de la page mais le moteur qui
 * REFUSE une configuration. Chaque cas verifie qu'un reglage dangereux est
 * bloque, et surtout qu'il ne peut pas etre contourne : en mentant sur la
 * portee d'un serveur, en deposant une derogation sur une autre cible, ou en
 * demandant une derogation pour une regle qui n'en admet pas.
 *
 * Le module evalue est volontairement pur — aucune base, aucun reseau — ce qui
 * permet de le tester tel qu'il tourne en production, et pas une imitation.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEROGABLE_CODES,
  evaluate,
  isPrivateHost,
  parseUrl,
  sameVolume,
} from '../lib/compliance/rules.ts';

/** Configuration d'un poste isole : rien d'expose, rien qui sorte. */
const baseConfig = {
  app_public_url: null,
  app_bind_host: '127.0.0.1',
  app_port: 3000,
  app_https: 0,
  allowed_origins: '',
  fhir_access: 'session',
  db_path: 'C:/Users/medecin/AppData/ParleDocteur/parledocteur.db',
  db_backup_dir: 'D:/sauvegardes',
  db_encrypted: 1,
  data_residency_country: 'BJ',
  allow_external_transfer: 0,
};

const endpoint = (over = {}) => ({
  id: 'srv-1',
  label: 'Serveur de test',
  scope: 'internal',
  category: 'fhir',
  url: 'https://sih.hopital.local/fhir',
  enabled: 1,
  auth_mode: 'token',
  secret_env: 'FHIR_EXPORT_TOKEN',
  data_class: 'none',
  country: 'BJ',
  verify_tls: 1,
  ...over,
});

const run = (config = {}, endpoints = [], extra = {}) =>
  evaluate({
    config: { ...baseConfig, ...config },
    endpoints,
    secretsPresent: { FHIR_EXPORT_TOKEN: true, FHIR_API_TOKEN: true },
    ...extra,
  });

const codes = (evaluation) => evaluation.findings.map((f) => f.code);
const has = (evaluation, code) => codes(evaluation).includes(code);
const levelOf = (evaluation, code) => evaluation.findings.find((f) => f.code === code)?.level;

// ---------------------------------------------------------------- adresses

describe('reconnaissance des adresses', () => {
  test('les plages privees sont reconnues comme internes', () => {
    for (const h of ['10.0.0.5', '192.168.1.20', '172.16.4.1', '172.31.255.255', '127.0.0.1', 'localhost']) {
      assert.equal(isPrivateHost(h), true, `${h} devrait etre prive`);
    }
  });

  test('172.32 est publique — la plage privee s arrete a 172.31', () => {
    // Erreur classique : traiter tout 172.x comme prive ouvrirait la porte a
    // des adresses reellement routables declarees internes.
    assert.equal(isPrivateHost('172.32.0.1'), false);
    assert.equal(isPrivateHost('172.15.0.1'), false);
  });

  test('un nom de domaine public n est pas interne', () => {
    for (const h of ['api.anthropic.com', 'sih.hopital.bj', 'exemple.fr']) {
      assert.equal(isPrivateHost(h), false, `${h} ne devrait pas etre prive`);
    }
  });

  test('un nom de machine sans point est local', () => {
    assert.equal(isPrivateHost('serveur-sante'), true);
    assert.equal(isPrivateHost('nas.local'), true);
  });

  test('un secret dans l adresse est detecte, en userinfo comme en parametre', () => {
    assert.equal(parseUrl('https://user:motdepasse@srv.bj/fhir').hasUserInfo, true);
    assert.deepEqual(parseUrl('https://srv.bj/fhir?api_key=abc').secretParams, ['api_key']);
    assert.deepEqual(parseUrl('https://srv.bj/fhir?patient=42').secretParams, []);
  });

  test('deux chemins du meme volume sont reconnus', () => {
    assert.equal(sameVolume('C:/donnees/base.db', 'C:/sauvegardes'), true);
    assert.equal(sameVolume('C:/donnees/base.db', 'D:/sauvegardes'), false);
    assert.equal(sameVolume('/var/lib/pd/base.db', '/var/backups'), true);
    assert.equal(sameVolume('/var/lib/pd/base.db', '/mnt/nas'), false);
  });
});

// ------------------------------------------------------------- application

describe('adresse de l application', () => {
  test('un poste isole sans serveur declare est acceptable', () => {
    const ev = run();
    assert.equal(ev.acceptable, true, `manquements inattendus : ${codes(ev).join(', ')}`);
  });

  test('exposer au reseau sans HTTPS est une restriction a lever', () => {
    const ev = run({ app_bind_host: '0.0.0.0' });
    assert.equal(levelOf(ev, 'RESEAU_SANS_TLS'), 'restricted');
    assert.equal(ev.acceptable, false);
  });

  test('exposer au reseau en HTTPS ne declenche rien', () => {
    const ev = run({ app_bind_host: '0.0.0.0', app_https: 1, app_public_url: 'https://pd.hopital.bj' });
    assert.equal(has(ev, 'RESEAU_SANS_TLS'), false);
    assert.equal(ev.acceptable, true, `manquements inattendus : ${codes(ev).join(', ')}`);
  });

  test('origine * combinee a une ecoute reseau est bloquante, sans recours', () => {
    const ev = run({ app_bind_host: '0.0.0.0', app_https: 1, allowed_origins: '*' });
    assert.equal(levelOf(ev, 'ORIGINES_TOUTES'), 'blocking');
    assert.equal(ev.blocking.length > 0, true);
  });

  test('origine * sur un poste isole reste une simple alerte', () => {
    // La severite suit l exposition reelle : alerter au maximum partout use la
    // vigilance et fait ignorer les cas graves.
    const ev = run({ allowed_origins: '*' });
    assert.equal(levelOf(ev, 'ORIGINES_TOUTES'), 'warning');
    assert.equal(ev.acceptable, true);
  });

  test('l API FHIR ouverte est une restriction, jamais un defaut silencieux', () => {
    const ev = run({ fhir_access: 'open' });
    assert.equal(levelOf(ev, 'API_FHIR_SANS_AUTHENTIFICATION'), 'restricted');
  });

  test('le mode jeton sans jeton defini est bloquant', () => {
    const ev = evaluate({
      config: { ...baseConfig, fhir_access: 'token' },
      endpoints: [],
      secretsPresent: { FHIR_API_TOKEN: false },
    });
    assert.equal(levelOf(ev, 'JETON_API_ABSENT'), 'blocking');
  });

  test('un port declare different du port ecoute est signale', () => {
    const ev = run({}, [], { livePort: 49213 });
    assert.equal(levelOf(ev, 'PORT_DECLARE_INCOHERENT'), 'warning');
  });
});

// -------------------------------------------------------------------- base

describe('base de donnees', () => {
  test('une base sur un partage reseau est refusee sans recours', () => {
    const ev = run({ db_path: '\\\\nas\\sante\\parledocteur.db' });
    assert.equal(levelOf(ev, 'BASE_SUR_PARTAGE_RESEAU'), 'blocking');
    assert.equal(ev.acceptable, false);
  });

  test('sauvegardes sur le meme volume que la base : alerte', () => {
    const ev = run({ db_path: 'C:/donnees/base.db', db_backup_dir: 'C:/sauvegardes' });
    assert.equal(levelOf(ev, 'SAUVEGARDE_MEME_SUPPORT'), 'warning');
  });

  test('base non chiffree : alerte, pas blocage', () => {
    const ev = run({ db_encrypted: 0 });
    assert.equal(levelOf(ev, 'BASE_NON_CHIFFREE'), 'warning');
    assert.equal(ev.acceptable, true);
  });
});

// ---------------------------------------------------------------- serveurs

describe('serveurs declares', () => {
  test('un serveur desactive ne produit aucun manquement', () => {
    const ev = run({}, [endpoint({ enabled: 0, scope: 'internal', url: 'http://api.exemple.com', data_class: 'identifying' })]);
    assert.equal(ev.findings.length, 0, `manquements inattendus : ${codes(ev).join(', ')}`);
  });

  test('donnees identifiantes en HTTP vers un hote distant : bloquant', () => {
    const ev = run({ allow_external_transfer: 1 }, [
      endpoint({ scope: 'external', url: 'http://sih.exemple.bj/fhir', data_class: 'identifying', country: 'BJ' }),
    ]);
    assert.equal(levelOf(ev, 'TRANSPORT_EN_CLAIR'), 'blocking');
  });

  test('un Whisper local en HTTP sur la boucle locale reste accepte', () => {
    // Le cas le plus courant en dispensaire : whisper.cpp sur le meme poste.
    // Exiger TLS sur 127.0.0.1 ferait desinstaller la transcription locale au
    // profit d un service en ligne — exactement l inverse du but recherche.
    const ev = run({}, [
      endpoint({
        scope: 'internal',
        category: 'whisper',
        url: 'http://127.0.0.1:8080/inference',
        data_class: 'identifying',
        auth_mode: 'none',
        secret_env: null,
      }),
    ]);
    assert.equal(has(ev, 'TRANSPORT_EN_CLAIR'), false);
    assert.equal(ev.acceptable, true, `manquements inattendus : ${codes(ev).join(', ')}`);
  });

  test('declarer interne un serveur d adresse publique est bloquant', () => {
    // Verrou central : la portee est ce qui assouplit les autres controles.
    const ev = run({}, [endpoint({ scope: 'internal', url: 'https://api.anthropic.com/v1/messages' })]);
    assert.equal(levelOf(ev, 'PORTEE_DECLAREE_FAUSSE'), 'blocking');
  });

  test('un secret depose dans l adresse est bloquant', () => {
    const ev = run({}, [endpoint({ url: 'https://srv.hopital.local/fhir?token=abc123' })]);
    assert.equal(levelOf(ev, 'SECRET_DANS_ADRESSE'), 'blocking');
  });

  test('desactiver la verification du certificat est bloquant', () => {
    const ev = run({}, [endpoint({ verify_tls: 0 })]);
    assert.equal(levelOf(ev, 'CERTIFICAT_NON_VERIFIE'), 'blocking');
  });

  test('flux sortant alors que les transferts sont interdits : bloquant', () => {
    const ev = run({ allow_external_transfer: 0 }, [
      endpoint({ scope: 'external', url: 'https://sih.exemple.bj/fhir', data_class: 'pseudonymised' }),
    ]);
    assert.equal(levelOf(ev, 'TRANSFERT_EXTERNE_DESACTIVE'), 'blocking');
  });

  test('DHIS2 alimente en donnees nominatives est bloquant', () => {
    const ev = run({ allow_external_transfer: 1 }, [
      endpoint({
        scope: 'external',
        category: 'dhis2',
        url: 'https://dhis2.sante.gouv.bj/api/tracker',
        data_class: 'identifying',
        country: 'BJ',
      }),
    ]);
    assert.equal(levelOf(ev, 'SURVEILLANCE_NOMINATIVE'), 'blocking');
  });

  test('un destinataire externe sans authentification est bloquant', () => {
    const ev = run({ allow_external_transfer: 1 }, [
      endpoint({
        scope: 'external',
        url: 'https://sih.exemple.bj/fhir',
        data_class: 'pseudonymised',
        auth_mode: 'none',
        secret_env: null,
        country: 'BJ',
      }),
    ]);
    assert.equal(levelOf(ev, 'DESTINATAIRE_NON_AUTHENTIFIE'), 'blocking');
  });

  test('le mode mTLS est signale : rien ne presente de certificat client', () => {
    // Piege a eviter : proposer un mode d authentification que la couche de
    // transmission n implemente pas donnerait un flux declare authentifie qui
    // part en realite sans identite.
    const ev = run({}, [endpoint({ auth_mode: 'mtls', secret_env: null, data_class: 'identifying' })]);
    assert.equal(levelOf(ev, 'MTLS_NON_PORTE_PAR_L_APPLICATION'), 'warning');
  });

  test('un secret declare mais absent du serveur est signale sans bloquer', () => {
    const ev = evaluate({
      config: { ...baseConfig },
      endpoints: [endpoint({ secret_env: 'FHIR_EXPORT_TOKEN' })],
      secretsPresent: { FHIR_EXPORT_TOKEN: false },
    });
    assert.equal(levelOf(ev, 'SECRET_ABSENT'), 'warning');
    assert.equal(ev.acceptable, true);
  });
});

// ------------------------------------------------------------- derogations

describe('derogations', () => {
  const crossBorder = () =>
    run({ allow_external_transfer: 1 }, [
      endpoint({
        id: 'srv-llm',
        scope: 'external',
        category: 'llm',
        url: 'https://api.anthropic.com/v1/messages',
        data_class: 'identifying',
        country: 'US',
      }),
    ]);

  test('un transfert hors territoire est une restriction, pas un blocage', () => {
    const ev = crossBorder();
    assert.equal(levelOf(ev, 'TRANSFERT_HORS_TERRITOIRE'), 'restricted');
    assert.equal(ev.acceptable, false);
    assert.equal(ev.pending.length >= 1, true);
  });

  test('une derogation ecrite rend la configuration enregistrable', () => {
    const ev = evaluate({
      config: { ...baseConfig, allow_external_transfer: 1 },
      endpoints: [
        endpoint({
          id: 'srv-llm',
          scope: 'external',
          category: 'llm',
          url: 'https://api.anthropic.com/v1/messages',
          data_class: 'identifying',
          country: 'US',
        }),
      ],
      derogations: [
        { code: 'TRANSFERT_HORS_TERRITOIRE', target: 'srv-llm', reason: 'Autorisation APDP n 2026-114', granted_by_label: 'Dr K.', granted_at: '2026-09-18 10:00:00' },
        { code: 'MODELE_TIERS_DONNEES_IDENTIFIANTES', target: 'srv-llm', reason: 'Contrat de sous-traitance signe', granted_by_label: 'Dr K.', granted_at: '2026-09-18 10:00:00' },
      ],
      secretsPresent: { FHIR_EXPORT_TOKEN: true },
    });
    assert.equal(ev.pending.length, 0, `restrictions restantes : ${ev.pending.map((f) => f.code).join(', ')}`);
    assert.equal(ev.waived.length, 2);
    assert.equal(ev.acceptable, true);
  });

  test('une derogation posee sur une autre cible ne leve rien', () => {
    // Sans la cle (code, cible), une derogation accordee pour un serveur en
    // couvrirait un autre : il suffirait de declarer un serveur anodin,
    // d obtenir la levee, puis de brancher le vrai.
    const ev = evaluate({
      config: { ...baseConfig, allow_external_transfer: 1 },
      endpoints: [
        endpoint({
          id: 'srv-llm',
          scope: 'external',
          category: 'llm',
          url: 'https://api.anthropic.com/v1/messages',
          data_class: 'identifying',
          country: 'US',
        }),
      ],
      derogations: [
        { code: 'TRANSFERT_HORS_TERRITOIRE', target: 'un-autre-serveur', reason: 'x'.repeat(40), granted_by_label: 'Dr K.', granted_at: '2026-09-18 10:00:00' },
      ],
      secretsPresent: { FHIR_EXPORT_TOKEN: true },
    });
    assert.equal(
      ev.pending.some((f) => f.code === 'TRANSFERT_HORS_TERRITOIRE'),
      true,
    );
    assert.equal(ev.acceptable, false);
  });

  test('une derogation ne leve jamais un manquement bloquant', () => {
    const ev = evaluate({
      config: { ...baseConfig },
      endpoints: [endpoint({ id: 'srv-1', verify_tls: 0 })],
      derogations: [
        { code: 'CERTIFICAT_NON_VERIFIE', target: 'srv-1', reason: 'x'.repeat(40), granted_by_label: 'Dr K.', granted_at: '2026-09-18 10:00:00' },
      ],
      secretsPresent: { FHIR_EXPORT_TOKEN: true },
    });
    assert.equal(levelOf(ev, 'CERTIFICAT_NON_VERIFIE'), 'blocking');
    assert.equal(ev.findings.find((f) => f.code === 'CERTIFICAT_NON_VERIFIE').waived, undefined);
    assert.equal(ev.acceptable, false);
  });

  test('toute restriction levable figure bien dans la liste des codes levables', () => {
    // Invariant qui empeche une impasse : si le moteur classe un manquement en
    // « a lever » sans que son code soit levable, l interface affiche un bouton
    // que la route refuse, et la configuration ne peut plus jamais etre
    // enregistree. L inverse est sans danger : une derogation ne s applique
    // jamais a un manquement bloquant.
    const levable = new Set(DEROGABLE_CODES);
    const scenarios = [
      // exposition reseau sans TLS
      run({ app_bind_host: '0.0.0.0' }),
      // API FHIR ouverte
      run({ fhir_access: 'open' }),
      // flux agrege en clair vers un serveur du reseau local
      run({}, [
        endpoint({ scope: 'internal', url: 'http://nas.local/collecte', data_class: 'aggregated' }),
      ]),
      // modele de langage tiers alimente en donnees identifiantes, hors territoire
      run({ allow_external_transfer: 1 }, [
        endpoint({
          id: 'srv-llm',
          scope: 'external',
          category: 'llm',
          url: 'https://api.anthropic.com/v1/messages',
          data_class: 'identifying',
          country: 'US',
        }),
      ]),
    ];

    const restreintes = new Set();
    for (const ev of scenarios) {
      for (const f of ev.findings) if (f.level === 'restricted') restreintes.add(f.code);
    }

    // Le jeu de scenarios doit reellement produire des restrictions, sinon
    // l invariant passerait sur un ensemble vide sans rien verifier.
    assert.equal(restreintes.size >= 4, true, `scenarios trop pauvres : ${[...restreintes].join(', ')}`);

    for (const code of restreintes) {
      assert.equal(levable.has(code), true, `${code} est classe « a lever » mais n est pas levable`);
    }
  });
});
