import { all, get } from '../db.ts';
import { prochaineEtape, toutCeQuiAttend, type EtatParcours, type Suite } from './regles.ts';

/**
 * Rassemble, pour un patient, ce que chaque module sait de lui.
 *
 * C'EST ICI QUE LES MODULES COMMUNIQUENT. Chacun gardait sa part : les files
 * savaient qui attendait, le laboratoire ce qu'il avait rendu, la caisse ce
 * qui restait du, la pharmacie ce qui n'avait pas ete retire. Personne ne
 * voyait le trajet, et le patient faisait la liaison a pied.
 *
 * UNE SEULE REQUETE PAR MODULE, JAMAIS UNE PAR LIGNE. Cet etat se calcule
 * pour chaque patient d'une file : une requete par patient et par module
 * ferait des centaines d'allers-retours a l'affichage d'un ecran d'accueil.
 * D'ou `etatsDe`, qui prend une liste et rend une table.
 *
 * LA DECISION N'EST PAS ICI. Ce fichier lit ; `regles.ts` tranche. Un module
 * qui lit la base ne se teste pas deux fois pareil, et l'ordre des priorites
 * est precisement ce qu'il faut pouvoir tester sans monter d'hopital.
 */

/** Construit les « ? » d'un IN, pour un nombre connu de valeurs. */
const marques = (n: number) => Array.from({ length: n }, () => '?').join(',');

/**
 * L'etat de plusieurs patients d'un coup.
 *
 * Rend une table indexee par identifiant de patient. Un patient sans rien en
 * attente y figure quand meme, avec un etat vide : l'appelant veut savoir
 * qu'il n'a rien, pas chercher pourquoi il manque.
 */
export function etatsDe(patientIds: string[]): Map<string, EtatParcours> {
  const table = new Map<string, EtatParcours>();
  if (patientIds.length === 0) return table;

  for (const id of patientIds) {
    table.set(id, {
      file: null,
      consultationOuverte: null,
      consultationASigner: null,
      aPrelever: 0,
      resultatsNonLus: 0,
      critiqueNonAcquittee: false,
      ordonnanceAValider: false,
      ordonnanceARetirer: false,
      resteACharge: 0,
      sejour: null,
    });
  }

  const m = marques(patientIds.length);
  const poser = (id: string, f: (e: EtatParcours) => EtatParcours) => {
    const e = table.get(id);
    if (e) table.set(id, f(e));
  };

  // --- Les consultations : ouverte, ou analysee et en attente de signature.
  for (const c of all<{ patient_id: string; id: string; status: string }>(
    `SELECT patient_id, id, status FROM consultation
      WHERE patient_id IN (${m}) AND status IN ('in-progress', 'analyzed')
      ORDER BY started_at`,
    patientIds,
  )) {
    poser(c.patient_id, (e) =>
      c.status === 'analyzed'
        ? { ...e, consultationASigner: e.consultationASigner ?? c.id }
        : { ...e, consultationOuverte: e.consultationOuverte ?? c.id },
    );
  }

  // --- Les ordonnances : redigee mais non validee, ou validee non dispensee.
  for (const r of all<{ patient_id: string; status: string; n: number }>(
    `SELECT patient_id, status, COUNT(*) n FROM prescription
      WHERE patient_id IN (${m}) AND status IN ('draft', 'validated')
      GROUP BY patient_id, status`,
    patientIds,
  )) {
    poser(r.patient_id, (e) =>
      r.status === 'draft'
        ? { ...e, ordonnanceAValider: true }
        : { ...e, ordonnanceARetirer: true },
    );
  }

  // --- Les examens. Un prelevement attendu et un resultat rendu sont deux
  //     etats differents de la meme demande : on les compte separement.
  for (const d of all<{ patient_id: string; etat: string; n: number }>(
    `SELECT patient_id, etat, COUNT(*) n FROM demande_examen
      WHERE patient_id IN (${m}) AND etat NOT IN ('validee', 'annulee')
      GROUP BY patient_id, etat`,
    patientIds,
  )) {
    poser(d.patient_id, (e) =>
      d.etat === 'demandee'
        ? { ...e, aPrelever: e.aPrelever + d.n }
        : d.etat === 'resultat-disponible'
          ? { ...e, resultatsNonLus: e.resultatsNonLus + d.n }
          : e,
    );
  }

  // --- Les valeurs critiques non acquittees. `a_transmettre` reste vrai tant
  //     qu'aucun soignant n'a ete joint NOMMEMENT : c'est ce drapeau, et non
  //     l'interpretation, qui dit que personne n'est au courant.
  for (const c of all<{ patient_id: string }>(
    `SELECT DISTINCT d.patient_id
       FROM resultat_examen r JOIN demande_examen d ON d.id = r.demande_id
      WHERE d.patient_id IN (${m}) AND r.a_transmettre = 1 AND r.remplace_par IS NULL`,
    patientIds,
  )) {
    poser(c.patient_id, (e) => ({ ...e, critiqueNonAcquittee: true }));
  }

  // --- Le sejour en cours, et son lit.
  for (const s of all<{ patient_id: string; id: string; lit_id: string | null }>(
    `SELECT patient_id, id, lit_id FROM sejour
      WHERE patient_id IN (${m}) AND sorti_le IS NULL`,
    patientIds,
  )) {
    poser(s.patient_id, (e) => ({
      ...e,
      sejour: { id: s.id, litAssigne: s.lit_id !== null },
    }));
  }

  // --- Le passage ouvert dans une file, avec le nom du poste.
  for (const p of all<{ patient_id: string; poste_id: string; nom: string; etat: string }>(
    `SELECT s.patient_id, p.poste_id, po.nom, p.etat
       FROM passage p
       JOIN sejour s ON s.id = p.sejour_id
       JOIN poste po ON po.id = p.poste_id
      WHERE s.patient_id IN (${m}) AND p.etat IN ('en-attente', 'en-cours')
      ORDER BY p.arrive_le`,
    patientIds,
  )) {
    poser(p.patient_id, (e) =>
      e.file ? e : { ...e, file: { posteId: p.poste_id, posteNom: p.nom, etat: p.etat } },
    );
  }

  // --- Le reste a charge des factures ouvertes.
  for (const f of all<{ patient_id: string; du: number }>(
    `SELECT s.patient_id,
            COALESCE(SUM(l.montant * l.quantite), 0) - COALESCE(SUM(f.part_tiers), 0)
              - COALESCE((SELECT SUM(pa.montant) FROM paiement pa WHERE pa.facture_id = f.id), 0) AS du
       FROM facture f
       JOIN sejour s ON s.id = f.sejour_id
       LEFT JOIN facture_ligne l ON l.facture_id = f.id
      WHERE s.patient_id IN (${m}) AND f.close = 0
      GROUP BY f.id, s.patient_id`,
    patientIds,
  )) {
    if (f.du > 0) poser(f.patient_id, (e) => ({ ...e, resteACharge: e.resteACharge + f.du }));
  }

  return table;
}

/** L'etat d'un seul patient. */
export function etatDe(patientId: string): EtatParcours {
  return etatsDe([patientId]).get(patientId)!;
}

/** Ce qui vient ensuite pour ce patient. */
export function suiteDe(patientId: string): Suite {
  return prochaineEtape(etatDe(patientId));
}

/** Tout ce qui attend ce patient, dans l'ordre du risque. */
export function attentesDe(patientId: string): Suite[] {
  return toutCeQuiAttend(etatDe(patientId));
}

/**
 * Les patients d'un etablissement qui ont quelque chose en attente.
 *
 * C'est la vue dont l'accueil a besoin : non pas « qui est dans la file »,
 * mais « qui attend quelque chose de quelqu'un ». Un patient parti avec son
 * ordonnance non retiree y figure ; un patient en consultation, non.
 */
export function enAttenteDansLEtablissement(
  organizationId: string | null,
  limite = 20,
): { patientId: string; nom: string; mrn: string | null; suite: Suite }[] {
  const patients = all<{ id: string; given_name: string; family_name: string; mrn: string | null }>(
    `SELECT id, given_name, family_name, mrn FROM patient
      WHERE (? IS NULL OR organization_id = ? OR organization_id IS NULL)
      ORDER BY updated_at DESC LIMIT 200`,
    [organizationId, organizationId],
  );
  if (patients.length === 0) return [];

  const etats = etatsDe(patients.map((p) => p.id));
  const lignes: { patientId: string; nom: string; mrn: string | null; suite: Suite }[] = [];

  for (const p of patients) {
    const e = etats.get(p.id);
    if (!e) continue;
    const suite = prochaineEtape(e);
    // Un constat n'est pas une attente. Le drapeau vient des regles ; filtrer
    // sur un libelle marcherait aujourd'hui et casserait a la premiere
    // reformulation.
    if (!suite.attente) continue;
    lignes.push({
      patientId: p.id,
      nom: `${p.given_name} ${p.family_name}`,
      mrn: p.mrn,
      suite,
    });
    if (lignes.length >= limite) break;
  }
  return lignes;
}

/** Un patient existe-t-il ? Sert aux ecrans qui recoivent un identifiant. */
export function patientExiste(id: string): boolean {
  return Boolean(get<{ n: number }>('SELECT COUNT(*) n FROM patient WHERE id = ?', [id])?.n);
}
