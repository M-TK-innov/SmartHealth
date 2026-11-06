import { randomUUID } from 'node:crypto';
import { all, insert, nowIso } from '../db.ts';
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
): boolean {
  if (!qualifie(candidat)) return false;

  insert('allegement_evenement', {
    id: randomUUID(),
    organization_id: organizationId,
    jour: jourCivil(instant, fuseau()),
    type: candidat.type,
    quantite: candidat.quantite,
    cree_le: nowIso(),
  });
  return true;
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
