/**
 * Persistance du flux et des files d'attente.
 *
 * Meme partage qu'ailleurs : les REGLES vivent dans flux.ts, qui est pur. Ici
 * on lit l'etat, on soumet aux regles, et on ecrit ce qu'elles ont accorde.
 *
 * La base porte l'invariant « un patient n'attend qu'a un seul endroit » par
 * un index unique partiel sur les passages ouverts. Le code le verifie aussi,
 * pour rendre un refus lisible plutot qu'une erreur SQL — mais c'est l'index
 * qui tient sous concurrence.
 */

import { randomUUID } from 'node:crypto';
import { all, audit, get, insert, run, tx } from '../db.ts';
import { dansLeJour, jourCivil, jourPrecedent, jourSuivant, versIso, versIsoRequis } from '../temps.ts';
import {
  appeler,
  marquerParti,
  ordonner,
  placer,
  prochain,
  terminer,
  tension,
  type DecisionFlux,
  type Gravite,
  type Passage,
  type PassageClasse,
  type TensionPoste,
} from './flux.ts';

interface LignePassage {
  id: string;
  sejour_id: string;
  poste_id: string;
  gravite: Gravite;
  etat: Passage['etat'];
  arrive_le: string;
  pris_en_charge_le: string | null;
  termine_le: string | null;
}

const versPassage = (p: LignePassage): Passage => ({
  id: p.id,
  sejourId: p.sejour_id,
  posteId: p.poste_id,
  gravite: p.gravite,
  etat: p.etat,
  arriveLe: versIsoRequis(p.arrive_le),
  prisEnChargeLe: versIso(p.pris_en_charge_le),
  termineLe: versIso(p.termine_le),
});

export interface Poste {
  id: string;
  code: string;
  nom: string;
  categorie: string;
}

// ------------------------------------------------------------------ lecture

export function postes(organizationId: string | null): Poste[] {
  return all<Poste>(
    `SELECT id, code, nom, categorie FROM poste
      WHERE actif = 1 AND (? IS NULL OR organization_id = ? OR organization_id IS NULL)
      ORDER BY categorie, nom`,
    [organizationId, organizationId],
  );
}

export function passageParId(id: string): Passage | null {
  const p = get<LignePassage>('SELECT * FROM passage WHERE id = ?', [id]);
  return p ? versPassage(p) : null;
}

/**
 * Les passages d'un poste sur une journee civile.
 *
 * La requete ratisse LARGE — la veille et le lendemain — puis le tri fin
 * se fait en memoire. Deux raisons, et aucune n'est du confort :
 *
 *   - la journee de l'etablissement n'est pas la journee UTC. Borner la
 *     requete sur minuit UTC ferait commencer la journee a une heure du
 *     matin a Cotonou, et a dix-neuf heures la veille a Lima ;
 *   - la colonne porte selon l'ecrivain de l'ISO ou la forme SQLite, qui
 *     ne se comparent pas comme des chaines. Des bornes en dates nues
 *     attrapent les deux, et l'index reste utilise.
 *
 * Le volume est celui d'un poste sur trois jours : le tri en memoire ne
 * coute rien, et il est le seul a connaitre le fuseau.
 */
export function passagesDuPoste(posteId: string, jour: string, fuseau?: string): Passage[] {
  return all<LignePassage>(
    'SELECT * FROM passage WHERE poste_id = ? AND arrive_le >= ? AND arrive_le < ? ORDER BY arrive_le',
    [posteId, jourPrecedent(jour), jourSuivant(jourSuivant(jour))],
  )
    .map(versPassage)
    .filter((p) => dansLeJour(p.arriveLe, jour, fuseau));
}

/** Passages encore ouverts pour un sejour, tous postes confondus. */
export function passagesOuvertsDuSejour(sejourId: string): Passage[] {
  return all<LignePassage>(
    "SELECT * FROM passage WHERE sejour_id = ? AND etat IN ('en-attente', 'en-cours')",
    [sejourId],
  ).map(versPassage);
}

/** La file ordonnee d'un poste : qui passe ensuite, et pourquoi. */
export function fileDuPoste(posteId: string, maintenant = new Date().toISOString()): PassageClasse[] {
  return ordonner(passagesDuPoste(posteId, jourCivil(maintenant)), maintenant);
}

export function prochainDuPoste(posteId: string, maintenant = new Date().toISOString()): PassageClasse | null {
  return prochain(passagesDuPoste(posteId, jourCivil(maintenant)), maintenant);
}

export interface TensionAffichee extends TensionPoste {
  code: string;
  nom: string;
  categorie: string;
}

/**
 * Tension de chaque poste — la vue de la direction, et la seule qui dise si
 * l'etablissement tient le choc a l'instant ou on la regarde.
 */
export function tableauTension(
  organizationId: string | null,
  maintenant = new Date().toISOString(),
): TensionAffichee[] {
  const jour = jourCivil(maintenant);
  return postes(organizationId).map((p) => ({
    ...tension(p.id, passagesDuPoste(p.id, jour), maintenant),
    code: p.code,
    nom: p.nom,
    categorie: p.categorie,
  }));
}

// ------------------------------------------------------------------ ecriture

export interface Contexte {
  acteurId: string | null;
  organizationId: string | null;
}

function tracer(passage: Passage, action: 'create' | 'update', detail: Record<string, unknown>, ctx: Contexte) {
  audit({
    action,
    entity: 'passage',
    entityId: passage.id,
    actorId: ctx.acteurId ?? undefined,
    detail: { poste: passage.posteId, sejour: passage.sejourId, ...detail },
  });
}

/** Place un patient dans la file d'un poste. */
export function placerDansFile(
  sejourId: string,
  posteId: string,
  gravite: Gravite,
  ctx: Contexte,
  quand = new Date().toISOString(),
): DecisionFlux<Passage> {
  const sejour = get<{ statut: string }>('SELECT statut FROM sejour WHERE id = ?', [sejourId]);

  const d = placer({
    sejourId,
    posteId,
    gravite,
    sejourPresent: sejour?.statut === 'en-cours',
    passagesOuverts: passagesOuvertsDuSejour(sejourId),
    quand,
  });
  if (!d.ok) return d;

  const id = randomUUID();
  return tx(() => {
    insert('passage', {
      id,
      sejour_id: sejourId,
      poste_id: posteId,
      gravite,
      etat: 'en-attente',
      arrive_le: quand,
      pris_en_charge_le: null,
      termine_le: null,
      acteur_id: ctx.acteurId,
    });
    const resultat = { ...d.resultat, id };
    tracer(resultat, 'create', { gravite }, ctx);
    return { ok: true as const, resultat };
  });
}

function transition(
  passageId: string,
  regle: (p: Passage, quand: string) => DecisionFlux<Passage>,
  colonnes: (p: Passage) => Record<string, unknown>,
  mot: string,
  ctx: Contexte,
  quand: string,
): DecisionFlux<Passage> {
  const p = passageParId(passageId);
  if (!p) {
    return {
      ok: false,
      motif: 'PASSAGE_CLOS',
      message: 'Passage introuvable.',
      remede: 'Verifier la reference, ou replacer le patient dans la file.',
    };
  }

  const d = regle(p, quand);
  if (!d.ok) return d;

  return tx(() => {
    const champs = colonnes(d.resultat);
    const set = Object.keys(champs)
      .map((c) => `${c} = ?`)
      .join(', ');
    run(`UPDATE passage SET ${set} WHERE id = ?`, [...Object.values(champs), passageId]);
    tracer(d.resultat, 'update', { transition: mot }, ctx);
    return d;
  });
}

/** Appelle un patient : il quitte la file et passe en prise en charge. */
export function appelerPatient(passageId: string, ctx: Contexte, quand = new Date().toISOString()) {
  return transition(
    passageId,
    appeler,
    (p) => ({ etat: p.etat, pris_en_charge_le: p.prisEnChargeLe, acteur_id: ctx.acteurId }),
    'appel',
    ctx,
    quand,
  );
}

/** Termine un passage : le patient peut etre oriente ailleurs. */
export function terminerPassage(passageId: string, ctx: Contexte, quand = new Date().toISOString()) {
  return transition(
    passageId,
    terminer,
    (p) => ({ etat: p.etat, termine_le: p.termineLe }),
    'fin',
    ctx,
    quand,
  );
}

/** Marque un patient parti sans avoir ete vu. */
export function marquerPatientParti(passageId: string, ctx: Contexte, quand = new Date().toISOString()) {
  return transition(
    passageId,
    marquerParti,
    (p) => ({ etat: p.etat, termine_le: p.termineLe }),
    'parti-sans-etre-vu',
    ctx,
    quand,
  );
}
