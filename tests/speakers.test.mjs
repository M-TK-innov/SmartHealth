/**
 * Tests de l'attribution automatique du locuteur.
 *
 *   npm test
 *
 * Ce que ces tests garantissent, et surtout ce qu'ils ne garantissent pas :
 * on verifie que les tournures franches sont bien classees et — plus
 * important — qu'une phrase ambigue reste « indeterminee » plutot que d'etre
 * attribuee au hasard. Dans un dossier medical, une phrase mise dans la
 * bouche du mauvais locuteur est pire qu'une phrase non attribuee.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { attributeSpeakers, clusterByPitch, guessFromText } from '../lib/ai/speakers.ts';

describe('attribution du locuteur — indices linguistiques', () => {
  test('reconnait le soignant a la prescription et a l examen', () => {
    const phrases = [
      'Je vous prescris de l amoxicilline 1 gramme.',
      'Depuis quand avez-vous ces douleurs ?',
      'Votre tension est a 14/9.',
      'L abdomen est souple, les tympans sont normaux.',
      'Revenez me voir dans trois jours pour un controle.',
      'Le tableau evoque un paludisme simple.',
    ];
    for (const p of phrases) {
      const g = guessFromText(p);
      assert.equal(g.speaker, 'clinician', `mal classe : ${p} -> ${g.speaker}`);
      assert.ok(g.confidence >= 0.5, `confiance trop faible sur : ${p}`);
    }
  });

  test('reconnait la personne soignee a la plainte a la premiere personne', () => {
    const phrases = [
      'Docteur, j ai mal au ventre depuis trois jours.',
      'Je tousse beaucoup la nuit.',
      'Ca me brule quand j urine.',
      'Je prends deja de la metformine.',
    ];
    for (const p of phrases) {
      const g = guessFromText(p);
      assert.equal(g.speaker, 'patient', `mal classe : ${p} -> ${g.speaker}`);
    }
  });

  test('reconnait l accompagnant quand il parle d un tiers', () => {
    const phrases = [
      'Mon fils a le corps chaud depuis trois jours.',
      'Le petit ne mange plus rien.',
      'Ma fille vomit depuis hier soir.',
    ];
    for (const p of phrases) {
      const g = guessFromText(p);
      assert.equal(g.speaker, 'companion', `mal classe : ${p} -> ${g.speaker}`);
    }
  });

  // Le test qui compte : le silence vaut mieux que l invention.
  test('laisse indetermine ce qui ne porte aucun indice', () => {
    for (const p of ['D accord.', 'Hmm.', 'Voila.', 'Bon.', '']) {
      const g = guessFromText(p);
      assert.equal(g.speaker, 'unknown', `attribue a tort : « ${p} » -> ${g.speaker}`);
      assert.equal(g.confidence, 0);
    }
  });

  /**
   * Cas trouve en testant sur une vraie consultation pediatrique : le medecin
   * interroge l accompagnant AU SUJET de l enfant, donc a la troisieme
   * personne. Sans regle sur la forme interrogative, tout l interrogatoire
   * basculait chez l accompagnant.
   */
  test('une question sur un tiers reste attribuee au soignant', () => {
    const questions = [
      'Est-ce qu il vomit ?',
      'Est-ce qu il tousse ?',
      'Depuis quand a-t-elle de la fievre ?',
      'Est-ce qu il dort sous moustiquaire ?',
      'Qu est-ce qui amene le petit aujourd hui ?',
    ];
    for (const q of questions) {
      const g = guessFromText(q);
      assert.equal(g.speaker, 'clinician', `mal classe : ${q} -> ${g.speaker}`);
    }
  });

  test('la forme interrogative est reconnue sans point d interrogation', () => {
    // La reconnaissance vocale ne ponctue presque jamais.
    const g = guessFromText('Est-ce qu il vomit');
    assert.equal(g.speaker, 'clinician');
    assert.ok(g.reasons.includes('forme interrogative'));
  });

  test('hors question, la troisieme personne reste a l accompagnant', () => {
    const g = guessFromText('Il a vomi deux fois hier soir.');
    assert.equal(g.speaker, 'companion', 'une affirmation sur un tiers vient bien de l accompagnant');
  });

  test('une question adressee au medecin reste au patient', () => {
    // Celui qui dit « docteur » s adresse au medecin : ce n est pas lui.
    for (const q of ['Docteur, c est grave ?', 'Docteur, je peux travailler demain ?']) {
      const g = guessFromText(q);
      assert.equal(g.speaker, 'patient', `mal classe : ${q} -> ${g.speaker}`);
    }
  });

  test('interpeller le medecin au sujet d un tiers designe l accompagnant', () => {
    // Cas releve sur la consultation pediatrique de demonstration.
    const g = guessFromText('Docteur, il a le corps chaud depuis trois jours, et il ne mange plus.');
    assert.equal(g.speaker, 'companion', 'un parent qui parle de son enfant au medecin n est pas le patient');
  });

  test('la confiance baisse quand deux indices se contredisent', () => {
    const franc = guessFromText('Je vous prescris du paracetamol trois fois par jour.');
    const ambigu = guessFromText('Docteur, je vous prescris quoi exactement ?');
    assert.ok(
      ambigu.confidence < franc.confidence,
      `une phrase ambigue ne devrait pas etre aussi sure qu une phrase franche (${ambigu.confidence} vs ${franc.confidence})`,
    );
  });
});

describe('attribution du locuteur — regroupement par hauteur de voix', () => {
  test('ne separe pas deux groupes quand les voix sont trop proches', () => {
    const result = clusterByPitch([120, 122, 118, 121, 119, 123]);
    assert.equal(result.threshold, null, 'un ecart de 5 Hz ne justifie pas deux locuteurs');
  });

  test('separe deux tessitures nettement distinctes', () => {
    const result = clusterByPitch([110, 115, 112, 210, 215, 208]);
    assert.notEqual(result.threshold, null);
    assert.equal(result.low.length, 3);
    assert.equal(result.high.length, 3);
  });

  test('ignore les valeurs hors de la voix parlee humaine', () => {
    const result = clusterByPitch([110, 115, 112, 5000, 2, 210, 215, 208]);
    assert.notEqual(result.threshold, null, '5000 Hz et 2 Hz ne doivent pas empecher le regroupement');
  });
});

describe('attribution du locuteur — consultation complete', () => {
  const consultation = [
    { text: 'Bonjour madame, asseyez-vous. Qu est-ce qui vous amene ?', hint: { pitchHz: 115 } },
    { text: 'Docteur, j ai mal a la tete depuis trois jours.', hint: { pitchHz: 210 } },
    { text: 'Est-ce que vous avez de la fievre ?', hint: { pitchHz: 118 } },
    { text: 'Oui, un peu le soir.', hint: { pitchHz: 205 } },
    { text: 'D accord.', hint: { pitchHz: 112 } },
    { text: 'Je vous prescris du paracetamol.', hint: { pitchHz: 116 } },
  ];

  test('classe correctement les tours porteurs d indices', () => {
    const result = attributeSpeakers(consultation);
    assert.equal(result[0].speaker, 'clinician');
    assert.equal(result[1].speaker, 'patient');
    assert.equal(result[2].speaker, 'clinician');
    assert.equal(result[5].speaker, 'clinician');
  });

  // Sans la hauteur de voix, « D accord. » resterait indetermine.
  test('rattrape un tour neutre grace a la hauteur de voix', () => {
    const result = attributeSpeakers(consultation);
    assert.equal(result[4].speaker, 'clinician', '« D accord » aurait du etre rattache au soignant');
    assert.ok(
      result[4].reasons.some((r) => r.includes('hauteur')),
      'la raison invoquee doit mentionner la hauteur de voix',
    );
  });

  test('sans hauteur de voix, un tour neutre reste indetermine', () => {
    const sansPitch = consultation.map((u) => ({ text: u.text }));
    const result = attributeSpeakers(sansPitch);
    assert.equal(result[4].speaker, 'unknown', 'sans indice, on n invente pas');
  });

  /**
   * Cas le plus defavorable : le tour n°0 dit « Bonjour madame, asseyez-vous »
   * — indice linguistique franc de soignant — et sa hauteur de voix le range
   * avec les autres tours du soignant. Les deux signaux automatiques pointent
   * donc vers « clinician ». Le praticien a pourtant tranche « accompagnant ».
   *
   * Sa decision doit survivre aux deux. Si l attribution manuelle cesse d etre
   * appliquee en premier, ce test tombe.
   */
  test('une correction du praticien resiste aux deux signaux automatiques', () => {
    const sansCorrection = attributeSpeakers(consultation);
    assert.equal(sansCorrection[0].speaker, 'clinician', 'pre-requis : ce tour est bien classe soignant par defaut');

    const avecCorrection = consultation.map((u, i) =>
      i === 0 ? { ...u, hint: { ...u.hint, manual: 'companion' } } : u,
    );
    const result = attributeSpeakers(avecCorrection);

    assert.equal(result[0].speaker, 'companion', 'la detection a ecrase la correction du praticien');
    assert.equal(result[0].confidence, 1);
    assert.equal(result[0].locked, true);
    assert.deepEqual(result[0].reasons, ['choix du praticien']);
  });
});
