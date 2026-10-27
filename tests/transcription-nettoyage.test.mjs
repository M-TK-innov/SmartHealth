/**
 * Nettoyage d'un extrait rendu par Whisper.
 *
 *   npm test
 *
 * LA LIGNE DE CONDUITE, que ces cas defendent dans les deux sens :
 *
 *   on supprime ce qu'aucun soignant ne dirait en consultation, et RIEN
 *   d'autre. Supprimer une parole reelle est pire que laisser passer un
 *   artefact : l'artefact se voit a la relecture, le mot manquant non.
 *
 * La moitie des cas verifie donc qu'on ne supprime PAS.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { REPETITIONS_MAX, nettoyer } from '../lib/transcription/nettoyage.ts';

describe('artefacts de silence', () => {
  test('les generiques de sous-titrage sont jetes', () => {
    for (const faux of [
      "Sous-titres réalisés par la communauté d'Amara.org",
      'Sous-titrage Société Radio-Canada',
      "Merci d'avoir regardé cette vidéo !",
      'Abonnez-vous à la chaîne.',
      '[Musique]',
      '(bruit de fond)',
    ]) {
      const r = nettoyer(faux);
      assert.equal(r.garder, false, `« ${faux} » aurait du etre jete`);
      assert.equal(r.motif, 'artefact-de-silence');
    }
  });

  test('les notes de musique seules tombent comme ponctuation', () => {
    // Elles ne portent ni lettre ni chiffre : elles sont jetees avant
    // d'atteindre la liste des artefacts, et c'est tres bien ainsi.
    const r = nettoyer('♪♪');
    assert.equal(r.garder, false);
    assert.equal(r.motif, 'ponctuation-seule');
  });

  test('« Merci. » est CONSERVE', () => {
    // Le cas qui dit ou passe la ligne. « Merci » se dit tout le temps en
    // consultation ; le jeter parce qu il ressemble a une fin de video
    // supprimerait une parole reelle plusieurs fois par jour.
    const r = nettoyer('Merci.');
    assert.equal(r.garder, true);
    assert.equal(r.texte, 'Merci.');
  });

  test('un artefact noye dans une vraie phrase est conserve entier', () => {
    // On ne sait pas ou la parole s arrete : decouper reviendrait a
    // deviner, et a jeter potentiellement du contenu clinique. La regle
    // vaut pour CHAQUE formule de la liste, pas seulement pour la
    // premiere — d'ou les deux tournures ci-dessous.
    const merci = nettoyer("Le patient dit merci d'avoir regardé son dossier.");
    assert.equal(merci.garder, true);
    assert.match(merci.texte, /dossier/);

    const titres = nettoyer(
      "Il m'a montré une vidéo avec des sous-titres réalisés par son fils.",
      undefined,
    );
    assert.equal(titres.garder, true, "l'ancrage en debut de ligne doit valoir pour cette formule aussi");
    assert.match(titres.texte, /son fils/);
  });

  test('une phrase clinique contenant « musique » survit', () => {
    const r = nettoyer('Il entend une musique dans l oreille droite.');
    assert.equal(r.garder, true);
  });
});

describe('extraits sans parole', () => {
  test('le vide est jete', () => {
    assert.deepEqual(nettoyer('   '), { texte: '', garder: false, motif: 'vide' });
  });

  test('la ponctuation seule est jetee', () => {
    for (const p of ['...', '.', ' - ', '!!!']) {
      const r = nettoyer(p);
      assert.equal(r.garder, false, `« ${p} »`);
      assert.equal(r.motif, 'ponctuation-seule');
    }
  });

  test('un chiffre seul est conserve', () => {
    // « 38 » est une temperature. Ce n est pas de la ponctuation.
    const r = nettoyer('38');
    assert.equal(r.garder, true);
  });
});

describe('boucles du modele', () => {
  test('une longue repetition est ramenee a trois', () => {
    const r = nettoyer('oui oui oui oui oui oui oui');
    assert.equal(r.garder, true);
    assert.equal(r.texte, 'oui oui oui');
    assert.equal(r.motif, 'repetitions-reduites');
  });

  test('trois occurrences restent intactes', () => {
    // Frontiere exacte : « non, non, non » est une insistance plausible a
    // l oral, et la reduire modifierait un propos rapporte.
    const r = nettoyer('non non non');
    assert.equal(r.texte, 'non non non');
    assert.equal(r.motif, null);
  });

  test('la ponctuation ne casse pas la detection', () => {
    const r = nettoyer('non, non, non, non, non');
    assert.equal(r.texte.split(' ').length, REPETITIONS_MAX);
  });

  test('deux mots differents qui alternent ne sont pas reduits', () => {
    const r = nettoyer('oui non oui non oui non');
    assert.equal(r.motif, null, 'une alternance n est pas une boucle');
  });

  test('un mot repete loin dans la phrase n est pas touche', () => {
    const r = nettoyer('la douleur est la, et la fievre aussi, la depuis trois jours');
    assert.equal(r.motif, null, 'seules les repetitions CONSECUTIVES sont des boucles');
  });
});

describe("echo de l'amorce", () => {
  const AMORCE = 'paludisme, artemether, lumefantrine, amoxicilline, cotrimoxazole';

  test("l'amorce recrachee en tete est retiree", () => {
    const r = nettoyer(
      'Paludisme, artéméther, luméfantrine, amoxicilline, cotrimoxazole. Le patient a de la fièvre.',
      AMORCE,
    );
    assert.equal(r.garder, true);
    assert.equal(r.texte, 'Le patient a de la fièvre.');
  });

  test("un extrait qui n'est QUE l'amorce est jete", () => {
    const r = nettoyer('Paludisme, artéméther, luméfantrine, amoxicilline, cotrimoxazole.', AMORCE);
    assert.equal(r.garder, false);
    assert.equal(r.motif, 'echo-de-l-amorce');
  });

  test('un extrait qui commence par un terme de l amorce est conserve', () => {
    // « Paludisme confirme » n est pas un echo : c est le diagnostic.
    const r = nettoyer('Paludisme confirmé par la goutte épaisse.', AMORCE);
    assert.equal(r.garder, true);
    assert.equal(r.texte, 'Paludisme confirmé par la goutte épaisse.');
  });

  test('sans amorce, rien n est retire', () => {
    const r = nettoyer('Paludisme, artéméther, luméfantrine.');
    assert.equal(r.garder, true);
    assert.match(r.texte, /artéméther/);
  });

  test('une amorce trop courte est ignoree', () => {
    // Avec une amorce de quelques lettres, le prefixe se retrouverait par
    // hasard en tete de vraies phrases.
    const r = nettoyer('Le patient va bien.', 'Le');
    assert.equal(r.texte, 'Le patient va bien.');
  });
});

describe('normalisation des espaces', () => {
  test('les espaces multiples et les retours sont ramenes a un espace', () => {
    const r = nettoyer('  Le patient\n\na   de la fièvre.  ');
    assert.equal(r.texte, 'Le patient a de la fièvre.');
  });
});
