/**
 * Ce que l'installation a appris, et ce qu'elle s'autorise a appliquer.
 *
 * Tout reste sur le poste. Aucune correction ne sort, aucune ne descend depuis
 * un serveur : l'amelioration d'un dispensaire lui appartient, et la mutualiser
 * supposerait de faire circuler des extraits de consultation.
 *
 * LE SEUIL EST LE COEUR DU DISPOSITIF. Une lecon retenue a tort s'appliquerait
 * en silence a toutes les transcriptions suivantes, et le praticien relirait un
 * texte deja abime en croyant relire la machine. On exige donc la repetition
 * dans DEUX CONSULTATIONS DISTINCTES : une correction isolee peut etre une
 * faute de frappe, une habitude propre a un patient, ou un mot rare.
 */

import { randomUUID } from 'node:crypto';
import { all, get, insert, run } from '../db.ts';
import type { LexiconTerm } from '../transcription/keywords.ts';
import { normalizeForm } from '../transcription/keywords.ts';
import { lexiqueClinique } from '../transcription/clinical-lexicon.ts';
import { normaliser, regrouper, type CoupleCorrige } from './corrections.ts';

/**
 * Nombre de consultations DISTINCTES ou un couple doit apparaitre avant d'etre
 * applique. Deux est le minimum qui distingue une regularite d'un accident.
 */
export const SEUIL_CONFIRMATION = 2;

export interface LeconApprise {
  avant: string;
  apres: string;
  avant_affiche: string;
  contexte: string | null;
  consultations: number;
  etat: string;
}

/**
 * Enregistre ce qu'un praticien vient de corriger.
 *
 * Les couples sont regroupes en amont : une meme faute corrigee trois fois
 * dans une consultation reste un enseignement, sinon elle franchirait le seuil
 * a elle seule.
 */
/**
 * Le couple irait-il A REBOURS du lexique clinique ?
 *
 * Le cas a empecher : apprendre « artemether -> arthemeter », c'est-a-dire
 * prendre une denomination du formulaire national et enseigner a la remplacer
 * par une forme qu'il ignore. Cela arrive pour des raisons banales — une
 * fausse manoeuvre, un collage de la mauvaise version, un retour en arriere —
 * et le degat serait maximal : une molecule corrompue a chaque consultation
 * suivante, sur une ligne d'ordonnance.
 *
 * La regle est donc dissymetrique, comme le risque : on refuse d'apprendre un
 * couple dont le DEPART est un terme connu du lexique et dont l'ARRIVEE ne
 * l'est pas. L'inverse — d'une forme inconnue vers une forme connue — est
 * precisement ce qu'on veut apprendre.
 */
let motsOfficiels: Set<string> | null = null;

/**
 * Les mots qui composent une denomination OFFICIELLE.
 *
 * Seules les formes canoniques comptent, pas leurs variantes : une variante est
 * precisement une forme approchee que le lexique tolere, et vers laquelle il ne
 * faut pas ramener le texte. « Artemether » en fait partie, « arthemeter » —
 * qui n'est qu'un alias accepte — non.
 *
 * Les mots courts sont ecartes : « al », « mg », « acide » attraperaient la
 * moitie d'une ordonnance.
 */
function motsDesDenominations(): Set<string> {
  if (motsOfficiels) return motsOfficiels;
  const mots = new Set<string>();
  for (const terme of lexiqueClinique()) {
    for (const mot of normalizeForm(terme.canonical).split(' ')) {
      if (mot.length >= 5) mots.add(mot);
    }
  }
  motsOfficiels = mots;
  return mots;
}

function contredit(avant: string, apres: string): boolean {
  // Si la machine a ecrit un mot qui appartient a une denomination officielle,
  // ce mot etait probablement juste. Le « corriger » releve plus surement d'une
  // fausse manoeuvre ou d'une habitude locale que d'une mauvaise audition — et
  // l'apprendre corromprait la denomination a chaque consultation suivante,
  // sur une ligne d'ordonnance.
  const officiels = motsDesDenominations();
  return normalizeForm(avant)
    .split(' ')
    .some((mot) => officiels.has(mot));
}

export function enregistrerCorrections(params: {
  couples: CoupleCorrige[];
  consultationId: string;
  organizationId: string | null;
}): number {
  const couples = regrouper(params.couples);
  let retenus = 0;

  for (const c of couples) {
    const avant = normaliser(c.avant);
    const apres = normaliser(c.apres);
    if (!avant || !apres) continue;

    // Deja vu pour CETTE consultation : ne pas compter deux fois le meme
    // enregistrement, sinon un praticien qui sauvegarde trois fois de suite
    // confirmerait une lecon tout seul.
    const deja = get<{ n: number }>(
      'SELECT COUNT(*) n FROM apprentissage_correction WHERE avant = ? AND apres = ? AND consultation_id = ?',
      [avant, apres, params.consultationId],
    );
    if ((deja?.n ?? 0) > 0) continue;

    // Un couple ecarte par un relecteur ne revient pas par la petite porte.
    const ecarte = get<{ n: number }>(
      "SELECT COUNT(*) n FROM apprentissage_correction WHERE avant = ? AND apres = ? AND etat = 'ecarte'",
      [avant, apres],
    );
    if ((ecarte?.n ?? 0) > 0) continue;

    // Ne jamais desapprendre une denomination officielle.
    if (contredit(c.avant, c.apres)) continue;

    insert('apprentissage_correction', {
      id: randomUUID(),
      organization_id: params.organizationId,
      avant,
      apres,
      avant_affiche: c.avant,
      contexte: c.contexte || null,
      consultation_id: params.consultationId,
      etat: 'propose',
      created_at: new Date().toISOString(),
    });
    retenus += 1;
  }

  if (retenus > 0) invaliderCache();
  return retenus;
}

/** Tout ce qui a ete observe, confirme ou non — pour la relecture par un humain. */
export function lecons(organizationId: string | null): LeconApprise[] {
  return all<LeconApprise>(
    `SELECT avant, apres,
            MIN(avant_affiche) AS avant_affiche,
            MIN(contexte)      AS contexte,
            COUNT(DISTINCT consultation_id) AS consultations,
            MIN(etat)          AS etat
       FROM apprentissage_correction
      WHERE (? IS NULL OR organization_id = ? OR organization_id IS NULL)
      GROUP BY avant, apres
      ORDER BY consultations DESC, avant`,
    [organizationId, organizationId],
  );
}

/** Ecarte une lecon : elle cesse d'etre appliquee et ne peut plus revenir. */
export function ecarter(avant: string, apres: string): number {
  const r = run("UPDATE apprentissage_correction SET etat = 'ecarte' WHERE avant = ? AND apres = ?", [
    normaliser(avant),
    normaliser(apres),
  ]);
  invaliderCache();
  return Number(r.changes ?? 0);
}

let cache: { cle: string; termes: LexiconTerm[] } | null = null;

/** A appeler des qu'une lecon est ajoutee ou ecartee. */
export function invaliderCache() {
  cache = null;
  // L'index general du lexique est lui aussi en cache : le laisser tel quel
  // ferait ignorer la lecon jusqu'au prochain redemarrage du serveur.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lex = require('../transcription/clinical-lexicon') as typeof import('../transcription/clinical-lexicon');
    lex.invaliderIndexClinique();
  } catch {
    // le lexique n'est pas charge dans ce processus : rien a invalider
  }
}

/**
 * Les lecons confirmees, sous la forme attendue par le lexique clinique.
 *
 * Le couple devient une VARIANTE du terme correct : la normalisation ramenera
 * « arthemeter » sur « artemether » comme elle le fait deja pour les
 * abreviations du formulaire, et la correction sera rendue visible au
 * praticien au lieu d'etre appliquee en douce.
 *
 * Le poids est volontairement bas. Le prompt de biaisage est tronque par les
 * moteurs — Whisper vers 224 jetons — et ce qui vient du formulaire national a
 * plus de valeur generale qu'une habitude locale.
 */
export function leconsAppliquees(organizationId: string | null): { avant: string; apres: string }[] {
  return all<{ avant_affiche: string; apres: string }>(
    `SELECT MIN(avant_affiche) AS avant_affiche, apres
       FROM apprentissage_correction
      WHERE etat = 'propose' AND (? IS NULL OR organization_id = ? OR organization_id IS NULL)
      GROUP BY avant, apres
     HAVING COUNT(DISTINCT consultation_id) >= ?`,
    [organizationId, organizationId, SEUIL_CONFIRMATION],
  ).map((l) => ({ avant: l.avant_affiche, apres: l.apres }));
}

export function termesAppris(organizationId: string | null): LexiconTerm[] {
  const cle = organizationId ?? '*';
  if (cache && cache.cle === cle) return cache.termes;

  const lignes = all<{ apres: string; avant_affiche: string; consultations: number }>(
    `SELECT apres, MIN(avant_affiche) AS avant_affiche, COUNT(DISTINCT consultation_id) AS consultations
       FROM apprentissage_correction
      WHERE etat = 'propose' AND (? IS NULL OR organization_id = ? OR organization_id IS NULL)
      GROUP BY avant, apres
     HAVING consultations >= ?`,
    [organizationId, organizationId, SEUIL_CONFIRMATION],
  );

  const parCanonique = new Map<string, Set<string>>();
  for (const l of lignes) {
    if (!parCanonique.has(l.apres)) parCanonique.set(l.apres, new Set());
    parCanonique.get(l.apres)!.add(l.avant_affiche);
  }

  const termes: LexiconTerm[] = [...parCanonique.entries()].map(([canonical, variantes]) => ({
    canonical,
    variants: [...variantes],
    weight: 2,
  }));

  cache = { cle, termes };
  return termes;
}
