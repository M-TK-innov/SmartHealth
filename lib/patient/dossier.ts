import { all, get, nowIso, run } from '../db.ts';
import { compter } from '../allegement/store.ts';
import {
  projeterFacture,
  projeterOrdonnance,
  projeterSejour,
  type FactureVue,
  type OrdonnanceVue,
  type SejourVue,
  type StatutOrdonnance,
} from './visibilite.ts';
import type { SessionPatient } from './store.ts';

/**
 * Lecture du dossier par le patient lui-meme.
 *
 * UNE SEULE REGLE D'ACCES, ET ELLE EST ICI
 *
 * Toutes les requetes partent des dossiers RATTACHES a la session, jamais
 * d'un identifiant venu de l'adresse. Il n'existe donc aucune fonction a qui
 * l'on puisse passer le dossier d'un autre : la faille la plus banale de ce
 * genre d'espace, changer un numero dans l'URL, n'a pas de prise parce
 * qu'aucun numero n'y transite.
 *
 * Ce que le patient voit de chaque objet est decide par `visibilite.ts`, qui
 * ne laisse passer que ce qui a ete nomme.
 */

function dossiers(session: SessionPatient): string[] {
  return session.dossiers.map((d) => d.patient_id);
}

/** Construit les « ? » d'un IN, pour un nombre connu de valeurs. */
function marques(n: number): string {
  return Array.from({ length: n }, () => '?').join(',');
}

// ----------------------------------------------------------- ordonnances

interface LigneOrd {
  id: string;
  status: StatutOrdonnance;
  validated_at: string | null;
  created_at: string;
  prescripteur: string | null;
  qr_payload: string | null;
}

export function ordonnancesDe(session: SessionPatient): OrdonnanceVue[] {
  const ids = dossiers(session);
  if (ids.length === 0) return [];

  const brutes = all<LigneOrd>(
    `SELECT p.id, p.status, p.validated_at, p.created_at, p.qr_payload,
            CASE WHEN pr.id IS NULL THEN NULL
                 ELSE TRIM(pr.given_name || ' ' || pr.family_name) END AS prescripteur
       FROM prescription p
       LEFT JOIN practitioner pr ON pr.id = p.practitioner_id
      WHERE p.patient_id IN (${marques(ids.length)})
      ORDER BY p.created_at DESC`,
    ids,
  );
  if (brutes.length === 0) return [];

  const lignes = all<{
    prescription_id: string;
    drug_name: string;
    strength: string | null;
    dose: string | null;
    frequency: string | null;
    duration_days: number | null;
    quantity: string | null;
  }>(
    `SELECT prescription_id, drug_name, strength, dose, frequency, duration_days, quantity
       FROM prescription_item
      WHERE prescription_id IN (${marques(brutes.length)})
      ORDER BY seq`,
    brutes.map((b) => b.id),
  );

  const parOrdonnance = new Map<string, typeof lignes>();
  for (const l of lignes) {
    const liste = parOrdonnance.get(l.prescription_id) ?? [];
    liste.push(l);
    parOrdonnance.set(l.prescription_id, liste);
  }

  const vues: OrdonnanceVue[] = [];
  for (const b of brutes) {
    const vue = projeterOrdonnance({
      id: b.id,
      statut: b.status,
      valideeLe: b.validated_at,
      prescriteLe: b.created_at,
      prescripteur: b.prescripteur,
      qr: b.qr_payload,
      lignes: (parOrdonnance.get(b.id) ?? []).map((l) => ({
        medicament: l.drug_name,
        dosage: l.strength,
        posologie: [l.dose, l.frequency].filter(Boolean).join(', ') || null,
        dureeJours: l.duration_days,
        quantite: l.quantity,
      })),
    });
    if (vue) vues.push(vue);
  }
  return vues;
}

// -------------------------------------------------------------- factures

export function facturesDe(session: SessionPatient): FactureVue[] {
  const ids = dossiers(session);
  if (ids.length === 0) return [];

  const factures = all<{
    id: string;
    sejour_id: string;
    part_tiers: number;
    close: number;
  }>(
    `SELECT f.id, f.sejour_id, f.part_tiers, f.close
       FROM facture f JOIN sejour s ON s.id = f.sejour_id
      WHERE s.patient_id IN (${marques(ids.length)})
      ORDER BY f.created_at DESC`,
    ids,
  );
  if (factures.length === 0) return [];

  const idsF = factures.map((f) => f.id);
  const lignes = all<{
    facture_id: string;
    id: string;
    libelle: string;
    montant: number;
    quantite: number;
    urgence: string;
  }>(
    `SELECT facture_id, id, libelle, montant, quantite, urgence
       FROM facture_ligne WHERE facture_id IN (${marques(idsF.length)})`,
    idsF,
  );
  const paiements = all<{
    facture_id: string;
    id: string;
    montant: number;
    moyen: string;
    recu_le: string;
  }>(
    `SELECT facture_id, id, montant, moyen, recu_le
       FROM paiement WHERE facture_id IN (${marques(idsF.length)})`,
    idsF,
  );

  return factures.map((f) =>
    projeterFacture({
      id: f.id,
      sejourId: f.sejour_id,
      partTiers: f.part_tiers,
      close: Boolean(f.close),
      lignes: lignes
        .filter((l) => l.facture_id === f.id)
        .map((l) => ({
          id: l.id,
          libelle: l.libelle,
          montant: l.montant,
          quantite: l.quantite,
          urgence: l.urgence as 'vitale' | 'urgente' | 'programmable',
        })),
      paiements: paiements
        .filter((p) => p.facture_id === f.id)
        .map((p) => ({
          id: p.id,
          montant: p.montant,
          moyen: p.moyen as 'especes' | 'mobile' | 'carte' | 'tiers-payant',
          recuLe: p.recu_le,
        })),
    }),
  );
}

// --------------------------------------------------------------- sejours

export function sejoursDe(session: SessionPatient): SejourVue[] {
  const ids = dossiers(session);
  if (ids.length === 0) return [];

  return all<{
    id: string;
    admis_le: string | null;
    sorti_le: string | null;
    type: string;
    motif: string | null;
    created_at: string;
  }>(
    `SELECT id, admis_le, sorti_le, type, motif, created_at
       FROM sejour
      WHERE patient_id IN (${marques(ids.length)}) AND statut <> 'annule'
      ORDER BY COALESCE(admis_le, created_at) DESC`,
    ids,
  ).map((s) =>
    projeterSejour({
      id: s.id,
      entreeLe: s.admis_le ?? s.created_at,
      sortieLe: s.sorti_le,
      service: s.type,
      motif: s.motif,
    }),
  );
}

// ------------------------------------------------------------ allegement

/**
 * Note qu'une consultation a eu lieu hors de la structure.
 *
 * C'est un fait CONSTATE : la requete a eu lieu depuis un telephone, et le
 * deplacement epargne en est deduit, pas l'inverse.
 *
 * UNE FOIS PAR SESSION, et le marqueur vit dans la ligne de session.
 * Compter a chaque affichage ferait d'un rechargement un deplacement
 * epargne ; ne compter qu'une fois par personne et par jour obligerait a
 * mettre un identifiant de personne dans le compteur, ce qu'on refuse. La
 * session est le bon grain : elle correspond a une fois ou quelqu'un a
 * ouvert son espace au lieu de se deplacer.
 *
 * Sans organisation : savoir QUEL dossier etait regarde est exactement le
 * lien que ce compteur n'a pas le droit d'avoir.
 */
export function noterVisiteADistance(session: SessionPatient): boolean {
  const ligne = get<{ allegement_le: string | null }>(
    'SELECT allegement_le FROM patient_session WHERE id = ?',
    [session.sessionId],
  );
  if (!ligne || ligne.allegement_le) return false;

  run('UPDATE patient_session SET allegement_le = ? WHERE id = ?', [nowIso(), session.sessionId]);

  return compter(
    { type: 'consultation-a-distance', disponible: true, presentee: true, quantite: 1 },
    null,
  );
}
