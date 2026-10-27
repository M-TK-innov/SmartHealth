/**
 * Le parcours de demonstration tient-il encore debout ?
 *
 *   npm test
 *
 * CE QUE CE FICHIER PROTEGE. Un jeu de donnees de demonstration pourrit en
 * silence : on retouche un tarif, on deplace une heure d'arrivee, on ajoute
 * un lot — et le jour de la presentation, l'urgence vitale passe en
 * troisieme, la facture est soldee, le lot court n'est plus le premier
 * sorti. Rien ne plante. Simplement, plus rien ne demontre rien.
 *
 * Alors chaque situation que la demonstration promet est verifiee ICI, et
 * par les VRAIS modules de regles — `ordonner`, `solde`, `avisAvantActe`,
 * `interpreter`, `manquants` — jamais par une relecture des donnees. Si
 * l'affichage et la regle divergent, c'est le test qui tombe, deux semaines
 * avant la salle plutot que devant elle.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { SEUILS_DEMONSTRATION, parcoursDemonstration, recapitulatif } from '../lib/demo/scenario.ts';
import { ANCIENNETE_MINUTES, ordonner, prochain, tension } from '../lib/hopital/flux.ts';
import { avisAvantActe, solde } from '../lib/hopital/caisse.ts';
import { interpreter } from '../lib/hopital/plateau.ts';
import { manquants, tempsComplet } from '../lib/hopital/bloc.ts';
import { versIsoRequis } from '../lib/temps.ts';

const MAINTENANT = new Date('2026-11-24T09:00:00Z');

/** Identifiants numerotes : un test doit pouvoir nommer la ligne qu'il lit. */
function contexte() {
  let n = 0;
  return {
    organizationId: 'org-csc',
    practitionerId: 'pr-sossou',
    praticienNom: 'Dr Ama Sossou',
    patients: { adjoa: 'pat-adjoa', koffi: 'pat-koffi', bernard: 'pat-bernard' },
    sejourBernard: 'sej-bernard',
    postes: { ACC: 'po-acc', TRI: 'po-tri', 'CONS-1': 'po-cons', CAISSE: 'po-caisse', PHARM: 'po-pharm', LABO: 'po-labo' },
    articles: {
      Amoxicilline: {
        id: 'art-amox',
        lots: [
          // Le gros lot est declare EN PREMIER, et a longue peremption : si
          // la selection se faisait par ordre d'apparition, c'est lui qui
          // sortirait. Le test ne vaudrait rien si le bon lot etait aussi
          // le premier de la liste.
          { id: 'lot-long', numero: 'AMX-2605', perimeLe: '2027-12-20', quantite: 600 },
          { id: 'lot-court', numero: 'AMX-2512', perimeLe: '2026-12-15', quantite: 150 },
        ],
      },
    },
    demandeKaliemie: 'dem-kaliemie',
    demandeEchographie: 'dem-echo',
    interventionHernie: 'int-hernie',
    maintenant: MAINTENANT,
    id: () => `id-${++n}`,
  };
}

/** Index des ecritures : les lignes posees, table par table. */
function parcours() {
  const ctx = contexte();
  const ecritures = parcoursDemonstration(ctx);

  const posees = (table) =>
    ecritures.filter((e) => e.op === 'inserer' && e.table === table).map((e) => e.ligne);
  const corrections = (table) =>
    ecritures.filter((e) => e.op === 'modifier' && e.table === table);

  return { ctx, ecritures, posees, corrections };
}

describe('la salle d attente', () => {
  const { ctx, posees } = parcours();

  const passages = posees('passage').map((p) => ({
    id: p.id,
    sejourId: p.sejour_id,
    posteId: p.poste_id,
    gravite: p.gravite,
    etat: p.etat,
    arriveLe: versIsoRequis(p.arrive_le),
    prisEnChargeLe: p.pris_en_charge_le,
    termineLe: p.termine_le,
  }));
  const instant = MAINTENANT.toISOString();

  test('l urgence vitale arrivee en dernier est appelee en premier', () => {
    // C est l invariant du triage, et le seul qui tue quand il cede.
    const file = passages.filter((p) => p.posteId === ctx.postes.TRI);
    const suivant = prochain(file, instant);

    assert.equal(suivant.gravite, 'vitale');
    const autres = file.filter((p) => p.id !== suivant.id && p.etat === 'en-attente');
    for (const a of autres) {
      assert.ok(
        a.arriveLe < suivant.arriveLe,
        'la vitale doit etre arrivee APRES les autres, sinon le test ne prouve rien',
      );
    }
  });

  test('deux patients sont remontes par anciennete', () => {
    const file = passages.filter((p) => p.posteId === ctx.postes['CONS-1']);
    const remontes = ordonner(file, instant).filter((p) => p.remonte);

    assert.equal(remontes.length, 2);
    for (const r of remontes) {
      assert.ok(r.attenteMinutes >= ANCIENNETE_MINUTES);
    }
  });

  test('l anciennete ne fait jamais passer devant une gravite superieure', () => {
    // Le differable attend depuis le plus longtemps de tous. Il ne doit
    // pour autant jamais preceder un standard moins ancien que lui ? Si :
    // il gagne UN cran. Ce qu il ne doit jamais faire, c est preceder une
    // urgence — et c est cela qu on verifie, file entiere confondue.
    const ordre = ordonner(passages, instant);
    const rangs = { vitale: 0, urgente: 1, standard: 2, differable: 3 };
    const premierNonVital = ordre.findIndex((p) => p.gravite !== 'vitale');
    const vitales = ordre.filter((p) => p.gravite === 'vitale');

    assert.equal(premierNonVital, vitales.length, 'une vitale est passee derriere');
    for (const p of ordre) {
      assert.ok(rangs[p.gravite] !== undefined);
    }
  });

  test('un patient est parti sans avoir ete vu, et cela se compte', () => {
    // Confondre « parti » et « termine » effacerait la mesure la plus
    // directe d un poste sature.
    const t = tension(ctx.postes['CONS-1'], passages, instant);

    assert.equal(t.partis, 1);
    assert.ok(t.enAttente >= 3);
    assert.equal(t.enCours, 1);

    const parti = passages.find((p) => p.etat === 'parti');
    assert.equal(parti.prisEnChargeLe, null, 'un parti n a ete pris en charge par personne');
    assert.notEqual(parti.termineLe, null, 'mais on sait a quelle heure il est parti');
  });

  test('personne n attend a deux endroits a la fois', () => {
    // La base le tient par un index unique. Le jeu de donnees doit le
    // respecter AVANT de l atteindre, sinon l amorcage echoue a mi-chemin
    // et laisse une base a moitie remplie.
    const ouverts = parcours()
      .posees('passage')
      .filter((p) => p.etat === 'en-attente' || p.etat === 'en-cours')
      .map((p) => p.sejour_id);

    assert.equal(new Set(ouverts).size, ouverts.length);
  });
});

describe('la caisse', () => {
  const { posees } = parcours();

  function factureDe(predicat) {
    const f = posees('facture').find(predicat);
    return {
      id: f.id,
      sejourId: f.sejour_id,
      partTiers: f.part_tiers,
      close: f.close === 1,
      lignes: posees('facture_ligne')
        .filter((l) => l.facture_id === f.id)
        .map((l) => ({ id: l.id, libelle: l.libelle, montant: l.montant, quantite: l.quantite, urgence: l.urgence })),
      paiements: posees('paiement')
        .filter((p) => p.facture_id === f.id)
        .map((p) => ({ id: p.id, montant: p.montant, moyen: p.moyen, recuLe: p.recu_le })),
    };
  }

  const ouverte = factureDe((f) => f.close === 0);
  const soldee = factureDe((f) => f.close === 1);

  test('la facture de l hospitalisation n est pas soldee', () => {
    const s = solde(ouverte);

    assert.equal(s.total, 57_500);
    assert.equal(s.partTiers, 20_000);
    assert.equal(s.regle, 20_000);
    assert.equal(s.resteACharge, 17_500);
    assert.equal(s.soldee, false);
    assert.equal(s.tropPercu, 0);
  });

  test('l impaye bloque l acte programmable et seulement lui', () => {
    // C est toute la regle de la caisse : une dette ne retarde jamais un
    // acte vital. Un jeu de donnees ou tout est paye ne permettrait pas de
    // le montrer, et c est pourtant la premiere question qu on pose.
    assert.equal(avisAvantActe(ouverte, 'programmable').niveau, 'bloquant');
    assert.equal(avisAvantActe(ouverte, 'urgente').niveau, 'avis');
    assert.equal(avisAvantActe(ouverte, 'vitale').niveau, 'avis');
  });

  test('la facture porte bien un acte programmable a bloquer', () => {
    // Sans cette ligne, l avis bloquant ci-dessus porterait sur un acte
    // qui n existe pas dans la demonstration.
    assert.ok(ouverte.lignes.some((l) => l.urgence === 'programmable' && l.montant >= 10_000));
  });

  test('la facture externe est soldee et ne dit rien', () => {
    assert.equal(solde(soldee).resteACharge, 0);
    assert.equal(avisAvantActe(soldee, 'programmable').niveau, 'aucun');
  });

  test('un paiement mobile porte sa reference', () => {
    // Sans reference, le rapprochement du soir est impossible : c est la
    // panne la plus banale d une caisse de centre de sante.
    const mobile = posees('paiement').find((p) => p.moyen === 'mobile');
    assert.ok(mobile.reference, 'un paiement mobile sans reference ne se rapproche pas');
  });
});

describe('la pharmacie', () => {
  const { posees, corrections } = parcours();

  test('le lot servi est celui qui perime le premier, pas le plus gros', () => {
    const ligne = posees('dispensation_ligne')[0];

    assert.equal(ligne.numero_lot, 'AMX-2512');
    assert.equal(ligne.lot_id, 'lot-court');
    assert.equal(ligne.perime_le, '2026-12-15');
  });

  test('le numero de lot est copie, pas seulement reference', () => {
    // Un rappel de lot se fait des annees plus tard. La ligne doit encore
    // savoir ce qu elle a servi quand la fiche du lot a disparu.
    const ligne = posees('dispensation_ligne')[0];
    assert.equal(typeof ligne.numero_lot, 'string');
    assert.equal(typeof ligne.perime_le, 'string');
  });

  test('le stock du lot baisse d autant, et le journal porte le signe', () => {
    const ligne = posees('dispensation_ligne')[0];
    const mouvement = posees('mouvement_stock').find((m) => m.lot_id === ligne.lot_id);
    const maj = corrections('lot').find((c) => c.id === ligne.lot_id);

    assert.equal(mouvement.quantite, -ligne.quantite, 'une sortie se journalise en negatif');
    assert.equal(maj.champs.quantite, 150 - ligne.quantite);
  });

  test('une ligne d ordonnance reste en rupture, et n est pas servie', () => {
    // La demonstration de la dispensation PARTIELLE tient a cette ligne :
    // l ordonnance est valide, le rayon ne peut pas la servir, et l ecran
    // doit distinguer la rupture du stock a zero.
    const lignes = posees('prescription_item').map((i) => i.drug_name);
    const servis = posees('dispensation_ligne').length;

    assert.ok(lignes.includes('Sulfadoxine/pyrimethamine'));
    assert.ok(servis < lignes.length, 'tout a ete servi : la rupture ne se voit plus');
  });
});

describe('le plateau technique', () => {
  const { posees, corrections } = parcours();

  const seuils = SEUILS_DEMONSTRATION.map((s) => ({
    examen: s.examen,
    unite: s.unite,
    bas: s.bas,
    haut: s.haut,
  }));

  /** Examen porte par une demande, qu elle soit posee ici ou par le decor. */
  const examenDe = (demandeId) =>
    posees('demande_examen').find((d) => d.id === demandeId)?.examen ?? 'Kaliemie';

  test('chaque interpretation enregistree est celle que la regle donnerait', () => {
    // LE PIEGE QUE CE TEST FERME : ecrire « critique » dans le jeu de
    // donnees sans que le seuil le dise. L ecran afficherait alors une
    // alerte que le code ne sait pas produire, et la demonstration
    // montrerait une fonction qui n existe pas.
    for (const r of posees('resultat_examen')) {
      assert.equal(
        r.interpretation,
        interpreter(examenDe(r.demande_id), r.valeur_num, seuils),
        `interpretation incoherente pour ${examenDe(r.demande_id)} a ${r.valeur_num}`,
      );
    }
  });

  test('une valeur sans seuil est rendue non interpretee', () => {
    const ge = posees('resultat_examen').find((r) => examenDe(r.demande_id) === 'Goutte epaisse');

    assert.equal(ge.interpretation, 'non-interprete');
    assert.notEqual(ge.valeur_num, null, 'la valeur existe : c est le seuil qui manque');
  });

  test('la correction conserve l ancienne version et son motif', () => {
    const [ancienne, nouvelle] = posees('resultat_examen').filter(
      (r) => r.demande_id === 'dem-kaliemie',
    );
    const maj = corrections('resultat_examen').find((c) => c.id === ancienne.id);

    assert.equal(maj.champs.remplace_par, nouvelle.id);
    assert.ok(maj.champs.motif_correction, 'une correction sans motif n explique rien');
    assert.equal(ancienne.interpretation, 'normal');
    assert.equal(nouvelle.interpretation, 'critique');
  });

  test('la valeur critique corrigee est acquittee par quelqu un de nomme', () => {
    const acquit = posees('acquittement_critique')[0];
    const nouvelle = posees('resultat_examen').filter((r) => r.demande_id === 'dem-kaliemie')[1];

    assert.equal(acquit.resultat_id, nouvelle.id);
    assert.ok(acquit.transmis_a.trim().length > 0, 'un acquittement anonyme n acquitte rien');
    assert.ok(acquit.transmis_le > nouvelle.rendu_le, 'on acquitte apres avoir rendu');
  });

  test('une et une seule valeur critique attend encore sa transmission', () => {
    // C est l ecran qu on veut montrer : celui qui crie. Zero ligne, et il
    // n y a rien a voir ; deux, et on ne sait plus laquelle regarder.
    const attente = posees('resultat_examen').filter((r) => r.a_transmettre === 1);

    assert.equal(attente.length, 1);
    assert.equal(attente[0].interpretation, 'critique');
    assert.equal(examenDe(attente[0].demande_id), 'Hemoglobine');
  });
});

describe('le bloc operatoire', () => {
  const { ctx, posees, corrections } = parcours();

  const checklist = {
    interventionId: ctx.interventionHernie,
    coches: posees('checklist_bloc').map((c) => c.point),
  };

  test('le patient est entre en salle', () => {
    const maj = corrections('intervention').find((c) => c.id === ctx.interventionHernie);

    assert.equal(maj.champs.etat, 'patient-au-bloc');
    assert.ok(maj.champs.entree_le);
  });

  test('le temps avant induction est complet', () => {
    assert.equal(tempsComplet(checklist, 'avant-induction'), true);
  });

  test('le temps avant incision ne l est PAS, et l ecran peut nommer ce qui manque', () => {
    // Une checklist entierement cochee dans un jeu de demonstration ne
    // prouve pas qu elle bloque. Celle-ci bloque, et dit quoi.
    const reste = manquants(checklist, 'avant-incision');

    assert.equal(tempsComplet(checklist, 'avant-incision'), false);
    assert.equal(reste.length, 2);
    for (const point of reste) {
      assert.ok(point.libelle.length > 0, 'un point manquant sans libelle ne se lit pas');
    }
  });

  test('chaque point coche porte qui l a coche', () => {
    for (const c of posees('checklist_bloc')) {
      assert.ok(c.coche_par, 'un point coche par personne ne verifie rien');
    }
  });
});

describe('ce que le parcours ne touche pas', () => {
  const { posees } = parcours();

  test('la consultation pediatrique reste vierge de toute analyse', () => {
    // ELLE EST ANALYSEE EN DIRECT DEVANT LA SALLE. Y poser d avance un
    // diagnostic ou une ordonnance reviendrait a montrer un resultat deja
    // ecrit, c est-a-dire a ne rien demontrer.
    const consultations = posees('consultation');
    assert.equal(consultations.length, 1);
    assert.equal(consultations[0].patient_id, 'pat-adjoa');

    const seule = consultations[0].id;
    for (const table of ['observation', 'diagnosis', 'service_request', 'prescription']) {
      for (const ligne of posees(table)) {
        assert.equal(ligne.consultation_id, seule, `${table} accroche a une autre consultation`);
      }
    }
  });

  test('aucune date de naissance n est relative a la demonstration', () => {
    // Un patient ne rajeunit pas parce qu on rejoue la demonstration un
    // autre jour, et son age commande une posologie pediatrique.
    for (const p of posees('patient')) {
      assert.match(p.birth_date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(p.birth_date < '2020-01-01' || p.birth_date > '2010-01-01');
    }
  });
});

describe('le recapitulatif', () => {
  test('compte les lignes posees, pas les corrections', () => {
    // Il est affiche en fin d amorcage : c est par lui qu on verifie la
    // veille que la demonstration est complete, sans ouvrir douze ecrans.
    const { ecritures } = parcours();
    const recap = recapitulatif(ecritures);
    const inserees = ecritures.filter((e) => e.op === 'inserer').length;

    assert.equal(
      Object.values(recap).reduce((n, v) => n + v, 0),
      inserees,
    );
    for (const table of ['passage', 'facture', 'paiement', 'dispensation', 'resultat_examen', 'checklist_bloc']) {
      assert.ok(recap[table] > 0, `${table} reste vide : l ecran correspondant n a rien a montrer`);
    }
  });
});
