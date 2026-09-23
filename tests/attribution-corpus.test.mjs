/**
 * L'invariant d'attribution, tenu sur corpus annote.
 *
 *   npm test          pour l'invariant
 *   npm run mesure    pour lire le detail
 *
 * Ce fichier existe parce qu'un chiffre annonce ne vaut que s'il est recalcule.
 * « Zero attribution fausse » compte a la main devient faux au premier
 * changement de la detection, et personne ne s'en apercoit — surtout pas celui
 * qui le montre sur une diapositive.
 *
 * CE QUI EST UN INVARIANT, ET CE QUI NE L'EST PAS :
 *
 *   - zero confusion MEDECIN / NON-MEDECIN : INVARIANT. Elle change la nature
 *     de l'enonce — une plainte du patient devient une observation du medecin,
 *     et entre au dossier sans rien reveiller. C'est l'erreur que personne ne
 *     voit, et que le praticien ne rattrape pas a la relecture.
 *
 *   - confusion PATIENT / ACCOMPAGNANT : suivie, non nulle. L'enonce reste du
 *     cote de celui qui vient se faire soigner. Le texte seul ne distingue pas
 *     toujours les deux : « Non, jamais eu de probleme avec les medicaments »
 *     ne porte aucun indice de qui le dit. Le compte est fige dans le corpus
 *     pour qu'une degradation soit vue, pas pour pretendre qu'elle n'existe pas.
 *
 *   - le nombre de tours corrects : MESURE. Il bouge quand la detection
 *     change, et c'est legitime.
 *
 * Le piege : « zero faute » s'obtient trivialement en ne tranchant jamais.
 * D'ou le plancher de couverture, sans lequel l'invariant serait vide.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { mesurer } from '../lib/ai/mesure.ts';

const DOSSIER = path.join(import.meta.dirname, '..', 'corpus');
const CORPUS = readdirSync(DOSSIER)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(path.join(DOSSIER, f), 'utf8')));

describe('attribution des tours de parole, sur corpus annote', () => {
  test('il y a bien un corpus a mesurer', () => {
    // Sans corpus, tous les tests ci-dessous passeraient a vide.
    assert.ok(CORPUS.length > 0, 'aucun corpus annote dans corpus/');
    for (const c of CORPUS) assert.ok(c.tours.length > 0, `${c.id} est vide`);
  });

  for (const corpus of CORPUS) {
    describe(corpus.id, () => {
      const m = mesurer(corpus.tours);

      const detailler = (classe) =>
        m.ecarts
          .filter((e) => e.classe === classe)
          .map((e) => `  tour ${e.seq} : attendu ${e.attendu}, obtenu ${e.obtenu}\n    « ${e.text} »`)
          .join('\n');

      test('aucune confusion entre le medecin et les autres', () => {
        // L'invariant. C'est la seule erreur qui change le SENS de l'enonce, et
        // la seule que le praticien ne puisse pas rattraper a la relecture : un
        // propos du patient passe en observation medicale ne choque personne.
        assert.equal(
          m.confusionsRole,
          0,
          `${m.confusionsRole} confusion(s) medecin/non-medecin :\n${detailler('role')}`,
        );
      });

      test('les confusions patient / accompagnant restent au niveau connu', () => {
        // Non nul, et assume. Ce test n'exige pas zero — il empeche que le
        // chiffre monte sans que personne ne le voie. Le baisser demanderait de
        // distinguer deux personnes qui, dans le texte, ne se distinguent pas
        // toujours : c'est un travail sur le signal, pas un reglage de seuil.
        const connu = corpus.confusions_entourage_connues ?? 0;
        assert.ok(
          m.confusionsEntourage <= connu,
          `${m.confusionsEntourage} confusion(s) patient/accompagnant, ${connu} attendue(s) :\n${detailler('entourage')}`,
        );
      });

      test('le systeme tranche quand meme sur la majorite des tours', () => {
        // Sans ce plancher, l'invariant serait vide : un systeme qui repond
        // « indetermine » partout n'a aucune faute et aucun usage.
        assert.ok(
          m.couverture >= 0.7,
          `couverture tombee a ${Math.round(m.couverture * 100)} % : le systeme n ose plus rien attribuer`,
        );
      });

      test('un tour non tranche reste indetermine, jamais attribue au hasard', () => {
        // Chaque tour tombe dans exactement une des trois cases : c'est ce qui
        // rend le compte lisible, et interdit une quatrieme issue silencieuse.
        assert.equal(m.correctes + m.indeterminees + m.fausses, m.total);
      });
    });
  }
});
