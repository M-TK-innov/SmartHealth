import { neon } from '@neondatabase/serverless';
import { reglage } from '../heritage.ts';
import { CHAMPS_LIBRES, QUESTIONS, type Reponse } from './questionnaire.ts';

/**
 * Stockage des reponses d'enquete, sur une base Postgres distante.
 *
 * POURQUOI PAS LA BASE DE LA PLATEFORME
 *
 * Cette enquete n'est pas un acte de soin. Elle n'a rien a faire dans la
 * base qui porte les dossiers medicaux : ni le meme contenu, ni la meme
 * duree de conservation, ni les memes personnes autorisees a la lire. Une
 * base separee rend le cloisonnement visible plutot que promis.
 *
 * Elle est aussi la seule option praticable : la plateforme tourne sur un
 * fichier local, present sur le poste de l'etablissement, et le formulaire
 * est rempli depuis n'importe quel telephone.
 *
 * CE QUI N'EST PAS ECRIT ICI
 *
 * Ni adresse IP, ni empreinte de navigateur, ni en-tete de l'appelant. Le
 * formulaire annonce « ni nom, ni numero de telephone, ni numero de
 * dossier » : enregistrer a cote une adresse qui identifie la ligne ferait
 * de cette phrase un mensonge. La contrepartie est assumee : sans
 * identifiant, on ne peut pas limiter par personne, seulement plafonner le
 * debit total, ce que fait `compterRecentes`.
 */

// Les colonnes viennent de la declaration des questions, et la table doit
// les porter toutes : une question ajoutee sans sa colonne fait echouer
// CHAQUE reponse, y compris celles qui ne la concernent pas. Le schema de
// reference est dans `schema.sql`, a cote de ce fichier.
const COLONNES = [...QUESTIONS.map((q) => q.cle), ...CHAMPS_LIBRES.map((c) => c.cle)];

/**
 * Chaine de connexion, ou `undefined`.
 *
 * Elle vit dans l'environnement du serveur et nulle part ailleurs. Le
 * principe vaut ici comme pour le reste de la plateforme : un secret
 * modifiable depuis une page web est un secret expose.
 */
export function chaineConnexion(): string | undefined {
  return reglage('ENQUETE_BASE', process.env) || process.env.DATABASE_URL || undefined;
}

export function configuree(): boolean {
  return Boolean(chaineConnexion());
}

/** Motif de refus nommant la variable manquante, sans jamais montrer de valeur. */
export function refusConfiguration(): string {
  return "Collecte non configuree : la variable SMARTHEALTH_ENQUETE_BASE n'est pas posee sur le serveur.";
}

function sql() {
  const url = chaineConnexion();
  if (!url) throw new Error(refusConfiguration());
  return neon(url);
}

/**
 * Enregistre une reponse deja validee.
 *
 * La requete est construite a partir de `COLONNES`, qui vient du module de
 * questionnaire : aucune cle ne peut donc venir de la charge utile recue.
 * Les valeurs, elles, partent en parametres.
 */
export async function enregistrer(reponse: Reponse): Promise<void> {
  const valeurs = COLONNES.map((c) => reponse[c] ?? null);
  const places = COLONNES.map((_, i) => `$${i + 1}`).join(', ');
  const requete = `INSERT INTO enquete_reponse (${COLONNES.join(', ')}) VALUES (${places})`;
  await sql().query(requete, valeurs);
}

/**
 * Nombre de reponses recues dans les dernieres heures.
 *
 * Sert de plafond de debit. Ce n'est PAS une limite par personne : sans
 * identifiant, elle n'existe pas. Elle protege d'un envoi massif, pas d'un
 * repondant qui recommence, et il faut le dire plutot que de laisser croire
 * le contraire.
 */
export async function compterRecentes(heures: number): Promise<number> {
  const lignes = (await sql().query(
    "SELECT count(*)::int AS n FROM enquete_reponse WHERE recu_le > now() - ($1 || ' hours')::interval",
    [String(heures)],
  )) as { n: number }[];
  return lignes[0]?.n ?? 0;
}

export interface LigneLue extends Reponse {
  id: string;
  recu_le: string;
}

/**
 * Les reponses, de la plus recente a la plus ancienne.
 *
 * L'HORODATAGE SORT EN TEXTE ISO, ET CE N'EST PAS UN DETAIL. Rendu en objet
 * date, il repartait a l'export sous la forme locale du serveur — « Sat Nov
 * 07 2026 09:44:06 GMT+0100 (heure d'Afrique de l'Ouest) » — qu'aucun
 * tableur ne sait relire et qui change avec le serveur qui l'a produite.
 */
export async function lire(limite = 500): Promise<LigneLue[]> {
  const requete = `SELECT id,
       to_char(recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recu_le,
       ${COLONNES.join(', ')}
  FROM enquete_reponse ORDER BY recu_le DESC LIMIT $1`;
  return (await sql().query(requete, [limite])) as LigneLue[];
}

export async function compterTout(): Promise<number> {
  const lignes = (await sql().query('SELECT count(*)::int AS n FROM enquete_reponse')) as {
    n: number;
  }[];
  return lignes[0]?.n ?? 0;
}
