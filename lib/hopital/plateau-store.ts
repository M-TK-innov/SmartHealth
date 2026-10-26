/**
 * Persistance du plateau technique.
 *
 * Les REGLES vivent dans plateau.ts, qui est pur. Ici on lit l'etat, on
 * soumet, et on ecrit ce qui a ete accorde.
 *
 * LES SEUILS VIENNENT DE LA BASE, jamais du code. Un seuil critique depend
 * de la population, de l'automate et de ce que le service sait faire en
 * reponse ; l'application n'en invente aucun. Sans ligne configuree, le
 * resultat est rendu « non interprete » et le dit.
 */

import { randomUUID } from 'node:crypto';
import { all, audit, get, insert, run, tx } from '../db.ts';
import { versIso, versIsoRequis } from '../temps.ts';
import {
  acquitter,
  corriger,
  prelever,
  rendreResultat,
  tensionPlateau,
  type Demande,
  type DecisionPlateau,
  type Domaine,
  type Resultat,
  type SeuilCritique,
  type StabiliteEchantillon,
  type TensionPlateau,
} from './plateau.ts';

interface LigneDemande {
  id: string;
  patient_id: string;
  domaine: Domaine;
  examen: string;
  priorite: Demande['priorite'];
  etat: Demande['etat'];
  demandee_le: string;
  prelevee_le: string | null;
}

interface LigneResultat {
  id: string;
  demande_id: string;
  valeur_num: number | null;
  valeur_texte: string | null;
  unite: string | null;
  interpretation: Resultat['interpretation'];
  a_transmettre: number;
  rendu_le: string;
  remplace_par: string | null;
}

const versDemande = (d: LigneDemande): Demande => ({
  id: d.id,
  patientId: d.patient_id,
  domaine: d.domaine,
  examen: d.examen,
  priorite: d.priorite,
  etat: d.etat,
  demandeeLe: versIsoRequis(d.demandee_le),
  preleveeLe: versIso(d.prelevee_le),
});

const versResultat = (r: LigneResultat, examen: string): Resultat => ({
  demandeId: r.demande_id,
  examen,
  valeurNum: r.valeur_num,
  valeurTexte: r.valeur_texte,
  unite: r.unite,
  interpretation: r.interpretation,
  aTransmettre: r.a_transmettre === 1,
  renduLe: versIsoRequis(r.rendu_le),
});

// ------------------------------------------------------------------ lecture

export function demandeParId(id: string): Demande | null {
  const d = get<LigneDemande>('SELECT * FROM demande_examen WHERE id = ?', [id]);
  return d ? versDemande(d) : null;
}

export function seuils(organizationId: string | null): SeuilCritique[] {
  return all<{ examen: string; unite: string; borne_basse: number | null; borne_haute: number | null }>(
    `SELECT examen, unite, borne_basse, borne_haute FROM seuil_critique
      WHERE ? IS NULL OR organization_id = ? OR organization_id IS NULL`,
    [organizationId, organizationId],
  ).map((s) => ({ examen: s.examen, unite: s.unite, bas: s.borne_basse, haut: s.borne_haute }));
}

export function stabilites(organizationId: string | null): StabiliteEchantillon[] {
  return all<{ examen: string; stabilite_min: number }>(
    `SELECT examen, stabilite_min FROM seuil_critique
      WHERE stabilite_min IS NOT NULL
        AND (? IS NULL OR organization_id = ? OR organization_id IS NULL)`,
    [organizationId, organizationId],
  ).map((s) => ({ examen: s.examen, minutes: s.stabilite_min }));
}

/** Le dernier resultat d'une demande — celui qu'aucune correction ne remplace. */
export function resultatCourant(demandeId: string): Resultat | null {
  const d = demandeParId(demandeId);
  if (!d) return null;
  const r = get<LigneResultat>(
    'SELECT * FROM resultat_examen WHERE demande_id = ? AND remplace_par IS NULL ORDER BY rendu_le DESC LIMIT 1',
    [demandeId],
  );
  return r ? versResultat(r, d.examen) : null;
}

/** Toutes les versions d'un resultat, de la plus ancienne a la plus recente. */
export function historiqueResultats(demandeId: string) {
  return all<LigneResultat & { motif_correction: string | null }>(
    'SELECT * FROM resultat_examen WHERE demande_id = ? ORDER BY rendu_le',
    [demandeId],
  );
}

export function demandesEnCours(organizationId: string | null, domaine?: Domaine): Demande[] {
  return all<LigneDemande>(
    `SELECT * FROM demande_examen
      WHERE etat NOT IN ('validee', 'annulee')
        AND (? IS NULL OR domaine = ?)
        AND (? IS NULL OR organization_id = ? OR organization_id IS NULL)
      ORDER BY
        CASE priorite WHEN 'vitale' THEN 0 WHEN 'urgente' THEN 1 ELSE 2 END,
        demandee_le`,
    [domaine ?? null, domaine ?? null, organizationId, organizationId],
  ).map(versDemande);
}

/**
 * Les valeurs critiques qui attendent encore un acquittement.
 *
 * C'est la liste qui doit etre vide. Chaque ligne est un patient dont le
 * resultat dangereux dort quelque part.
 */
export function critiquesNonTransmises(organizationId: string | null) {
  return all<{
    resultat_id: string;
    demande_id: string;
    examen: string;
    valeur_num: number | null;
    unite: string | null;
    rendu_le: string;
    patient_id: string;
    given_name: string;
    family_name: string;
  }>(
    `SELECT r.id AS resultat_id, r.demande_id, d.examen, r.valeur_num, r.unite, r.rendu_le,
            p.id AS patient_id, p.given_name, p.family_name
       FROM resultat_examen r
       JOIN demande_examen d ON d.id = r.demande_id
       JOIN patient p ON p.id = d.patient_id
      WHERE r.a_transmettre = 1 AND r.remplace_par IS NULL
        AND (? IS NULL OR d.organization_id = ? OR d.organization_id IS NULL)
      ORDER BY r.rendu_le`,
    [organizationId, organizationId],
  );
}

export function tableauPlateau(organizationId: string | null): TensionPlateau[] {
  const demandes = all<LigneDemande>(
    `SELECT * FROM demande_examen
      WHERE ? IS NULL OR organization_id = ? OR organization_id IS NULL`,
    [organizationId, organizationId],
  ).map(versDemande);

  const parId = new Map(demandes.map((d) => [d.id, d.examen]));
  const resultats = all<LigneResultat>(
    'SELECT * FROM resultat_examen WHERE remplace_par IS NULL',
  )
    .filter((r) => parId.has(r.demande_id))
    .map((r) => versResultat(r, parId.get(r.demande_id)!));

  return (['laboratoire', 'imagerie'] as Domaine[]).map((d) =>
    tensionPlateau(d, demandes, resultats),
  );
}

// ------------------------------------------------------------------ ecriture

export interface Contexte {
  acteurId: string | null;
  organizationId: string | null;
}

export function creerDemande(
  d: {
    patientId: string;
    sejourId?: string | null;
    domaine: Domaine;
    examen: string;
    priorite?: Demande['priorite'];
  },
  ctx: Contexte,
): Demande {
  const id = randomUUID();
  insert('demande_examen', {
    id,
    patient_id: d.patientId,
    sejour_id: d.sejourId ?? null,
    organization_id: ctx.organizationId,
    domaine: d.domaine,
    examen: d.examen,
    priorite: d.priorite ?? 'routine',
    etat: 'demandee',
  });
  audit({
    action: 'create',
    entity: 'demande_examen',
    entityId: id,
    patientId: d.patientId,
    actorId: ctx.acteurId ?? undefined,
    detail: { domaine: d.domaine, examen: d.examen },
  });
  return demandeParId(id)!;
}

/**
 * Enregistre un prelevement, apres controle d'identite.
 *
 * L'identite annoncee est passee par l'appelant : elle doit venir du
 * patient, pas de l'ecran. Un formulaire qui la prerempli transforme le
 * controle en formalite — c'est pourquoi l'ecran laisse le champ vide.
 */
export function enregistrerPrelevement(
  demandeId: string,
  identiteAnnoncee: { nom: string; naissance: string },
  ctx: Contexte,
  quand = new Date().toISOString(),
): DecisionPlateau<Demande> {
  const demande = demandeParId(demandeId);
  if (!demande) return introuvable();

  const dossier = get<{ given_name: string; family_name: string; birth_date: string | null }>(
    'SELECT given_name, family_name, birth_date FROM patient WHERE id = ?',
    [demande.patientId],
  );
  if (!dossier) return introuvable();

  const d = prelever({
    demande,
    identiteAnnoncee,
    identiteDossier: {
      nom: `${dossier.given_name} ${dossier.family_name}`,
      naissance: dossier.birth_date ?? '',
    },
    quand,
  });
  if (!d.ok) {
    // Une discordance d'identite se TRACE, meme refusee. C'est un
    // evenement d'identitovigilance : savoir qu'elle a eu lieu, et ou,
    // vaut plus que le refus lui-meme.
    audit({
      action: 'update',
      entity: 'demande_examen',
      entityId: demandeId,
      patientId: demande.patientId,
      actorId: ctx.acteurId ?? undefined,
      detail: { prelevement: 'refuse', motif: d.motif },
    });
    return d;
  }

  return tx(() => {
    run(
      "UPDATE demande_examen SET etat = 'prelevee', prelevee_le = ?, preleve_par = ?, identite_verifiee = 1 WHERE id = ?",
      [quand, ctx.acteurId, demandeId],
    );
    audit({
      action: 'update',
      entity: 'demande_examen',
      entityId: demandeId,
      patientId: demande.patientId,
      actorId: ctx.acteurId ?? undefined,
      detail: { prelevement: 'enregistre', identiteVerifiee: true },
    });
    return { ok: true as const, resultat: { ...demande, etat: 'prelevee' as const, preleveeLe: quand } };
  });
}

export function saisirResultat(
  demandeId: string,
  valeurs: { valeurNum?: number | null; valeurTexte?: string | null; unite?: string | null },
  ctx: Contexte,
  quand = new Date().toISOString(),
): DecisionPlateau<Resultat & { resultatId: string }> {
  const demande = demandeParId(demandeId);
  if (!demande) return introuvable();

  const d = rendreResultat({
    demande,
    valeurNum: valeurs.valeurNum ?? null,
    valeurTexte: valeurs.valeurTexte ?? null,
    unite: valeurs.unite ?? null,
    seuils: seuils(ctx.organizationId),
    stabilites: stabilites(ctx.organizationId),
    quand,
  });
  if (!d.ok) return d;

  const resultatId = randomUUID();
  return tx(() => {
    insert('resultat_examen', {
      id: resultatId,
      demande_id: demandeId,
      valeur_num: d.resultat.valeurNum,
      valeur_texte: d.resultat.valeurTexte,
      unite: d.resultat.unite,
      interpretation: d.resultat.interpretation,
      a_transmettre: d.resultat.aTransmettre ? 1 : 0,
      rendu_par: ctx.acteurId,
      rendu_le: quand,
    });
    run("UPDATE demande_examen SET etat = 'resultat-disponible' WHERE id = ?", [demandeId]);
    audit({
      action: 'create',
      entity: 'resultat_examen',
      entityId: resultatId,
      patientId: demande.patientId,
      actorId: ctx.acteurId ?? undefined,
      detail: {
        examen: demande.examen,
        interpretation: d.resultat.interpretation,
        aTransmettre: d.resultat.aTransmettre,
      },
    });
    return { ok: true as const, resultat: { ...d.resultat, resultatId } };
  });
}

/** Acquitte une valeur critique : quelqu'un l'a recue, et on sait qui. */
export function acquitterCritique(
  resultatId: string,
  transmisA: string,
  ctx: Contexte,
  commentaire: string | null = null,
  quand = new Date().toISOString(),
): DecisionPlateau<{ resultatId: string; transmisA: string }> {
  const ligne = get<LigneResultat>('SELECT * FROM resultat_examen WHERE id = ?', [resultatId]);
  if (!ligne) return introuvable();
  const demande = demandeParId(ligne.demande_id);
  if (!demande) return introuvable();

  const d = acquitter(versResultat(ligne, demande.examen), transmisA, quand, commentaire);
  if (!d.ok) return d;

  return tx(() => {
    insert('acquittement_critique', {
      id: randomUUID(),
      resultat_id: resultatId,
      transmis_a: d.resultat.transmisA,
      transmis_par: ctx.acteurId,
      commentaire,
      transmis_le: quand,
    });
    run('UPDATE resultat_examen SET a_transmettre = 0 WHERE id = ?', [resultatId]);
    audit({
      action: 'update',
      entity: 'resultat_examen',
      entityId: resultatId,
      patientId: demande.patientId,
      actorId: ctx.acteurId ?? undefined,
      detail: { acquittement: d.resultat.transmisA, examen: demande.examen },
    });
    return { ok: true as const, resultat: { resultatId, transmisA: d.resultat.transmisA } };
  });
}

/**
 * Corrige un resultat : nouvelle ligne, ancienne conservee et marquee.
 */
export function corrigerResultat(
  resultatId: string,
  valeurs: { valeurNum?: number | null; valeurTexte?: string | null; unite?: string | null },
  motif: string,
  ctx: Contexte,
  quand = new Date().toISOString(),
): DecisionPlateau<{ ancienId: string; nouveauId: string }> {
  const ligne = get<LigneResultat>('SELECT * FROM resultat_examen WHERE id = ?', [resultatId]);
  if (!ligne) return introuvable();
  const demande = demandeParId(ligne.demande_id);
  if (!demande) return introuvable();

  const ancien = versResultat(ligne, demande.examen);
  const interpretation = rendreResultat({
    demande: { ...demande, etat: 'prelevee' },
    valeurNum: valeurs.valeurNum ?? null,
    valeurTexte: valeurs.valeurTexte ?? null,
    unite: valeurs.unite ?? null,
    seuils: seuils(ctx.organizationId),
    // Une correction n'est pas une nouvelle analyse : le delai de
    // stabilite a deja ete juge au premier rendu, et le rejouer ici
    // interdirait de corriger une faute de frappe le lendemain.
    stabilites: [],
    quand,
  });
  if (!interpretation.ok) return interpretation;

  const d = corriger(ancien, interpretation.resultat, motif);
  if (!d.ok) return d;

  const nouveauId = randomUUID();
  return tx(() => {
    insert('resultat_examen', {
      id: nouveauId,
      demande_id: ligne.demande_id,
      valeur_num: d.resultat.nouveau.valeurNum,
      valeur_texte: d.resultat.nouveau.valeurTexte,
      unite: d.resultat.nouveau.unite,
      interpretation: d.resultat.nouveau.interpretation,
      a_transmettre: d.resultat.nouveau.aTransmettre ? 1 : 0,
      rendu_par: ctx.acteurId,
      rendu_le: quand,
      motif_correction: d.resultat.motif,
    });
    // L'ancien n'est pas efface : il pointe vers celui qui le remplace.
    run('UPDATE resultat_examen SET remplace_par = ? WHERE id = ?', [nouveauId, resultatId]);
    audit({
      action: 'update',
      entity: 'resultat_examen',
      entityId: resultatId,
      patientId: demande.patientId,
      actorId: ctx.acteurId ?? undefined,
      detail: {
        correction: d.resultat.motif,
        avant: ancien.valeurNum ?? ancien.valeurTexte,
        apres: d.resultat.nouveau.valeurNum ?? d.resultat.nouveau.valeurTexte,
      },
    });
    return { ok: true as const, resultat: { ancienId: resultatId, nouveauId } };
  });
}

function introuvable() {
  return {
    ok: false as const,
    motif: 'DEMANDE_CLOSE' as const,
    message: 'Demande ou resultat introuvable.',
    remede: 'Verifier la reference portee sur l echantillon ou la demande.',
  };
}
