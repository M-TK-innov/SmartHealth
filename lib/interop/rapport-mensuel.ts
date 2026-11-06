/**
 * Ce qui entre dans le rapport mensuel de surveillance, et ce qui n'y entre
 * pas.
 *
 * POURQUOI CE MODULE EXISTE
 *
 * `buildDhis2AggregateReport` comptait tout diagnostic portant un code de
 * surveillance, sans regarder sa certitude. Un paludisme ECARTE et un
 * paludisme confirme y pesaient pareil. Le constructeur n'ayant jusqu'ici
 * aucun appelant, le defaut n'avait jamais produit de chiffre ; il en aurait
 * produit des le premier envoi au niveau central.
 *
 * Ce que coute une erreur ici n'est pas local : un rapport part vers le
 * systeme national d'information sanitaire, alimente une courbe
 * epidemiologique, et peut declencher ou retarder une riposte. Un cas de
 * cholera compte double et c'est une equipe qui se deplace ; il manque et
 * c'est une epidemie vue trop tard.
 *
 * DEUX REGLES
 *
 * 1. SEULE UNE CONSULTATION SIGNEE COMPTE. Tant qu'un praticien n'a pas
 *    signe, le diagnostic peut etre une proposition de modele non relue. Le
 *    rapport national n'est pas l'endroit ou l'on decouvre une suggestion de
 *    machine.
 *
 * 2. CONFIRME ET SUSPECT NE SE MELANGENT JAMAIS. La surveillance integree
 *    distingue les deux, et pour une bonne raison : ils ne declenchent pas
 *    les memes decisions. Les additionner produirait un nombre que personne
 *    ne pourrait interpreter. Les diagnostics differentiels et ecartes, eux,
 *    n'entrent nulle part : une hypothese de travail n'est pas un cas.
 *
 * Module PUR : ni base, ni horloge.
 */

export type Certitude = 'suspected' | 'confirmed' | 'differential' | 'ruled-out';

/** Case du rapport ou va un diagnostic, ou `null` s'il n'y va pas. */
export type Case = 'confirme' | 'suspect';

export interface DiagnosticSource {
  certitude: Certitude;
  /** La consultation d'origine a-t-elle ete signee par un praticien ? */
  consultationSignee: boolean;
  /** Code CIM-10, ou null. */
  cim10: string | null;
}

/**
 * Ou va ce diagnostic dans le rapport ?
 *
 * `null` veut dire : nulle part. C'est le cas le plus frequent, et c'est
 * voulu.
 */
export function caseDuRapport(d: DiagnosticSource): Case | null {
  if (!d.consultationSignee) return null;
  if (d.certitude === 'confirmed') return 'confirme';
  if (d.certitude === 'suspected') return 'suspect';
  // differential : une piste que le praticien explore, pas un cas.
  // ruled-out    : explicitement ECARTE. Le compter serait le contraire de
  //                ce que le praticien a conclu.
  return null;
}

export interface LigneRapport {
  dataElement: string;
  libelle: string;
  confirmes: number;
  suspects: number;
}

export interface Rapport {
  periode: string;
  orgUnit: string;
  lignes: LigneRapport[];
  /** Diagnostics examines, toutes certitudes confondues. */
  examines: number;
  /** Diagnostics retenus dans au moins une case. */
  retenus: number;
  /** Diagnostics ecartes, avec le motif qui domine. */
  ecartes: { nonSignes: number; differentiels: number; ecartes: number; sansCodeSuivi: number };
}

export interface EntreeRapport extends DiagnosticSource {
  dataElement: string;
  libelle: string;
}

/**
 * Construit le rapport.
 *
 * Les entrees sans correspondance de surveillance arrivent ici avec un
 * `dataElement` vide : elles sont comptees comme examinees et non retenues,
 * plutot que filtrees en amont sans laisser de trace. Un rapport qui ne dit
 * pas combien de diagnostics il a laisses de cote ne peut pas etre relu.
 */
export function construireRapport(opts: {
  periode: string;
  orgUnit: string;
  entrees: EntreeRapport[];
}): Rapport {
  const lignes = new Map<string, LigneRapport>();
  const ecartes = { nonSignes: 0, differentiels: 0, ecartes: 0, sansCodeSuivi: 0 };
  let retenus = 0;

  for (const e of opts.entrees) {
    const ou = caseDuRapport(e);

    if (ou === null) {
      if (!e.consultationSignee) ecartes.nonSignes += 1;
      else if (e.certitude === 'differential') ecartes.differentiels += 1;
      else if (e.certitude === 'ruled-out') ecartes.ecartes += 1;
      continue;
    }

    if (!e.dataElement) {
      ecartes.sansCodeSuivi += 1;
      continue;
    }

    const ligne = lignes.get(e.dataElement) ?? {
      dataElement: e.dataElement,
      libelle: e.libelle,
      confirmes: 0,
      suspects: 0,
    };
    if (ou === 'confirme') ligne.confirmes += 1;
    else ligne.suspects += 1;
    lignes.set(e.dataElement, ligne);
    retenus += 1;
  }

  return {
    periode: opts.periode,
    orgUnit: opts.orgUnit,
    lignes: [...lignes.values()].sort((a, b) => a.dataElement.localeCompare(b.dataElement)),
    examines: opts.entrees.length,
    retenus,
    ecartes,
  };
}

/**
 * Met le rapport au format attendu par DHIS2.
 *
 * Les confirmes et les suspects partent dans DEUX elements de donnees
 * distincts, suffixes `_CONF` et `_SUSP`. Les verser dans le meme element
 * reviendrait a perdre la distinction au moment precis ou elle quitte
 * l'etablissement, et personne en aval ne pourrait la retrouver.
 */
export function versDhis2(r: Rapport): Record<string, unknown> {
  const dataValues: { dataElement: string; value: string; comment: string }[] = [];
  for (const l of r.lignes) {
    if (l.confirmes > 0) {
      dataValues.push({
        dataElement: `${l.dataElement}_CONF`,
        value: String(l.confirmes),
        comment: `${l.libelle} (confirmes)`,
      });
    }
    if (l.suspects > 0) {
      dataValues.push({
        dataElement: `${l.dataElement}_SUSP`,
        value: String(l.suspects),
        comment: `${l.libelle} (suspects)`,
      });
    }
  }
  return {
    dataSet: 'SMARTHEALTH_MONTHLY',
    period: r.periode,
    orgUnit: r.orgUnit,
    dataValues,
  };
}

/** Periode DHIS2 : AAAAMM. */
export function periodeDhis2(annee: number, mois: number): string {
  return `${annee}${String(mois).padStart(2, '0')}`;
}
