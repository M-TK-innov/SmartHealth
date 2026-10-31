import { decalerJours, joursEntre } from './temps.ts';
import { ALL_PERMISSIONS, type Permission } from './auth/roles.ts';

/**
 * Periode d'essai.
 *
 * Un medecin ou un responsable d'etablissement installe la plateforme chez
 * lui, avec toutes les fonctionnalites et sa base locale, et dispose de sept
 * jours pour la juger. Passe ce delai, l'installation se verrouille — mais
 * JAMAIS au point d'enfermer ce qui a ete saisi.
 *
 * CE QUI EST EN JEU
 *
 * Un essai qui expire sur un logiciel de dossiers medicaux n'est pas un essai
 * de tableur. Si un testeur a saisi un vrai patient malgre les avertissements
 * — et cela arrivera, parce qu'on teste avec ce qu'on a sous la main — un
 * verrouillage total rendrait ce dossier illisible. On refuse donc d'ecrire,
 * jamais de lire ni d'exporter. Une facture impayee se recouvre ; un dossier
 * enferme ne se recupere pas.
 *
 * TROIS CHOIX QUI SE DEFENDENT
 *
 * 1. Le delai se compte en JOURS CIVILS a l'heure de l'etablissement, pas en
 *    millisecondes. Un essai ouvert a 23 h 50 ne perd pas une journee, et la
 *    date de fin est la meme pour tout le monde dans l'etablissement.
 *
 * 2. L'autorisation apres echeance est une LISTE BLANCHE. Une permission
 *    ajoutee plus tard sera refusee par defaut, jamais autorisee par oubli :
 *    c'est l'inverse qui serait dangereux, et le projet s'est deja fait
 *    prendre une fois par une liste qui n'avait pas suivi.
 *
 * 3. Reculer l'horloge ne rallonge pas l'essai. On retient le jour le plus
 *    avance jamais observe ; si la machine annonce un jour anterieur, c'est
 *    celui-la qui fait foi. Ce n'est pas une protection contre un attaquant
 *    determine — il n'y en a pas de locale — mais contre le geste facile.
 *
 * Module PUR : ni base, ni horloge. Le jour lui est passe. Ce qui est teste
 * ici est donc exactement ce qui s'execute chez le testeur.
 */

export const DUREE_ESSAI_JOURS = 7;

export type PhaseEssai = 'actif' | 'expire';

export interface EtatEssai {
  phase: PhaseEssai;
  /** Jour civil de la premiere ouverture. */
  jourDebut: string;
  /** Dernier jour inclus dans l'essai. */
  jourFin: string;
  /** Jour retenu pour le calcul, apres correction d'une horloge reculee. */
  jourEffectif: string;
  /** Jours restants, aujourd'hui compris. Zero des que l'essai est clos. */
  joursRestants: number;
  /** Vrai si la machine annonce un jour anterieur au plus avance deja vu. */
  horlogeReculee: boolean;
}

/** Dernier jour inclus dans l'essai : sept jours civils, premier compris. */
export function jourFinEssai(jourDebut: string): string {
  return decalerJours(jourDebut, DUREE_ESSAI_JOURS - 1);
}

/**
 * Etat de l'essai.
 *
 * `jourVu` est le jour le plus avance jamais enregistre par l'installation.
 * Il peut etre nul a la toute premiere ouverture.
 */
export function etatEssai(args: {
  jourDebut: string;
  jourVu: string | null;
  jourCourant: string;
}): EtatEssai {
  const { jourDebut, jourVu, jourCourant } = args;

  // Une horloge reculee ne rend pas des jours. On garde le plus avance.
  const horlogeReculee = jourVu !== null && jourCourant < jourVu;
  const jourEffectif = horlogeReculee ? (jourVu as string) : jourCourant;

  const jourFin = jourFinEssai(jourDebut);
  const restants = joursEntre(jourEffectif, jourFin) + 1;

  return {
    phase: restants > 0 ? 'actif' : 'expire',
    jourDebut,
    jourFin,
    jourEffectif,
    joursRestants: Math.max(0, restants),
    horlogeReculee,
  };
}

/**
 * Ce qui reste permis une fois l'essai clos.
 *
 * Liste BLANCHE, et uniquement de la lecture et de l'export. `export:read`
 * y figure a dessein : c'est par la qu'un testeur recupere ce qu'il a saisi,
 * aux formats FHIR, HL7 et DHIS2. Sans lui, le verrouillage deviendrait une
 * retention de donnees.
 *
 * `export:send` en est absent : transmettre vers un systeme tiers est un acte
 * sortant, pas une recuperation. `database:manage` aussi : l'administration
 * de la base fait partie de ce que l'essai cesse d'offrir, et la sauvegarde
 * automatique posee a l'echeance couvre le besoin reel.
 */
export const PERMISSIONS_APRES_ECHEANCE: readonly Permission[] = [
  'patient:read',
  'consultation:read',
  'flux:read',
  'caisse:read',
  'pharmacie:read',
  'plateau:read',
  'bloc:read',
  'export:read',
  'stats:facility',
  'stats:national',
  'surveillance:read',
  'org:read',
  'user:read',
  'audit:read',
];

/** Vrai si cette permission s'exerce encore dans cette phase. */
export function permissionAutorisee(phase: PhaseEssai, permission: Permission): boolean {
  if (phase === 'actif') return true;
  return PERMISSIONS_APRES_ECHEANCE.includes(permission);
}

/**
 * Permissions de la liste blanche qui n'existent plus dans le vocabulaire.
 *
 * Sert de garde-fou : une permission renommee laisserait ici une entree morte,
 * et le testeur perdrait silencieusement un acces de lecture.
 */
export function entreesOrphelines(): Permission[] {
  const connues = new Set<string>(ALL_PERMISSIONS);
  return PERMISSIONS_APRES_ECHEANCE.filter((p) => !connues.has(p));
}

/**
 * Le refus, avec son remede.
 *
 * Regle du projet : un refus qui ne dit pas quoi faire est un mur. Celui-ci
 * nomme les deux issues reelles — recuperer ses donnees, ou passer en version
 * complete — et rappelle que rien n'est perdu.
 */
export function messageEcheance(etat: EtatEssai): string {
  return (
    `La periode d'essai de ${DUREE_ESSAI_JOURS} jours s'est achevee le ${etat.jourFin}. ` +
    'Cette action modifie des donnees et n’est plus disponible. ' +
    'Ce qui a ete saisi reste lisible et exportable (FHIR, HL7, DHIS2), et une ' +
    'sauvegarde de la base a ete posee a l’echeance. Pour reprendre la saisie, ' +
    'passez en version complete.'
  );
}

/**
 * L'annonce faite a l'ecran, qui ne crie qu'au bon moment.
 *
 * Elle ne reprend PAS le texte du refus. Un bandeau qui annonce « cette
 * action modifie des donnees » alors qu'aucune action n'a ete demandee
 * apprend a ne plus lire les bandeaux. Le refus repond a un geste ; le
 * bandeau decrit un etat.
 */
export function messageRestant(etat: EtatEssai): string {
  if (etat.phase === 'expire') {
    return (
      `La periode d'essai s'est achevee le ${etat.jourFin}. La saisie est fermee ; ` +
      'la lecture et l’export restent ouverts, et une sauvegarde de la base a ete posee.'
    );
  }
  if (etat.joursRestants === 1) return "Dernier jour d'essai. Demain, la saisie se ferme et la lecture reste.";
  return `Version d'essai : ${etat.joursRestants} jours restants, jusqu'au ${etat.jourFin} inclus.`;
}
