import { randomUUID } from 'node:crypto';
import { all, get, insert, nowIso, run } from '../db.ts';
import { reglage } from '../heritage.ts';
import { fuseauMachine, jourCivil } from '../temps.ts';
import {
  agreger,
  qualifie,
  type EvenementCandidat,
  type Resume,
  type TypeAllegement,
} from './mesure.ts';

/**
 * Enregistrement et restitution du compteur d'allegement.
 *
 * Le module ne sait presque rien faire, et c'est voulu : tout ce qui decide
 * vit dans `mesure.ts`, qui ne touche ni base ni horloge. Ici on qualifie,
 * on insere, on agrege.
 *
 * AUCUN IDENTIFIANT DE PERSONNE N'ENTRE DANS CE FICHIER. Ce n'est pas une
 * precaution de style : la fonction `compter` ne prend pas de patient en
 * parametre, donc elle ne peut pas en ecrire un, meme par accident d'un
 * appelant presse.
 */

/** Fuseau de l'etablissement, ou celui de la machine. */
function fuseau(): string {
  return reglage('FUSEAU', process.env) || fuseauMachine();
}

/**
 * Compte un allegement, s'il merite de l'etre.
 *
 * Rend `true` quand l'evenement a ete retenu. Un appelant qui ne regarde pas
 * ce retour ne fausse rien : un evenement non qualifie est simplement absent,
 * jamais compte de travers.
 */
export function compter(
  candidat: EvenementCandidat,
  organizationId: string | null,
  instant: Date = new Date(),
  /**
   * Ce que l'evenement compte une seule fois, par exemple « rapport:202610 ».
   *
   * Omise, l'evenement peut se repeter : c'est le cas normal d'une
   * consultation a distance, qui a lieu autant de fois qu'on la fait.
   * Fournie, un second enregistrement est refuse par la base.
   *
   * ELLE NE DOIT JAMAIS CONTENIR D'IDENTIFIANT DE PERSONNE. Ce serait
   * reintroduire par la petite porte le lien que cette table est faite
   * pour ne pas avoir.
   */
  reference?: string,
): boolean {
  if (!qualifie(candidat)) return false;

  try {
    insert('allegement_evenement', {
      id: randomUUID(),
      organization_id: organizationId,
      jour: jourCivil(instant, fuseau()),
      type: candidat.type,
      quantite: candidat.quantite,
      reference: reference ?? null,
      cree_le: nowIso(),
    });
    return true;
  } catch (e) {
    // Violation de l'index unique : l'allegement a deja ete compte. Ce
    // n'est pas une erreur, c'est le comportement demande. Toute autre
    // defaillance remonte.
    if (e instanceof Error && /UNIQUE|constraint/i.test(e.message)) return false;
    throw e;
  }
}

/**
 * Resume d'une periode, bornes comprises.
 *
 * Les bornes sont des jours civils au format AAAA-MM-JJ, ce qui permet une
 * comparaison de chaines : toutes les valeurs de la colonne ont cette forme,
 * produite par un seul endroit.
 */
export function resumePeriode(
  organizationId: string | null,
  jourDebut: string,
  jourFin: string,
): Resume {
  const lignes = organizationId
    ? all<{ type: TypeAllegement; quantite: number }>(
        'SELECT type, quantite FROM allegement_evenement WHERE organization_id = ? AND jour >= ? AND jour <= ?',
        [organizationId, jourDebut, jourFin],
      )
    : all<{ type: TypeAllegement; quantite: number }>(
        'SELECT type, quantite FROM allegement_evenement WHERE jour >= ? AND jour <= ?',
        [jourDebut, jourFin],
      );

  return agreger(lignes);
}

/** Premier et dernier jour d'un mois donne, au format AAAA-MM-JJ. */
export function bornesDuMois(annee: number, mois: number): { debut: string; fin: string } {
  const mm = String(mois).padStart(2, '0');
  // Le jour 0 du mois suivant est le dernier du mois demande, et cette
  // ecriture passe decembre et les annees bissextiles sans cas particulier.
  const dernier = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  return { debut: `${annee}-${mm}-01`, fin: `${annee}-${mm}-${String(dernier).padStart(2, '0')}` };
}

/**
 * Note que des informations deja connues ont ete presentees au soignant,
 * donc non redemandees au patient.
 *
 * DEUX PRECAUTIONS QUI CHANGENT LE SENS DU CHIFFRE
 *
 * 1. Seules comptent les informations ANTERIEURES a cette consultation.
 *    Une allergie saisie pendant la consultation n'a evidemment pas ete
 *    epargnee au patient : il venait de la donner.
 *
 * 2. Une fois par consultation, et le marqueur vit sur la LIGNE DE
 *    CONSULTATION. Y mettre une reference dans le compteur ferait remonter
 *    au patient, ce que ce compteur refuse par construction. Sans marqueur,
 *    chaque ouverture de la page compterait a nouveau.
 */
export function noterAntecedentsPresentes(args: {
  consultationId: string;
  patientId: string;
  organizationId: string | null;
  instant?: Date;
}): boolean {
  const ligne = get<{ allegement_le: string | null; started_at: string }>(
    'SELECT allegement_le, started_at FROM consultation WHERE id = ?',
    [args.consultationId],
  );
  if (!ligne || ligne.allegement_le) return false;

  // Deux conditions, et la seconde est la plus sure : une allergie dont la
  // SOURCE est cette consultation vient d'etre donnee par le patient, elle
  // ne lui a rien epargne. La table porte `recorded_at`, pas `created_at` :
  // la premiere version de cette requete nommait une colonne inexistante et
  // aurait echoue a la premiere consultation ouverte.
  const connues = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM allergy
      WHERE patient_id = ?
        AND recorded_at < ?
        AND (source_consultation_id IS NULL OR source_consultation_id <> ?)`,
    [args.patientId, ligne.started_at, args.consultationId],
  );
  const nombre = connues?.n ?? 0;

  // Le marqueur est pose meme a zero : sans cela, on relirait la base a
  // chaque affichage d'une consultation sans antecedent connu.
  run('UPDATE consultation SET allegement_le = ? WHERE id = ?', [nowIso(), args.consultationId]);
  if (nombre === 0) return false;

  return compter(
    {
      type: 'antecedent-non-redemande',
      disponible: true,
      presentee: true,
      quantite: nombre,
    },
    args.organizationId,
    args.instant ?? new Date(),
  );
}
