/**
 * Bloc operatoire : programmation et checklist de securite.
 *
 *   npm test
 *
 * LES CAS QUI COMPTENT :
 *
 *   - une incision avant que le time out ne soit fait. La checklist de
 *     l'OMS existe parce qu'on a opere des gens du mauvais cote, et
 *     parfois la mauvaise personne ;
 *   - un geste lateralise programme sans cote. Un defaut silencieux sur
 *     une lateralite est le mecanisme meme de l'erreur de cote ;
 *   - deux interventions dans la meme salle au meme moment.
 *
 * Module pur : l'instant est passe en parametre.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  POINTS,
  entrerAuBloc,
  inciser,
  manquants,
  pointsDuTemps,
  programmeDeLaSalle,
  programmer,
  sortirDeSalle,
  tempsComplet,
} from '../lib/hopital/bloc.ts';

const H = (h, m = 0) => new Date(Date.UTC(2026, 9, 26, h, m, 0)).toISOString();

const aProgrammer = (extra = {}) => ({
  patientId: 'p-1',
  sejourId: 's-1',
  salleId: 'salle-1',
  geste: 'Cure de hernie inguinale',
  lateralise: true,
  lateralite: 'droite',
  debutPrevu: H(8),
  finPrevue: H(10),
  operateurId: 'op-1',
  ...extra,
});

const intervention = (extra = {}) => ({
  id: 'i-1',
  ...aProgrammer(),
  etat: 'programmee',
  entreeLe: null,
  inciseLe: null,
  termineLe: null,
  ...extra,
});

/** Une checklist ou tous les points d'un temps sont coches. */
const cochee = (...temps) => ({
  interventionId: 'i-1',
  coches: POINTS.filter((p) => temps.includes(p.temps)).map((p) => p.cle),
});

describe('lateralite', () => {
  test('un geste lateralise sans cote est refuse', () => {
    const d = programmer({
      intervention: aProgrammer({ lateralite: 'sans-objet' }),
      interventionsSalle: [],
    });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'LATERALITE_REQUISE');
    assert.match(d.remede, /droite|gauche|bilateral/i);
  });

  test('un cote declare sur un geste non lateralise est refuse aussi', () => {
    // L incoherence va dans les deux sens : « appendicectomie gauche »
    // signale une erreur de saisie qu il vaut mieux lever avant le bloc.
    const d = programmer({
      intervention: aProgrammer({ geste: 'Appendicectomie', lateralise: false, lateralite: 'gauche' }),
      interventionsSalle: [],
    });
    assert.equal(d.motif, 'LATERALITE_INCOHERENTE');
  });

  test('un geste non lateralise passe avec « sans-objet »', () => {
    const d = programmer({
      intervention: aProgrammer({ geste: 'Cesarienne', lateralise: false, lateralite: 'sans-objet' }),
      interventionsSalle: [],
    });
    assert.equal(d.ok, true);
  });

  test('bilateral est un cote valide', () => {
    const d = programmer({
      intervention: aProgrammer({ lateralite: 'bilateral' }),
      interventionsSalle: [],
    });
    assert.equal(d.ok, true);
  });
});

describe('occupation de la salle', () => {
  const enPlace = intervention({ id: 'deja', debutPrevu: H(9), finPrevue: H(11) });

  test('deux interventions qui se chevauchent sont refusees', () => {
    const d = programmer({
      intervention: aProgrammer({ debutPrevu: H(10), finPrevue: H(12) }),
      interventionsSalle: [enPlace],
    });
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'SALLE_OCCUPEE');
    assert.match(d.message, /09:00 a 11:00/);
    assert.match(d.remede, /autre salle|creneau libre/i);
  });

  test('deux creneaux qui se touchent ne se chevauchent pas', () => {
    // Bornes ouvertes : 9 h – 11 h puis 11 h – 13 h est le programme
    // normal d une salle. Les declarer en conflit ferait programmer le
    // bloc a cote du logiciel.
    const d = programmer({
      intervention: aProgrammer({ debutPrevu: H(11), finPrevue: H(13) }),
      interventionsSalle: [enPlace],
    });
    assert.equal(d.ok, true);
  });

  test('une intervention englobante est detectee', () => {
    const d = programmer({
      intervention: aProgrammer({ debutPrevu: H(8), finPrevue: H(14) }),
      interventionsSalle: [enPlace],
    });
    assert.equal(d.motif, 'SALLE_OCCUPEE');
  });

  test('une intervention contenue dans une autre est detectee', () => {
    const d = programmer({
      intervention: aProgrammer({ debutPrevu: H(9, 30), finPrevue: H(10) }),
      interventionsSalle: [enPlace],
    });
    assert.equal(d.motif, 'SALLE_OCCUPEE');
  });

  test('on peut ajouter un cas entierement avant celui qui est programme', () => {
    // Le cas qu on oublie de tester parce qu il parait trivial : un
    // creneau 6 h – 8 h devant une intervention de 9 h. Un chevauchement
    // teste dans un seul sens le declare en conflit, et le bloc ne peut
    // plus ajouter de cas tot le matin.
    const d = programmer({
      intervention: aProgrammer({ debutPrevu: H(6), finPrevue: H(8) }),
      interventionsSalle: [enPlace],
    });
    assert.equal(d.ok, true, '6 h – 8 h ne chevauche pas 9 h – 11 h');
  });

  test('une intervention annulee ne bloque plus la salle', () => {
    const d = programmer({
      intervention: aProgrammer({ debutPrevu: H(10), finPrevue: H(12) }),
      interventionsSalle: [{ ...enPlace, etat: 'annulee' }],
    });
    assert.equal(d.ok, true, 'une salle rendue doit pouvoir etre reprogrammee');
  });

  test('une autre salle ne gene pas', () => {
    const d = programmer({
      intervention: aProgrammer({ salleId: 'salle-2', debutPrevu: H(10), finPrevue: H(12) }),
      interventionsSalle: [enPlace],
    });
    assert.equal(d.ok, true);
  });

  test('une fin avant le debut est refusee', () => {
    const d = programmer({
      intervention: aProgrammer({ debutPrevu: H(10), finPrevue: H(8) }),
      interventionsSalle: [],
    });
    assert.equal(d.motif, 'CRENEAU_INVALIDE');
  });

  test('un creneau de duree nulle est refuse', () => {
    const d = programmer({
      intervention: aProgrammer({ debutPrevu: H(10), finPrevue: H(10) }),
      interventionsSalle: [],
    });
    assert.equal(d.motif, 'CRENEAU_INVALIDE');
  });
});

describe('checklist', () => {
  test('les trois temps portent chacun des points', () => {
    for (const t of ['avant-induction', 'avant-incision', 'avant-sortie']) {
      assert.ok(pointsDuTemps(t).length > 0, `${t} n a aucun point`);
    }
  });

  test('un temps incomplet est nomme point par point', () => {
    const partielle = { interventionId: 'i-1', coches: ['identite'] };
    const reste = manquants(partielle, 'avant-induction');
    assert.ok(reste.length > 0);
    assert.equal(reste.some((p) => p.cle === 'identite'), false, 'ce qui est coche ne manque plus');
    assert.equal(tempsComplet(partielle, 'avant-induction'), false);
  });

  test('cocher un autre temps ne complete pas celui-ci', () => {
    // Sans cette separation, cocher la sortie de salle avant d operer
    // suffirait a inciser.
    const d = cochee('avant-sortie');
    assert.equal(tempsComplet(d, 'avant-incision'), false);
  });
});

describe('entree au bloc', () => {
  test('elle exige le temps « avant induction »', () => {
    const d = entrerAuBloc(intervention(), { interventionId: 'i-1', coches: [] }, H(8));
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'CHECKLIST_INCOMPLETE');
  });

  test('le refus nomme ce qui manque', () => {
    // « Checklist incomplete » tout court fait rouvrir un ecran et relire
    // douze lignes, un jour ou l equipe est pressee. C est ainsi qu on
    // finit par tout cocher d un bloc.
    const presque = cochee('avant-induction');
    presque.coches = presque.coches.filter((c) => c !== 'allergies');
    const d = entrerAuBloc(intervention(), presque, H(8));
    assert.match(d.remede, /Allergies connues verifiees/);
  });

  test('complete, elle laisse entrer et horodate', () => {
    const d = entrerAuBloc(intervention(), cochee('avant-induction'), H(8, 15));
    assert.equal(d.ok, true);
    assert.equal(d.resultat.etat, 'patient-au-bloc');
    assert.equal(d.resultat.entreeLe, H(8, 15));
  });
});

describe('incision', () => {
  const auBloc = intervention({ etat: 'patient-au-bloc', entreeLe: H(8, 15) });

  test('ON N INCISE PAS SANS TIME OUT', () => {
    // Le cas qui justifie tout le module. Tant que le temps « avant
    // incision » n est pas complet, l incision est refusee — pas
    // signalee, refusee.
    const d = inciser(auBloc, cochee('avant-induction'), H(8, 40));
    assert.equal(d.ok, false);
    assert.equal(d.motif, 'CHECKLIST_INCOMPLETE');
    assert.match(d.message, /avant incision/);
  });

  test('le point le plus important est nomme quand il manque', () => {
    const presque = cochee('avant-induction', 'avant-incision');
    presque.coches = presque.coches.filter((c) => c !== 'patient-geste-site');
    const d = inciser(auBloc, presque, H(8, 40));
    assert.match(d.remede, /Patient, geste et site confirmes/);
  });

  test('complete, elle laisse inciser et horodate', () => {
    const d = inciser(auBloc, cochee('avant-induction', 'avant-incision'), H(8, 40));
    assert.equal(d.ok, true);
    assert.equal(d.resultat.etat, 'en-cours');
    assert.equal(d.resultat.inciseLe, H(8, 40));
  });

  test('on n incise pas un patient qui n est pas au bloc', () => {
    const d = inciser(intervention(), cochee('avant-induction', 'avant-incision'), H(8, 40));
    assert.equal(d.motif, 'ETAT_INCOMPATIBLE');
  });

  test('on n incise pas deux fois', () => {
    const d = inciser(
      intervention({ etat: 'en-cours' }),
      cochee('avant-induction', 'avant-incision'),
      H(9),
    );
    assert.equal(d.motif, 'ETAT_INCOMPATIBLE');
    assert.match(d.message, /deja commence/i);
  });

  test('sans operateur enregistre, pas d incision', () => {
    const d = inciser(
      { ...auBloc, operateurId: null },
      cochee('avant-induction', 'avant-incision'),
      H(8, 40),
    );
    assert.equal(d.motif, 'OPERATEUR_REQUIS');
  });

  test('la lateralite est revérifiée au moment d inciser', () => {
    // Elle a deja ete verifiee a la programmation, mais le dossier a pu
    // etre repris entre-temps. C est le dernier moment ou l erreur de
    // cote est encore rattrapable.
    const d = inciser(
      { ...auBloc, lateralite: 'sans-objet' },
      cochee('avant-induction', 'avant-incision'),
      H(8, 40),
    );
    assert.equal(d.motif, 'LATERALITE_REQUISE');
  });
});

describe('sortie de salle', () => {
  const enCours = intervention({ etat: 'en-cours', entreeLe: H(8, 15), inciseLe: H(8, 40) });

  test('le comptage des compresses conditionne la sortie', () => {
    const presque = cochee('avant-sortie');
    presque.coches = presque.coches.filter((c) => c !== 'comptage');
    const d = sortirDeSalle(enCours, presque, H(10));
    assert.equal(d.ok, false);
    assert.match(d.remede, /Compresses et instruments/);
  });

  test('complete, elle termine l intervention et horodate', () => {
    const d = sortirDeSalle(enCours, cochee('avant-sortie'), H(10, 5));
    assert.equal(d.ok, true);
    assert.equal(d.resultat.etat, 'terminee');
    assert.equal(d.resultat.termineLe, H(10, 5));
  });

  test('on ne sort pas d une intervention qui n a pas commence', () => {
    const d = sortirDeSalle(intervention(), cochee('avant-sortie'), H(10));
    assert.equal(d.motif, 'ETAT_INCOMPATIBLE');
  });
});

describe('programme de la salle', () => {
  test('il est rendu dans l ordre de passage, annulees exclues', () => {
    const interventions = [
      intervention({ id: 'midi', debutPrevu: H(11), finPrevue: H(12) }),
      intervention({ id: 'matin', debutPrevu: H(8), finPrevue: H(10) }),
      intervention({ id: 'annulee', debutPrevu: H(7), finPrevue: H(8), etat: 'annulee' }),
      intervention({ id: 'autre-salle', salleId: 'salle-2', debutPrevu: H(6), finPrevue: H(7) }),
    ];
    const p = programmeDeLaSalle('salle-1', interventions);
    assert.deepEqual(p.interventions.map((i) => i.id), ['matin', 'midi']);
    assert.equal(p.minutesProgrammees, 180, '120 minutes le matin et 60 a midi');
  });
});
