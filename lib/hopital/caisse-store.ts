/**
 * Persistance de la caisse.
 *
 * Les REGLES vivent dans caisse.ts, qui est pur. Ici on lit la facture, on
 * soumet au jugement, et on ecrit ce qui a ete accorde.
 *
 * UN PAIEMENT NE SE MODIFIE NI NE SE SUPPRIME. Il s'annule par un paiement
 * inverse, trace comme tel. Une caisse dont les lignes s'editent ne prouve
 * rien, et c'est justement une preuve qu'on lui demande.
 */

import { randomUUID } from 'node:crypto';
import { all, audit, get, insert, run, tx } from '../db.ts';
import {
  avisAvantActe,
  francs,
  encaisser,
  facturer,
  solde,
  type AvisPaiement,
  type DecisionCaisse,
  type Facture,
  type LigneFacture,
  type Paiement,
  type Solde,
  type Urgence,
} from './caisse.ts';

interface LigneFactureDb {
  id: string;
  facture_id: string;
  libelle: string;
  montant: number;
  quantite: number;
  urgence: Urgence;
}

interface LignePaiementDb {
  id: string;
  facture_id: string;
  montant: number;
  moyen: Paiement['moyen'];
  recu_le: string;
}

interface LigneFactureEntete {
  id: string;
  sejour_id: string;
  part_tiers: number;
  tiers_nom: string | null;
  close: number;
}

// ------------------------------------------------------------------ lecture

export function factureParId(id: string): Facture | null {
  const f = get<LigneFactureEntete>('SELECT * FROM facture WHERE id = ?', [id]);
  if (!f) return null;

  const lignes = all<LigneFactureDb>(
    'SELECT * FROM facture_ligne WHERE facture_id = ? ORDER BY created_at',
    [id],
  ).map<LigneFacture>((l) => ({
    id: l.id,
    libelle: l.libelle,
    montant: l.montant,
    quantite: l.quantite,
    urgence: l.urgence,
  }));

  const paiements = all<LignePaiementDb>(
    'SELECT * FROM paiement WHERE facture_id = ? ORDER BY recu_le',
    [id],
  ).map<Paiement>((p) => ({ id: p.id, montant: p.montant, moyen: p.moyen, recuLe: p.recu_le }));

  return {
    id: f.id,
    sejourId: f.sejour_id,
    lignes,
    paiements,
    partTiers: f.part_tiers,
    close: f.close === 1,
  };
}

/** La facture ouverte d'un sejour, s'il y en a une. */
export function factureOuverteDuSejour(sejourId: string): Facture | null {
  const f = get<{ id: string }>(
    'SELECT id FROM facture WHERE sejour_id = ? AND close = 0 ORDER BY created_at DESC LIMIT 1',
    [sejourId],
  );
  return f ? factureParId(f.id) : null;
}

export interface FactureAvecSolde {
  facture: Facture;
  solde: Solde;
  tiersNom: string | null;
}

export function etatFacture(id: string): FactureAvecSolde | null {
  const facture = factureParId(id);
  if (!facture) return null;
  const entete = get<{ tiers_nom: string | null }>('SELECT tiers_nom FROM facture WHERE id = ?', [id]);
  return { facture, solde: solde(facture), tiersNom: entete?.tiers_nom ?? null };
}

/**
 * L'avis de caisse avant un acte.
 *
 * Sans facture ouverte, l'avis est « aucun » : un patient qui n'a encore rien
 * a payer ne doit pas rencontrer d'obstacle, et surtout pas a cause d'une
 * facture qui n'existe pas encore.
 */
export function avisPourSejour(sejourId: string, urgence: Urgence): AvisPaiement {
  const f = factureOuverteDuSejour(sejourId);
  if (!f) return { niveau: 'aucun', message: 'Aucune facture ouverte.', resteACharge: 0 };
  return avisAvantActe(f, urgence);
}

// ------------------------------------------------------------------ ecriture

export interface Contexte {
  acteurId: string | null;
  organizationId: string | null;
}

/** Ouvre une facture pour un sejour, ou rend celle qui est deja ouverte. */
export function ouvrirFacture(
  sejourId: string,
  ctx: Contexte,
  tiers?: { nom: string; part: number },
): Facture {
  const existante = factureOuverteDuSejour(sejourId);
  if (existante) return existante;

  const id = randomUUID();
  insert('facture', {
    id,
    sejour_id: sejourId,
    organization_id: ctx.organizationId,
    part_tiers: tiers?.part ?? 0,
    tiers_nom: tiers?.nom ?? null,
    close: 0,
  });
  audit({
    action: 'create',
    entity: 'facture',
    entityId: id,
    actorId: ctx.acteurId ?? undefined,
    detail: { sejour: sejourId, tiers: tiers?.nom ?? null },
  });
  return factureParId(id)!;
}

/** Ajoute un acte a la facture. */
export function ajouterActe(
  factureId: string,
  acte: { libelle: string; montant: number; quantite?: number; urgence?: Urgence },
  ctx: Contexte,
): DecisionCaisse<LigneFacture> {
  const f = factureParId(factureId);
  if (!f) return introuvable();

  const d = facturer(f, {
    libelle: acte.libelle,
    montant: acte.montant,
    quantite: acte.quantite ?? 1,
    urgence: acte.urgence ?? 'programmable',
  });
  if (!d.ok) return d;

  const id = randomUUID();
  return tx(() => {
    insert('facture_ligne', {
      id,
      facture_id: factureId,
      libelle: d.resultat.libelle,
      montant: d.resultat.montant,
      quantite: d.resultat.quantite,
      urgence: d.resultat.urgence,
      acteur_id: ctx.acteurId,
    });
    run("UPDATE facture SET updated_at = datetime('now') WHERE id = ?", [factureId]);
    audit({
      action: 'create',
      entity: 'facture_ligne',
      entityId: id,
      actorId: ctx.acteurId ?? undefined,
      detail: { facture: factureId, libelle: d.resultat.libelle, montant: d.resultat.montant },
    });
    return { ok: true as const, resultat: { ...d.resultat, id } };
  });
}

/** Encaisse un paiement. */
export function encaisserPaiement(
  factureId: string,
  montant: number,
  moyen: Paiement['moyen'],
  ctx: Contexte,
  reference: string | null = null,
  quand = new Date().toISOString(),
): DecisionCaisse<Paiement> {
  const f = factureParId(factureId);
  if (!f) return introuvable();

  const d = encaisser(f, montant, moyen);
  if (!d.ok) return d;

  const id = randomUUID();
  return tx(() => {
    insert('paiement', {
      id,
      facture_id: factureId,
      montant,
      moyen,
      reference,
      acteur_id: ctx.acteurId,
      recu_le: quand,
    });
    run("UPDATE facture SET updated_at = ? WHERE id = ?", [quand, factureId]);
    audit({
      action: 'create',
      entity: 'paiement',
      entityId: id,
      actorId: ctx.acteurId ?? undefined,
      detail: { facture: factureId, montant, moyen, reference },
    });
    return { ok: true as const, resultat: { id, montant, moyen, recuLe: quand } };
  });
}

/**
 * Clot une facture soldee.
 *
 * Une facture non soldee ne se clot pas en silence : la creance resterait
 * due sans plus apparaitre nulle part. Le refus nomme ce qu'il reste.
 */
export function cloreFacture(factureId: string, ctx: Contexte): DecisionCaisse<Solde> {
  const f = factureParId(factureId);
  if (!f) return introuvable();
  if (f.close) {
    return {
      ok: false,
      motif: 'FACTURE_CLOSE',
      message: 'Cette facture est deja close.',
      remede: 'Aucune action necessaire.',
    };
  }

  const s = solde(f);
  if (!s.soldee) {
    return {
      ok: false,
      motif: 'DEPASSE_RESTE_A_CHARGE',
      message: `Il reste ${francs(s.resteACharge)} a regler sur cette facture.`,
      remede: `Encaisser ${francs(s.resteACharge)}, ou enregistrer une prise en charge par un tiers, avant de clore.`,
    };
  }

  run("UPDATE facture SET close = 1, updated_at = datetime('now') WHERE id = ?", [factureId]);
  audit({
    action: 'update',
    entity: 'facture',
    entityId: factureId,
    actorId: ctx.acteurId ?? undefined,
    detail: { close: true, total: s.total, tropPercu: s.tropPercu },
  });
  return { ok: true, resultat: s };
}

function introuvable() {
  return {
    ok: false as const,
    motif: 'FACTURE_CLOSE' as const,
    message: 'Facture introuvable.',
    remede: 'Verifier la reference, ou ouvrir une facture pour ce sejour.',
  };
}
