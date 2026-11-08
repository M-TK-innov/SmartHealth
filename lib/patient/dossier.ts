import { all, get, nowIso, run } from '../db.ts';
import { compter } from '../allegement/store.ts';
import {
  projeterAnalyse,
  projeterDossierMedical,
  projeterFacture,
  projeterOrdonnance,
  projeterRendezVous,
  projeterSejour,
  type AnalyseVue,
  type DossierMedicalVue,
  type FactureVue,
  type OrdonnanceVue,
  type RendezVousVue,
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

// -------------------------------------------------------------- analyses

interface LigneAnalyse {
  id: string;
  examen: string;
  domaine: string;
  demandee_le: string;
  etat: string;
  priorite: string;
  valeur_num: number | null;
  valeur_texte: string | null;
  unite: string | null;
  interpretation: string | null;
  rendu_le: string | null;
  remplace_par: string | null;
  a_transmettre: number | null;
}

/**
 * Les analyses du patient, resultat compris.
 *
 * ON NE JOINT QUE LE DERNIER RESULTAT de chaque demande. Une correction cree
 * une NOUVELLE ligne et marque l'ancienne comme remplacee : joindre
 * naivement rendrait les deux, et le patient verrait son examen deux fois
 * avec deux valeurs differentes, sans savoir laquelle vaut. La projection
 * ecarte ensuite les versions remplacees, mais le tri doit deja etre bon ici,
 * sinon c'est l'ancienne qui arrive en tete.
 */
export function analysesDe(session: SessionPatient): AnalyseVue[] {
  const ids = dossiers(session);
  if (ids.length === 0) return [];

  const brutes = all<LigneAnalyse>(
    `SELECT d.id, d.examen, d.domaine, d.demandee_le, d.etat, d.priorite,
            r.valeur_num, r.valeur_texte, r.unite, r.interpretation,
            r.rendu_le, r.remplace_par, r.a_transmettre
       FROM demande_examen d
       LEFT JOIN resultat_examen r
         ON r.id = (SELECT r2.id FROM resultat_examen r2
                     WHERE r2.demande_id = d.id
                     ORDER BY r2.rendu_le DESC LIMIT 1)
      WHERE d.patient_id IN (${marques(ids.length)})
        AND d.etat <> 'annulee'
      ORDER BY d.demandee_le DESC`,
    ids,
  );

  const vues: AnalyseVue[] = [];
  for (const b of brutes) {
    const vue = projeterAnalyse({
      id: b.id,
      examen: b.examen,
      domaine: b.domaine,
      demandeeLe: b.demandee_le,
      etat: b.etat,
      priorite: b.priorite,
      valeurNum: b.valeur_num,
      valeurTexte: b.valeur_texte,
      unite: b.unite,
      interpretation: b.interpretation,
      rendueLe: b.rendu_le,
      remplacePar: b.remplace_par,
      aTransmettre: b.a_transmettre === 1,
    });
    if (vue) vues.push(vue);
  }
  return vues;
}

// ----------------------------------------------------------- rendez-vous

interface LigneRdv {
  id: string;
  mode: string;
  motif: string | null;
  debut: string;
  duree_min: number;
  etat: string;
  praticien: string | null;
  lieu: string | null;
  salle: string | null;
  consentement_le: string | null;
  annule_motif: string | null;
}

/**
 * Les rendez-vous du patient, a venir d'abord.
 *
 * L'ordre n'est pas chronologique mais utile : quelqu'un qui ouvre cet ecran
 * veut savoir quand il doit revenir, pas se souvenir de l'an dernier. Les
 * rendez-vous passes suivent, du plus recent au plus ancien.
 */
export function rendezVousDe(session: SessionPatient): RendezVousVue[] {
  const ids = dossiers(session);
  if (ids.length === 0) return [];

  const brutes = all<LigneRdv>(
    `SELECT v.id, v.mode, v.motif, v.debut, v.duree_min, v.etat,
            v.salle, v.consentement_le, v.annule_motif,
            CASE WHEN pr.id IS NULL THEN NULL
                 ELSE TRIM(pr.given_name || ' ' || pr.family_name) END AS praticien,
            o.name AS lieu
       FROM rendez_vous v
       LEFT JOIN practitioner pr ON pr.id = v.practitioner_id
       LEFT JOIN organization o ON o.id = v.organization_id
      WHERE v.patient_id IN (${marques(ids.length)})
      ORDER BY v.debut DESC`,
    ids,
  );

  const maintenant = nowIso();
  const vues = brutes.map((b) =>
    projeterRendezVous(
      {
        id: b.id,
        mode: b.mode,
        motif: b.motif,
        debut: b.debut,
        dureeMin: b.duree_min,
        etat: b.etat,
        praticien: b.praticien,
        lieu: b.lieu,
        salle: b.salle,
        consentementLe: b.consentement_le,
        annuleMotif: b.annule_motif,
      },
      b.debut < maintenant,
    ),
  );

  const aVenir = vues.filter((v) => !v.passe).sort((a, b) => a.debut.localeCompare(b.debut));
  const passes = vues.filter((v) => v.passe);
  return [...aVenir, ...passes];
}

// -------------------------------------------------------- dossier medical

/**
 * Le dossier medical portable du patient.
 *
 * UN SEUL DOSSIER A LA FOIS. Un compte peut en porter plusieurs — un parent
 * qui suit ses enfants — et fondre leurs allergies en une liste serait une
 * erreur dangereuse : on ne sait plus qui est allergique a quoi. L'appelant
 * choisit donc le dossier, et `null` est rendu si ce dossier n'est pas
 * rattache a la session.
 */
export function dossierMedicalDe(
  session: SessionPatient,
  patientId: string,
): DossierMedicalVue | null {
  // Le controle tient en cette ligne : l'identifiant doit venir des dossiers
  // DE LA SESSION. Un numero glisse dans l'adresse ne passe pas.
  if (!dossiers(session).includes(patientId)) return null;

  const p = get<{
    given_name: string;
    family_name: string;
    birth_date: string | null;
    birth_date_estimated: number | null;
    gender: string | null;
    blood_group: string | null;
    mrn: string | null;
    national_id: string | null;
  }>(
    `SELECT given_name, family_name, birth_date, birth_date_estimated,
            gender, blood_group, mrn, national_id
       FROM patient WHERE id = ?`,
    [patientId],
  );
  if (!p) return null;

  const allergies = all<{ substance: string; reaction: string | null; criticality: string | null }>(
    `SELECT substance, reaction, criticality FROM allergy
      WHERE patient_id = ? ORDER BY recorded_at DESC`,
    [patientId],
  );

  // Seulement ce qui est ACTIF et CONFIRME. Un probleme resolu ou encore au
  // conditionnel n'a pas a figurer sur ce qui tient lieu de carnet : on le
  // presenterait aux urgences comme un fait etabli.
  const problemes = all<{ label: string; onset_date: string | null; clinical_status: string }>(
    `SELECT label, onset_date, clinical_status FROM problem
      WHERE patient_id = ? AND verification_status = 'confirmed'
      ORDER BY recorded_at DESC`,
    [patientId],
  );

  const traitements = all<{ drug_name: string; dose: string | null; started_on: string | null }>(
    `SELECT drug_name, dose, started_on FROM medication_statement
      WHERE patient_id = ? AND status = 'active'
      ORDER BY started_on DESC`,
    [patientId],
  );

  return projeterDossierMedical({
    nom: `${p.given_name} ${p.family_name}`.trim(),
    neLe: p.birth_date,
    naissanceEstimee: p.birth_date_estimated === 1,
    sexe: p.gender,
    groupeSanguin: p.blood_group,
    numeroDossier: p.mrn,
    npi: p.national_id,
    allergies: allergies.map((a) => ({
      substance: a.substance,
      reaction: a.reaction,
      criticite: a.criticality,
    })),
    problemes: problemes.map((q) => ({
      libelle: q.label,
      depuis: q.onset_date,
      actif: q.clinical_status === 'active',
    })),
    traitements: traitements.map((m) => ({
      medicament: m.drug_name,
      dose: m.dose,
      depuis: m.started_on,
    })),
  });
}

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
