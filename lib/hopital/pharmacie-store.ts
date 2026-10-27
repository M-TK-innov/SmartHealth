/**
 * Persistance de la pharmacie.
 *
 * Les REGLES vivent dans pharmacie.ts, qui est pur. Ici on lit les lots, on
 * soumet la demande, et on ecrit ce qui a ete accorde.
 *
 * TOUT PASSE PAR UNE TRANSACTION. Une dispensation touche plusieurs lots,
 * la dispensation elle-meme, ses lignes et le journal de stock : interrompue
 * au milieu, elle laisserait un stock decremente sans trace de ce qui est
 * sorti — l'ecart d'inventaire le plus difficile a expliquer.
 *
 * La base porte par ailleurs un CHECK (quantite >= 0) sur les lots : si une
 * ecriture concurrente servait le meme lot entre la lecture et l'ecriture,
 * la transaction echoue au lieu de creer un stock negatif.
 */

import { randomUUID } from 'node:crypto';
import { all, audit, get, insert, run, tx } from '../db.ts';
import {
  alerteStock,
  dispenser,
  type AlerteStock,
  type Article,
  type DecisionPharmacie,
  type Dispensation,
  type Lot,
} from './pharmacie.ts';

interface LigneArticle {
  id: string;
  dci: string;
  forme: string | null;
  dosage: string | null;
  seuil_alerte: number;
}

interface LigneLot {
  id: string;
  article_id: string;
  numero: string;
  perime_le: string;
  quantite: number;
}

const versArticle = (a: LigneArticle): Article => ({
  id: a.id,
  dci: a.dci,
  forme: a.forme,
  dosage: a.dosage,
  seuilAlerte: a.seuil_alerte,
});

const versLot = (l: LigneLot): Lot => ({
  id: l.id,
  articleId: l.article_id,
  numero: l.numero,
  perimeLe: l.perime_le,
  quantite: l.quantite,
});

/** Le jour, au format AAAA-MM-JJ, tel que les regles l'attendent. */
export const jour = (d = new Date()) => d.toISOString().slice(0, 10);

// ------------------------------------------------------------------ lecture

export function articleParId(id: string): Article | null {
  const a = get<LigneArticle>('SELECT * FROM article WHERE id = ?', [id]);
  return a ? versArticle(a) : null;
}

export function lotsDeLArticle(articleId: string): Lot[] {
  return all<LigneLot>('SELECT * FROM lot WHERE article_id = ? ORDER BY perime_le', [articleId]).map(
    versLot,
  );
}

/**
 * L'etat du rayon, article par article.
 *
 * Trie en mettant devant ce sur quoi il faut agir : rupture et peremption
 * d'abord, puis stock bas. Un inventaire par ordre alphabetique oblige a
 * lire toute la liste pour trouver les trois lignes qui comptent.
 */
export function rayon(organizationId: string | null, aujourdhui = jour()): AlerteStock[] {
  const articles = all<LigneArticle>(
    `SELECT * FROM article
      WHERE actif = 1 AND (? IS NULL OR organization_id = ? OR organization_id IS NULL)`,
    [organizationId, organizationId],
  ).map(versArticle);

  const rang = { perime: 0, rupture: 1, bas: 2, ok: 3 } as const;

  return articles
    .map((a) => alerteStock(a, lotsDeLArticle(a.id), aujourdhui))
    .sort((x, y) => rang[x.niveau] - rang[y.niveau] || x.dci.localeCompare(y.dci, 'fr'));
}

/**
 * Les allergies connues d'un patient.
 *
 * Toutes les categories, pas seulement « medication ». Une allergie notee
 * sous une autre categorie — un excipient, un produit de contraste — reste
 * une allergie ; la filtrer ici, c'est choisir de ne pas voir.
 */
export function allergiesDuPatient(patientId: string): string[] {
  return all<{ substance: string }>('SELECT substance FROM allergy WHERE patient_id = ?', [
    patientId,
  ])
    .map((a) => a.substance.trim())
    .filter(Boolean);
}

// ------------------------------------------------------------------ ecriture

export interface Contexte {
  acteurId: string | null;
  organizationId: string | null;
}

/** Entree de stock : un lot recu. */
export function entrerLot(
  articleId: string,
  lot: { numero: string; perimeLe: string; quantite: number },
  ctx: Contexte,
): DecisionPharmacie<Lot> {
  if (!Number.isInteger(lot.quantite) || lot.quantite < 1) {
    return {
      ok: false,
      motif: 'QUANTITE_INVALIDE',
      message: 'La quantite recue doit etre un nombre entier d unites, au moins 1.',
      remede: 'Corriger la quantite portee sur le bon de livraison.',
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lot.perimeLe)) {
    return {
      ok: false,
      motif: 'QUANTITE_INVALIDE',
      message: 'La date de peremption doit etre au format AAAA-MM-JJ.',
      remede: 'Saisir la date lue sur la boite.',
    };
  }
  const article = articleParId(articleId);
  if (!article) {
    return {
      ok: false,
      motif: 'ARTICLE_INCONNU',
      message: 'Article inconnu.',
      remede: 'Le creer au catalogue avant d enregistrer la livraison.',
    };
  }

  const id = randomUUID();
  return tx(() => {
    insert('lot', {
      id,
      article_id: articleId,
      numero: lot.numero,
      perime_le: lot.perimeLe,
      quantite: lot.quantite,
    });
    insert('mouvement_stock', {
      id: randomUUID(),
      lot_id: id,
      article_id: articleId,
      type: 'entree',
      quantite: lot.quantite,
      acteur_id: ctx.acteurId,
    });
    audit({
      action: 'create',
      entity: 'lot',
      entityId: id,
      actorId: ctx.acteurId ?? undefined,
      detail: { article: article.dci, numero: lot.numero, quantite: lot.quantite, perimeLe: lot.perimeLe },
    });
    return { ok: true as const, resultat: { id, articleId, ...lot } };
  });
}

export interface DemandeServir {
  patientId: string;
  sejourId: string | null;
  prescriptionId: string | null;
  articleId: string;
  quantite: number;
  accepterPartiel?: boolean;
}

/** Sert un article a un patient, lot par lot, et decremente le stock. */
export function servir(
  d: DemandeServir,
  ctx: Contexte,
  aujourdhui = jour(),
): DecisionPharmacie<Dispensation & { dispensationId: string }> {
  const article = articleParId(d.articleId);
  if (!article) {
    return {
      ok: false,
      motif: 'ARTICLE_INCONNU',
      message: 'Article inconnu.',
      remede: 'Verifier la reference au catalogue.',
    };
  }

  const decision = dispenser({
    articleId: d.articleId,
    dci: article.dci,
    quantite: d.quantite,
    lots: lotsDeLArticle(d.articleId),
    allergies: allergiesDuPatient(d.patientId),
    aujourdhui,
    accepterPartiel: d.accepterPartiel,
  });
  if (!decision.ok) return decision;

  const dispensationId = randomUUID();
  return tx(() => {
    insert('dispensation', {
      id: dispensationId,
      sejour_id: d.sejourId,
      patient_id: d.patientId,
      prescription_id: d.prescriptionId,
      organization_id: ctx.organizationId,
      acteur_id: ctx.acteurId,
    });

    for (const p of decision.resultat.prelevements) {
      // La condition sur la quantite rend l'ecriture sure meme si un autre
      // poste a servi le meme lot depuis la lecture : zero ligne modifiee
      // plutot qu'un stock negatif.
      const { changes } = run('UPDATE lot SET quantite = quantite - ? WHERE id = ? AND quantite >= ?', [
        p.quantite,
        p.lotId,
        p.quantite,
      ]);
      if (Number(changes) === 0) {
        throw new Error(
          `Le lot ${p.numero} n a plus les ${p.quantite} unites attendues : un autre poste vient de servir. Recommencer la dispensation.`,
        );
      }

      insert('dispensation_ligne', {
        id: randomUUID(),
        dispensation_id: dispensationId,
        article_id: d.articleId,
        lot_id: p.lotId,
        numero_lot: p.numero,
        perime_le: p.perimeLe,
        quantite: p.quantite,
      });
      insert('mouvement_stock', {
        id: randomUUID(),
        lot_id: p.lotId,
        article_id: d.articleId,
        type: 'dispensation',
        quantite: -p.quantite,
        acteur_id: ctx.acteurId,
      });
    }

    audit({
      action: 'create',
      entity: 'dispensation',
      entityId: dispensationId,
      patientId: d.patientId,
      actorId: ctx.acteurId ?? undefined,
      detail: {
        article: article.dci,
        servi: decision.resultat.servi,
        manquant: decision.resultat.manquant,
        lots: decision.resultat.prelevements.map((p) => p.numero),
      },
    });

    return { ok: true as const, resultat: { ...decision.resultat, dispensationId } };
  });
}

/**
 * Retire du rayon les lots perimes d'un article.
 *
 * Operation distincte de la dispensation, et volontairement explicite :
 * tant que les boites restent en rayon, quelqu'un finira par les servir a la
 * main un soir de garde.
 */
export function detruirePerimes(articleId: string, ctx: Contexte, aujourdhui = jour()): number {
  const perimes = lotsDeLArticle(articleId).filter((l) => l.quantite > 0 && l.perimeLe <= aujourdhui);
  if (perimes.length === 0) return 0;

  return tx(() => {
    let total = 0;
    for (const l of perimes) {
      run('UPDATE lot SET quantite = 0 WHERE id = ?', [l.id]);
      insert('mouvement_stock', {
        id: randomUUID(),
        lot_id: l.id,
        article_id: articleId,
        type: 'destruction',
        quantite: -l.quantite,
        motif: `Perime le ${l.perimeLe}`,
        acteur_id: ctx.acteurId,
      });
      total += l.quantite;
    }
    audit({
      action: 'update',
      entity: 'article',
      entityId: articleId,
      actorId: ctx.acteurId ?? undefined,
      detail: { destruction: total, lots: perimes.map((l) => l.numero) },
    });
    return total;
  });
}

/**
 * Les patients servis depuis un numero de lot.
 *
 * C'est la question qu'on pose un matin, quand un rappel de lot tombe. Elle
 * doit avoir une reponse immediate, des annees apres, meme si la fiche du
 * lot a disparu du stock — d'ou le numero copie sur chaque ligne.
 */
export function patientsServisDepuisLot(numeroLot: string) {
  return all<{
    patient_id: string;
    given_name: string;
    family_name: string;
    quantite: number;
    servi_le: string;
  }>(
    `SELECT d.patient_id, p.given_name, p.family_name, dl.quantite, d.servi_le
       FROM dispensation_ligne dl
       JOIN dispensation d ON d.id = dl.dispensation_id
       JOIN patient p ON p.id = d.patient_id
      WHERE dl.numero_lot = ?
      ORDER BY d.servi_le DESC`,
    [numeroLot],
  );
}
