import { all } from '../db.ts';
import { reglage } from '../heritage.ts';
import { fuseauMachine, jourCivil } from '../temps.ts';
import { bornesDuMois, compter } from '../allegement/store.ts';
import { surveillanceFor } from './dhis2.ts';
import {
  construireRapport,
  periodeDhis2,
  type Certitude,
  type EntreeRapport,
  type Rapport,
} from './rapport-mensuel.ts';

/**
 * Produit le rapport mensuel de surveillance depuis les soins deja
 * enregistres.
 *
 * C'EST ICI QUE LA DOUBLE SAISIE DISPARAIT. Jusqu'a present, les memes
 * donnees etaient ecrites dans le registre de consultation, puis recopiees a
 * la main dans le rapport mensuel. Le rapport est maintenant deduit de ce qui
 * a ete fait pour soigner, et l'agent verifie au lieu de ressaisir.
 *
 * Ce qui entre dans le compte est decide par `rapport-mensuel.ts`, qui ne
 * touche ni base ni horloge. Ce fichier-ci ne fait que lire et compter.
 */

function fuseau(): string {
  return reglage('FUSEAU', process.env) || fuseauMachine();
}

interface LigneBrute {
  certainty: Certitude | null;
  icd10_code: string | null;
  signed_at: string | null;
  started_at: string;
}

/**
 * Rapport d'un mois, pour un etablissement.
 *
 * Le mois est borne en JOURS CIVILS de l'etablissement, pas en UTC. Un
 * rapport mensuel dont les bornes basculent a Greenwich perd les
 * consultations du dernier soir et gagne celles de la veille du premier.
 */
export function rapportDuMois(args: {
  organizationId: string | null;
  annee: number;
  mois: number;
  orgUnit?: string;
}): Rapport {
  const { debut, fin } = bornesDuMois(args.annee, args.mois);

  // On borne large en SQL, puis on filtre sur le jour civil en memoire : les
  // horodatages sont stockes en UTC, et une comparaison directe ferait
  // basculer les consultations de debut et de fin de mois du mauvais cote.
  const marge = 2 * 86400_000;
  const borneBasse = new Date(`${debut}T00:00:00Z`).getTime() - marge;
  const borneHaute = new Date(`${fin}T00:00:00Z`).getTime() + marge;
  const enSql = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

  const brutes = args.organizationId
    ? all<LigneBrute>(
        `SELECT d.certainty, d.icd10_code, c.signed_at, c.started_at
           FROM diagnosis d JOIN consultation c ON c.id = d.consultation_id
          WHERE c.organization_id = ? AND c.started_at >= ? AND c.started_at <= ?`,
        [args.organizationId, enSql(borneBasse), enSql(borneHaute)],
      )
    : all<LigneBrute>(
        `SELECT d.certainty, d.icd10_code, c.signed_at, c.started_at
           FROM diagnosis d JOIN consultation c ON c.id = d.consultation_id
          WHERE c.started_at >= ? AND c.started_at <= ?`,
        [enSql(borneBasse), enSql(borneHaute)],
      );

  const z = fuseau();
  const entrees: EntreeRapport[] = [];

  for (const b of brutes) {
    const jour = jourCivil(b.started_at, z);
    if (jour < debut || jour > fin) continue;

    const s = surveillanceFor(b.icd10_code);
    entrees.push({
      certitude: (b.certainty ?? 'suspected') as Certitude,
      consultationSignee: Boolean(b.signed_at),
      cim10: b.icd10_code,
      dataElement: s?.dataElement ?? '',
      libelle: s?.label ?? '',
    });
  }

  return construireRapport({
    periode: periodeDhis2(args.annee, args.mois),
    orgUnit: args.orgUnit || process.env.FACILITY_ID || 'UNKNOWN_ORGUNIT',
    entrees,
  });
}

/**
 * Enregistre l'allegement obtenu par la production du rapport.
 *
 * A appeler quand un agent produit effectivement le rapport, pas a chaque
 * affichage : ce que l'on compte est une ressaisie evitee, et une ressaisie
 * ne s'evite qu'une fois par rapport.
 *
 * La quantite est le nombre de lignes que l'agent aurait eu a recopier.
 * Compter « un rapport » dirait que l'outil a epargne un geste, alors qu'il
 * en a epargne autant que de lignes.
 */
export function noterRapportProduit(r: Rapport, organizationId: string | null): boolean {
  const lignes = r.lignes.reduce(
    (n, l) => n + (l.confirmes > 0 ? 1 : 0) + (l.suspects > 0 ? 1 : 0),
    0,
  );
  if (lignes === 0) return false;

  // La reference est la PERIODE, jamais un patient : un rapport mensuel ne
  // s'evite qu'une fois, et un second clic ne doit rien ajouter.
  return compter(
    {
      type: 'rapport-produit-sans-ressaisie',
      disponible: true,
      presentee: true,
      quantite: lignes,
    },
    organizationId,
    new Date(),
    `rapport:${r.periode}`,
  );
}
