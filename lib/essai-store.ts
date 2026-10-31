import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { MODE_DEMO, databasePath, db, get, run } from './db.ts';
import { reglage } from './heritage.ts';
import { fuseauMachine, jourCivil } from './temps.ts';
import { etatEssai, type EtatEssai } from './essai.ts';

/**
 * Etat de l'essai, cote installation.
 *
 * Tout le calcul vit dans `essai.ts`, qui ne connait ni base ni horloge. Ce
 * fichier-ci ne fait que trois choses : lire la ligne, avancer le jour vu, et
 * poser la sauvegarde d'echeance. C'est volontairement peu : ce qui decide
 * doit rester eprouvable sans base.
 */

/** Vrai sur une installation d'essai. Une installation complete l'ignore. */
export const MODE_ESSAI = reglage('ESSAI', process.env) === '1';

/**
 * Le fuseau qui compte la journee.
 *
 * Celui de l'etablissement s'il est declare, sinon celui de la machine. Un
 * essai dont la journee basculerait a Greenwich finirait un jour trop tot
 * pour un testeur a Cotonou.
 */
function fuseau(): string {
  return reglage('FUSEAU', process.env) || fuseauMachine();
}

interface LigneEssai {
  jour_debut: string;
  jour_vu: string;
  sauvegarde_faite: string | null;
  sauvegarde_chemin: string | null;
}

/**
 * Etat courant, en ouvrant l'essai a la premiere consultation.
 *
 * Renvoie `null` hors mode essai : l'appelant n'a alors rien a verifier, et
 * aucune ligne n'est creee dans une installation complete.
 */
export function etatEssaiCourant(instant: Date = new Date()): EtatEssai | null {
  if (!MODE_ESSAI) return null;

  const jourCourant = jourCivil(instant, fuseau());

  let ligne = get<LigneEssai>(
    'SELECT jour_debut, jour_vu, sauvegarde_faite, sauvegarde_chemin FROM essai WHERE id = 1',
  );

  if (!ligne) {
    // Le compte part de la PREMIERE OUVERTURE, pas de la date de
    // construction du paquet : un installateur telecharge en mars et
    // installe en juin donnerait sinon un essai deja clos.
    run('INSERT INTO essai (id, jour_debut, jour_vu) VALUES (1, ?, ?)', [jourCourant, jourCourant]);
    ligne = { jour_debut: jourCourant, jour_vu: jourCourant, sauvegarde_faite: null, sauvegarde_chemin: null };
  }

  const etat = etatEssai({
    jourDebut: ligne.jour_debut,
    jourVu: ligne.jour_vu,
    jourCourant,
  });

  if (etat.jourEffectif > ligne.jour_vu) {
    run('UPDATE essai SET jour_vu = ? WHERE id = 1', [etat.jourEffectif]);
  }

  if (etat.phase === 'expire' && !ligne.sauvegarde_faite) poserSauvegarde(etat);

  return etat;
}

/** Ce que l'ecran peut dire de la sauvegarde d'echeance. */
export function sauvegardeEcheance(): { jour: string; chemin: string | null } | null {
  if (!MODE_ESSAI) return null;
  const ligne = get<LigneEssai>('SELECT sauvegarde_faite, sauvegarde_chemin FROM essai WHERE id = 1');
  if (!ligne?.sauvegarde_faite) return null;
  return { jour: ligne.sauvegarde_faite, chemin: ligne.sauvegarde_chemin };
}

/**
 * Copie la base au moment ou l'essai se clot.
 *
 * `VACUUM INTO` plutot qu'une copie de fichier : SQLite ecrit une base
 * COHERENTE meme si des pages sont encore dans le journal d'ecriture. Copier
 * le fichier a la main produirait, un jour sur dix, une base tronquee — et
 * c'est le jour ou l'on en a besoin.
 *
 * Un echec ne retarde pas l'echeance et ne se repete pas a chaque requete :
 * on note la tentative avec un chemin nul, et l'ecran dit alors que la
 * sauvegarde n'a pas pu etre posee. Annoncer une sauvegarde qui n'existe pas
 * serait pire que de ne rien annoncer.
 */
function poserSauvegarde(etat: EtatEssai): void {
  const source = databasePath();
  if (MODE_DEMO || source.startsWith(':memory:')) return;

  let cible: string | null = null;
  try {
    const dossier = path.join(path.dirname(source), 'sauvegardes');
    mkdirSync(dossier, { recursive: true });

    // VACUUM INTO refuse d'ecraser un fichier existant, et c'est tant mieux :
    // on numerote plutot que de recouvrir une sauvegarde deja posee.
    let candidat = path.join(dossier, `essai-echeance-${etat.jourFin}.db`);
    let n = 2;
    while (existsSync(candidat)) {
      candidat = path.join(dossier, `essai-echeance-${etat.jourFin}-${n}.db`);
      n += 1;
    }

    db().exec(`VACUUM INTO '${candidat.replace(/'/g, "''")}'`);
    cible = candidat;
  } catch (e) {
    console.warn(
      "Sauvegarde d'echeance impossible :",
      e instanceof Error ? e.message : e,
      '— les donnees restent lisibles et exportables depuis l’application.',
    );
  }

  run('UPDATE essai SET sauvegarde_faite = ?, sauvegarde_chemin = ? WHERE id = 1', [
    etat.jourEffectif,
    cible,
  ]);
}
