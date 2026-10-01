/**
 * Tests de la reconnaissance des mots-cles cliniques.
 *
 *   npm test
 *
 * Ce que ces tests garantissent, et surtout ce qu'ils ne garantissent pas :
 * on verifie qu'un quasi-manque est ramene au terme du formulaire, et — plus
 * important — qu'AUCUNE correction n'est faite des que le doute existe. Une
 * molecule corrigee vers la mauvaise voisine est pire qu'une molecule mal
 * orthographiee : la premiere est plausible et passera la relecture du
 * praticien, la seconde saute aux yeux.
 *
 * Le lexique est un jeu d'essai, pas le formulaire reel : ces tests portent sur
 * la regle de decision, pas sur le contenu des terminologies.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedDistance,
  boundedDistance,
  buildBiasPrompt,
  buildIndex,
  normalizeForm,
  normalizeKeywords,
} from '../lib/transcription/keywords.ts';

const LEXIQUE = [
  { canonical: 'Artemether + Lumefantrine', variants: ['coartem'], weight: 10 },
  { canonical: 'Paracetamol', variants: ['doliprane'], weight: 8 },
  { canonical: 'Amoxicilline', weight: 8 },
  { canonical: 'Ibuprofene', weight: 5 },
  { canonical: 'Quinine', weight: 6 },
  { canonical: 'paludisme', variants: ['palu'], weight: 10 },
  { canonical: 'toux', weight: 5 },
  // Paire volontairement quasi identique : elle n'existe que pour eprouver la
  // regle d'abstention en cas d'ex aequo.
  { canonical: 'Pyrantel', weight: 3 },
  { canonical: 'Pyrantol', weight: 3 },
];

const index = buildIndex(LEXIQUE);
const corrige = (t) => normalizeKeywords(t, index);

describe('normalisation des formes', () => {
  test('retire accents, casse et ponctuation', () => {
    assert.equal(normalizeForm('Paracétamol,'), 'paracetamol');
    assert.equal(normalizeForm('  DIARRHÉE  '), 'diarrhee');
  });

  test('le + des associations devient une espace', () => {
    assert.equal(normalizeForm('Artemether + Lumefantrine'), 'artemether lumefantrine');
  });
});

describe('distance bornee', () => {
  test('rend la distance exacte en deca de la borne', () => {
    assert.equal(boundedDistance('paracetamol', 'paracetamole', 2), 1);
    assert.equal(boundedDistance('quinine', 'quinine', 2), 0);
  });

  test('abandonne des que la borne est depassee', () => {
    assert.ok(boundedDistance('paludisme', 'amoxicilline', 2) > 2);
  });

  test('un terme court n a droit a aucune tolerance', () => {
    assert.equal(allowedDistance(4), 0);
    assert.equal(allowedDistance(6), 1);
    assert.equal(allowedDistance(12), 2);
  });
});

describe('correction vers le terme du formulaire', () => {
  test('ramene un quasi-manque a la molecule canonique', () => {
    const r = corrige('Je prescris du paracetamole pendant trois jours.');
    assert.match(r.text, /Paracetamol /);
    assert.equal(r.corrections.length, 1);
    assert.equal(r.corrections[0].to, 'Paracetamol');
    assert.equal(r.corrections[0].distance, 1);
  });

  test('prefere le terme long au terme court qu il contient', () => {
    const r = corrige('On demarre artemether lumefantrin ce soir.');
    assert.match(r.text, /Artemether \+ Lumefantrine/);
    assert.equal(r.corrections.length, 1);
  });

  test('rapporte la position de chaque correction', () => {
    const phrase = 'Le patient tousse, amoxicillin en sirop.';
    const r = corrige(phrase);
    const c = r.corrections.find((x) => x.to === 'Amoxicilline');
    assert.ok(c, 'la molecule aurait du etre reconnue');
    assert.equal(phrase.slice(c.index, c.index + c.from.length), c.from);
  });
});

describe('abstention — le coeur du garde-fou', () => {
  test('ne tranche pas entre deux termes aussi proches l un que l autre', () => {
    const r = corrige('On lui donne du pyrantil ce matin.');
    assert.equal(r.corrections.length, 0, 'ex aequo : aucune correction ne doit sortir');
    assert.match(r.text, /pyrantil/);
  });

  test('ne touche jamais a un mot court', () => {
    const phrase = 'Il tousse tous les jours.';
    const r = corrige(phrase);
    assert.equal(r.text, phrase);
    assert.equal(r.corrections.length, 0);
  });

  test('ne touche pas a un fragment portant un chiffre', () => {
    const phrase = 'Paracetamol 500 mg, trois fois par jour.';
    const r = corrige(phrase);
    assert.equal(r.text, phrase);
  });

  test('laisse intact un terme deja correct', () => {
    const phrase = 'Le paludisme est confirme par la goutte epaisse.';
    const r = corrige(phrase);
    assert.equal(r.text, phrase);
    assert.equal(r.corrections.length, 0);
  });

  test('respecte le mot employe par le locuteur quand il est au lexique', () => {
    // « doliprane » est une variante connue : elle est reconnue, donc protegee,
    // mais PAS reecrite en « Paracetamol ». La transcription doit rester
    // fidele a ce qui a ete dit ; c'est l'extraction qui fera la equivalence.
    const phrase = 'Elle a pris du doliprane hier soir.';
    const r = corrige(phrase);
    assert.equal(r.text, phrase);
    assert.equal(r.corrections.length, 0);
  });

  test('un mot etranger au domaine reste intact', () => {
    const phrase = 'Elle revient de Parakou avec sa grand-mere.';
    const r = corrige(phrase);
    assert.equal(r.text, phrase);
  });

  test('texte vide', () => {
    const r = corrige('');
    assert.equal(r.text, '');
    assert.equal(r.corrections.length, 0);
  });
});

describe('prompt de biaisage', () => {
  test('place les termes prioritaires en tete', () => {
    const prompt = buildBiasPrompt(LEXIQUE);
    const palu = prompt.indexOf('paludisme');
    const ibu = prompt.indexOf('Ibuprofene');
    assert.ok(palu > -1 && ibu > -1);
    assert.ok(palu < ibu, 'l epidemiologie locale doit survivre a la troncature');
  });

  test('respecte la taille demandee', () => {
    const prompt = buildBiasPrompt(LEXIQUE, 80);
    assert.ok(prompt.length < 140, `prompt trop long : ${prompt.length}`);
    assert.match(prompt, /Termes attendus/);
  });
});
