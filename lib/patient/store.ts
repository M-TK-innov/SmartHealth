import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { all, audit, get, insert, nowIso, run, update } from '../db.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { getPolicy } from '../auth/store.ts';
import {
  ALPHABET_CODE,
  LONGUEUR_CODE,
  codeUtilisable,
  normaliser,
  normaliserCode,
  pinAcceptable,
  type TypeIdentifiant,
} from './identite.ts';

/**
 * Comptes patients : enrolement, activation, connexion.
 *
 * ETANCHEITE
 *
 * Rien ici ne touche user_account, user_session ni les permissions des
 * soignants. Un compte patient n'a pas de role, pas de droit, pas de portee :
 * il ouvre les dossiers qui lui sont RATTACHES, et rien d'autre. Le jour ou
 * quelqu'un voudra lui donner une permission, il faudra ecrire le code pour,
 * donc y penser.
 *
 * DEUX REGLES QUI NE SE NEGOCIENT PAS
 *
 * 1. Les messages d'echec ne disent JAMAIS si le compte existe. Un message
 *    qui distingue « compte inconnu » de « code faux » transforme l'ecran de
 *    connexion en annuaire : on y teste des numeros jusqu'a savoir qui est
 *    suivi dans l'etablissement.
 *
 * 2. Le verrouillage apres echecs est ce qui tient un code a six chiffres.
 *    Il reprend la politique de l'etablissement, la meme que pour les agents.
 */

const SESSION_BYTES = 32;

/** Duree de validite du code remis au guichet. */
export const HEURES_CODE = 48;

const ECHEC_GENERIQUE = 'Identifiant ou code incorrect.';

export interface ComptePatient {
  id: string;
  telephone: string | null;
  npi: string | null;
  statut: 'a-activer' | 'actif' | 'suspendu';
  failed_attempts: number;
  locked_until: string | null;
  pin_hash: string | null;
  pin_salt: string | null;
  pin_algo: string | null;
}

export interface DossierRattache {
  patient_id: string;
  organization_id: string | null;
  rattache_le: string;
}

export type Issue<T> = { ok: true; resultat: T } | { ok: false; motif: string };

// ------------------------------------------------------------- utilitaires

function hacher(valeur: string): string {
  return createHash('sha256').update(valeur).digest('hex');
}

function enSqlite(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function depuisSqlite(valeur: string): number {
  return new Date(valeur.replace(' ', 'T') + 'Z').getTime();
}

function verrouille(c: { locked_until: string | null }, instant: Date): boolean {
  if (!c.locked_until) return false;
  const fin = depuisSqlite(c.locked_until);
  return Number.isFinite(fin) && fin > instant.getTime();
}

function trouverCompte(type: TypeIdentifiant, valeur: string): ComptePatient | undefined {
  const colonne = type === 'telephone' ? 'telephone' : 'npi';
  return get<ComptePatient>(`SELECT * FROM patient_account WHERE ${colonne} = ?`, [valeur]);
}

/** Tire un code lisible a voix haute, dans l'alphabet sans caracteres jumeaux. */
function tirerCode(): string {
  const octets = randomBytes(LONGUEUR_CODE * 2);
  let code = '';
  for (let i = 0; code.length < LONGUEUR_CODE; i++) {
    // Rejet du reste pour ne pas biaiser l'alphabet vers ses premieres lettres.
    const v = octets[i % octets.length];
    if (v >= 256 - (256 % ALPHABET_CODE.length)) continue;
    code += ALPHABET_CODE[v % ALPHABET_CODE.length];
  }
  return code;
}

// -------------------------------------------------------------- enrolement

/**
 * Cree l'acces d'un patient et rend le code a lui remettre.
 *
 * Le code en clair n'est rendu QU'ICI, une seule fois. La base n'en garde que
 * l'empreinte : un code lisible en base serait un acces au dossier pour qui
 * lit la base.
 *
 * Si le compte existe deja — patient suivi ailleurs, ou code perdu — on ne le
 * duplique pas : on rattache le dossier et on emet un nouveau code. Deux
 * comptes pour une personne, c'est un dossier qu'elle ne verra jamais.
 */
export function enroler(args: {
  patientId: string;
  type: TypeIdentifiant;
  identifiant: string;
  organizationId: string | null;
  parUserId: string | null;
  instant?: Date;
}): Issue<{ code: string; expireLe: string; compteId: string; nouveau: boolean }> {
  const instant = args.instant ?? new Date();

  const r = normaliser(args.type, args.identifiant);
  if (!r.ok) return { ok: false, motif: r.motif };

  const patient = get<{ id: string }>('SELECT id FROM patient WHERE id = ?', [args.patientId]);
  if (!patient) return { ok: false, motif: "Ce dossier patient n'existe pas." };

  let compte = trouverCompte(r.type, r.valeur);
  const nouveau = !compte;

  if (!compte) {
    const id = randomUUID();
    insert('patient_account', {
      id,
      telephone: r.type === 'telephone' ? r.valeur : null,
      npi: r.type === 'npi' ? r.valeur : null,
      statut: 'a-activer',
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    compte = get<ComptePatient>('SELECT * FROM patient_account WHERE id = ?', [id])!;
  }

  // Rattachement : idempotent, la cle primaire est (compte, dossier).
  const deja = get(
    'SELECT 1 AS x FROM patient_dossier WHERE account_id = ? AND patient_id = ?',
    [compte.id, args.patientId],
  );
  if (!deja) {
    run(
      'INSERT INTO patient_dossier (account_id, patient_id, organization_id, rattache_le, rattache_par) VALUES (?, ?, ?, ?, ?)',
      [compte.id, args.patientId, args.organizationId, nowIso(), args.parUserId],
    );
  }

  // Les codes encore vivants de ce compte sont retires : un seul code valide
  // a la fois, sinon un code remis par erreur reste utilisable des semaines.
  run("UPDATE patient_enrolement SET consomme_le = ? WHERE account_id = ? AND consomme_le IS NULL", [
    nowIso(),
    compte.id,
  ]);

  const code = tirerCode();
  const expireLe = enSqlite(new Date(instant.getTime() + HEURES_CODE * 3600_000));
  insert('patient_enrolement', {
    id: randomUUID(),
    account_id: compte.id,
    code_hash: hacher(code),
    expire_le: expireLe,
    cree_par: args.parUserId,
    cree_le: nowIso(),
  });

  audit({
    action: 'create',
    entity: 'patient_account',
    entityId: compte.id,
    actorId: args.parUserId ?? undefined,
    detail: { dossier: args.patientId, nouveau, type: r.type },
  });

  return { ok: true, resultat: { code, expireLe, compteId: compte.id, nouveau } };
}

/**
 * Active un compte : le patient presente son code et choisit son secret.
 *
 * Le code est consomme dans la meme operation que la pose du secret. Le faire
 * en deux temps laisserait une fenetre ou le code vaut encore alors que le
 * compte est deja ouvert.
 */
export function activer(args: {
  type: TypeIdentifiant;
  identifiant: string;
  code: string;
  pin: string;
  instant?: Date;
}): Issue<{ compteId: string }> {
  const instant = args.instant ?? new Date();

  const r = normaliser(args.type, args.identifiant);
  if (!r.ok) return { ok: false, motif: r.motif };

  // Le secret est juge AVANT de consommer le code : un code brule par un PIN
  // refuse obligerait a retourner au guichet.
  const v = pinAcceptable(args.pin);
  if (!v.ok) return { ok: false, motif: v.motif };

  const compte = trouverCompte(r.type, r.valeur);
  if (!compte) return { ok: false, motif: ECHEC_GENERIQUE };
  if (compte.statut === 'suspendu') return { ok: false, motif: ECHEC_GENERIQUE };

  const saisi = normaliserCode(args.code);
  const enrol = get<{ id: string; expire_le: string; consomme_le: string | null }>(
    'SELECT id, expire_le, consomme_le FROM patient_enrolement WHERE account_id = ? AND code_hash = ?',
    [compte.id, hacher(saisi)],
  );
  if (!enrol) return { ok: false, motif: ECHEC_GENERIQUE };
  if (!codeUtilisable({ expireLe: enrol.expire_le, consommeLe: enrol.consomme_le }, instant)) {
    return {
      ok: false,
      motif: "Ce code n'est plus valable. Demandez-en un nouveau a l'accueil de votre centre.",
    };
  }

  const h = hashPassword(args.pin);
  update('patient_account', compte.id, {
    pin_hash: h.hash,
    pin_salt: h.salt,
    pin_algo: h.algo,
    pin_changed_at: nowIso(),
    statut: 'actif',
    failed_attempts: 0,
    locked_until: null,
    updated_at: nowIso(),
  });
  run('UPDATE patient_enrolement SET consomme_le = ? WHERE id = ?', [nowIso(), enrol.id]);

  audit({ action: 'update', entity: 'patient_account', entityId: compte.id, detail: { activation: true } });

  return { ok: true, resultat: { compteId: compte.id } };
}

// -------------------------------------------------------------- connexion

export function connecter(args: {
  type: TypeIdentifiant;
  identifiant: string;
  pin: string;
  contexte?: { ip?: string | null; userAgent?: string | null };
  instant?: Date;
}): Issue<{ token: string; compteId: string }> {
  const instant = args.instant ?? new Date();
  const politique = getPolicy();

  const r = normaliser(args.type, args.identifiant);
  if (!r.ok) return { ok: false, motif: ECHEC_GENERIQUE };

  const compte = trouverCompte(r.type, r.valeur);

  // Compte absent : on repond comme pour un code faux. Verifier quand meme
  // un hachage factice couterait du temps ; ici l'interet est ailleurs, et
  // la difference de duree n'apprend rien d'exploitable sur un dossier.
  if (!compte || compte.statut !== 'actif' || !compte.pin_hash) {
    return { ok: false, motif: ECHEC_GENERIQUE };
  }

  if (verrouille(compte, instant)) {
    return {
      ok: false,
      motif: `Trop de tentatives. Reessayez dans ${politique.lockout_minutes} minutes, ou passez a l'accueil.`,
    };
  }

  const bon = verifyPassword(args.pin, {
    hash: compte.pin_hash,
    salt: compte.pin_salt ?? '',
    algo: compte.pin_algo ?? 'scrypt',
  });

  if (!bon) {
    const essais = compte.failed_attempts + 1;
    const verrouiller = essais >= politique.max_failed_attempts;
    update('patient_account', compte.id, {
      failed_attempts: verrouiller ? 0 : essais,
      locked_until: verrouiller
        ? enSqlite(new Date(instant.getTime() + politique.lockout_minutes * 60_000))
        : null,
      updated_at: nowIso(),
    });
    audit({
      action: 'read',
      entity: 'patient_session',
      entityId: compte.id,
      detail: { resultat: 'echec', verrouille: verrouiller },
    });
    return {
      ok: false,
      motif: verrouiller
        ? `Trop de tentatives. Compte bloque ${politique.lockout_minutes} minutes.`
        : ECHEC_GENERIQUE,
    };
  }

  const token = randomBytes(SESSION_BYTES).toString('base64url');
  insert('patient_session', {
    id: randomUUID(),
    account_id: compte.id,
    token_hash: hacher(token),
    created_at: nowIso(),
    expires_at: enSqlite(new Date(instant.getTime() + politique.session_hours * 3600_000)),
    last_seen_at: nowIso(),
    ip: args.contexte?.ip ?? null,
    user_agent: args.contexte?.userAgent?.slice(0, 300) ?? null,
  });

  update('patient_account', compte.id, {
    failed_attempts: 0,
    locked_until: null,
    last_login_at: nowIso(),
    updated_at: nowIso(),
  });

  audit({ action: 'read', entity: 'patient_session', entityId: compte.id, detail: { resultat: 'succes' } });

  return { ok: true, resultat: { token, compteId: compte.id } };
}

export interface SessionPatient {
  /** Identifiant de la LIGNE de session, pour y marquer ce qui ne doit arriver qu'une fois. */
  sessionId: string;
  compte: ComptePatient;
  dossiers: DossierRattache[];
}

/** Resout une session patient. Rend `null` des que quoi que ce soit cloche. */
export function resoudreSessionPatient(token: string, instant: Date = new Date()): SessionPatient | null {
  if (!token) return null;

  const s = get<{ id: string; account_id: string; expires_at: string; revoked_at: string | null }>(
    'SELECT id, account_id, expires_at, revoked_at FROM patient_session WHERE token_hash = ?',
    [hacher(token)],
  );
  if (!s || s.revoked_at) return null;
  if (depuisSqlite(s.expires_at) <= instant.getTime()) return null;

  const compte = get<ComptePatient>('SELECT * FROM patient_account WHERE id = ?', [s.account_id]);
  if (!compte || compte.statut !== 'actif') return null;

  run('UPDATE patient_session SET last_seen_at = ? WHERE id = ?', [nowIso(), s.id]);

  return {
    sessionId: s.id,
    compte,
    dossiers: all<DossierRattache>(
      'SELECT patient_id, organization_id, rattache_le FROM patient_dossier WHERE account_id = ?',
      [compte.id],
    ),
  };
}

export function revoquerSessionPatient(token: string, motif = 'deconnexion'): void {
  const s = get<{ id: string }>('SELECT id FROM patient_session WHERE token_hash = ? AND revoked_at IS NULL', [
    hacher(token),
  ]);
  if (!s) return;
  run('UPDATE patient_session SET revoked_at = ?, revoked_reason = ? WHERE id = ?', [nowIso(), motif, s.id]);
}

/**
 * Le dossier demande appartient-il bien a ce compte ?
 *
 * A appeler avant TOUTE lecture. Sans ce controle, changer un identifiant
 * dans l'adresse suffirait a lire le dossier d'un autre — c'est la faille la
 * plus banale de ce genre d'espace, et la plus grave ici.
 */
export function dossierAutorise(session: SessionPatient, patientId: string): boolean {
  return session.dossiers.some((d) => d.patient_id === patientId);
}
