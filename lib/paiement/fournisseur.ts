import { reglage } from '../heritage.ts';
import { OPERATEURS, type Operateur } from './tentative.ts';

/**
 * Operateurs de paiement : contrat, configuration, et refus honnete.
 *
 * CE FICHIER N'APPELLE AUCUN OPERATEUR, ET C'EST VOLONTAIRE
 *
 * Brancher MTN Mobile Money, Moov Money ou PI-SPI demande leurs
 * specifications d'interface et les cles marchandes de l'etablissement.
 * Ecrire ici un appel invente, qui compilerait et echouerait a la premiere
 * transaction reelle, serait pire que de ne rien ecrire : on croirait le
 * circuit pret.
 *
 * Ce module fournit donc trois choses utiles tout de suite :
 *
 *   - le CONTRAT que chaque operateur devra remplir, pour que le reste de
 *     l'application soit ecrit une fois pour toutes ;
 *   - la VERIFICATION DE CONFIGURATION, qui dit precisement quelles
 *     variables manquent plutot que « paiement indisponible » ;
 *   - le REFUS, formule de facon qu'un responsable sache quoi faire.
 *
 * Le chemin « guichet », lui, fonctionne sans aucun de ces reglages : le
 * patient voit son reste a charge et sa reference, et paie a la caisse.
 * C'est le chemin qui ne depend de personne.
 */

/** Variables attendues pour chaque operateur. */
const REGLAGES: Record<Operateur, string[]> = {
  'mtn-momo': ['MOMO_BASE', 'MOMO_ABONNEMENT', 'MOMO_CLE'],
  'moov-money': ['MOOV_BASE', 'MOOV_MARCHAND', 'MOOV_CLE'],
  'pi-spi': ['PISPI_BASE', 'PISPI_MARCHAND', 'PISPI_CLE'],
};

/** Nom complet de la variable d'environnement, prefixe compris. */
export function nomVariable(suffixe: string): string {
  return `SMARTHEALTH_${suffixe}`;
}

/** Reglages manquants pour cet operateur. Vide = pret a servir. */
export function reglagesManquants(operateur: Operateur): string[] {
  return (REGLAGES[operateur] ?? [])
    .filter((suffixe) => !reglage(suffixe, process.env))
    .map(nomVariable);
}

export function operateurDisponible(operateur: Operateur): boolean {
  return reglagesManquants(operateur).length === 0;
}

/** Operateurs effectivement utilisables sur cette installation. */
export function operateursDisponibles(): Operateur[] {
  return (Object.keys(OPERATEURS) as Operateur[]).filter(operateurDisponible);
}

/** Le paiement en ligne est-il possible, tous operateurs confondus ? */
export function paiementEnLigneDisponible(): boolean {
  return operateursDisponibles().length > 0;
}

/**
 * Le refus, avec son remede.
 *
 * Il nomme les variables manquantes. « Paiement indisponible » enverrait un
 * responsable chercher pendant une heure ce qu'une ligne peut lui dire.
 *
 * Il ne mentionne JAMAIS la valeur d'un reglage existant : un message
 * d'erreur finit dans un journal, et un journal se lit.
 */
export function refusConfiguration(operateur: Operateur): string {
  const manquants = reglagesManquants(operateur);
  if (manquants.length === 0) return '';
  return (
    `${OPERATEURS[operateur]} n'est pas configure sur cette installation. ` +
    `Reglages manquants : ${manquants.join(', ')}. ` +
    'En attendant, le reglement se fait a la caisse avec la reference de la facture.'
  );
}

// ----------------------------------------------------------- le contrat

export interface DemandePaiement {
  reference: string;
  montant: number;
  /** Numero du payeur, sous sa forme internationale. */
  telephone: string;
  libelle: string;
}

export interface ReponseInitiation {
  /** Identifiant de la transaction chez l'operateur, pour le rapprochement. */
  idOperateur: string;
  /** Adresse ou envoyer le patient, si l'operateur en impose une. */
  redirection?: string;
}

export interface EvenementOperateur {
  reference: string;
  statut: 'confirme' | 'echoue';
  /** Montant reellement transfere, en francs entiers. */
  montant: number;
  idOperateur: string;
  motif?: string;
}

/**
 * Ce que chaque operateur devra fournir.
 *
 * `verifier` n'est pas un detail : une notification d'operateur arrive par
 * une adresse publique, et rien n'empeche n'importe qui de l'appeler. Sans
 * verification de signature, marquer une facture payee ne couterait qu'une
 * requete.
 */
export interface Fournisseur {
  readonly operateur: Operateur;
  /** Demande le paiement. Leve si l'operateur refuse. */
  initier(demande: DemandePaiement): Promise<ReponseInitiation>;
  /** Authentifie une notification entrante, et en extrait l'evenement. */
  verifier(corps: string, entetes: Headers): Promise<EvenementOperateur | null>;
}

const FOURNISSEURS = new Map<Operateur, Fournisseur>();

/**
 * Enregistre l'implementation d'un operateur.
 *
 * Elle viendra d'un fichier par operateur, ecrit a partir de SA
 * documentation et teste contre SON bac a sable. Tant qu'aucune n'est
 * enregistree, `fournisseur` rend `null` et l'application le dit.
 */
export function enregistrerFournisseur(f: Fournisseur): void {
  FOURNISSEURS.set(f.operateur, f);
}

export function fournisseur(operateur: Operateur): Fournisseur | null {
  return FOURNISSEURS.get(operateur) ?? null;
}

/**
 * Pourquoi cet operateur ne peut pas servir, ou chaine vide s'il le peut.
 *
 * Distingue deux manques qu'on confond toujours : les cles absentes, qu'un
 * responsable peut poser lui-meme, et l'implementation absente, qui demande
 * du developpement. Les melanger enverrait quelqu'un chercher une cle pour
 * un probleme de code.
 */
export function pourquoiIndisponible(operateur: Operateur): string {
  const manquants = reglagesManquants(operateur);
  if (manquants.length > 0) return refusConfiguration(operateur);
  if (!fournisseur(operateur)) {
    return (
      `${OPERATEURS[operateur]} est configure, mais son adaptateur n'est pas encore ` +
      'installe sur cette version. Le reglement se fait a la caisse.'
    );
  }
  return '';
}
