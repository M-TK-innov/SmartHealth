import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { all, get, insert, run, update, nowIso, audit } from '@/lib/db';
import { hashPassword, verifyPassword, type PasswordPolicy } from './password';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  ROLES,
  rattrapage,
  type Permission,
  type Role,
  type OrgType,
} from './roles';

// ------------------------------------------------------------------- types

export interface Organization {
  id: string;
  type: OrgType;
  name: string;
  code: string | null;
  parent_id: string | null;
  country: string | null;
  region: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: 'pending' | 'active' | 'suspended' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface UserAccount {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  password_algo: string;
  password_changed_at: string | null;
  full_name: string;
  phone: string | null;
  role: Role;
  organization_id: string | null;
  practitioner_id: string | null;
  license_number: string | null;
  status: 'pending' | 'active' | 'suspended' | 'rejected';
  must_change_password: number;
  failed_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  validated_by: string | null;
  validated_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Compte sans aucun secret : c'est la seule forme qui sort de ce module. */
export type SafeUser = Omit<UserAccount, 'password_hash' | 'password_salt' | 'password_algo'>;

export interface UserSession {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string | null;
  ip: string | null;
  user_agent: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
}

export interface AccessPolicy {
  id: number;
  password_min_length: number;
  password_require_mixed: number;
  session_hours: number;
  max_failed_attempts: number;
  lockout_minutes: number;
  allow_self_registration: number;
  require_admin_validation: number;
  updated_by: string | null;
  updated_at: string;
}

export function toSafeUser(u: UserAccount): SafeUser {
  const { password_hash: _h, password_salt: _s, password_algo: _a, ...safe } = u;
  return safe;
}

// ---------------------------------------------------------------- politique

const POLICY_DEFAULTS: Omit<AccessPolicy, 'updated_by' | 'updated_at'> = {
  id: 1,
  password_min_length: 10,
  password_require_mixed: 1,
  session_hours: 12,
  max_failed_attempts: 5,
  lockout_minutes: 15,
  allow_self_registration: 1,
  require_admin_validation: 1,
};

export function getPolicy(): AccessPolicy {
  const row = get<AccessPolicy>('SELECT * FROM access_policy WHERE id = 1');
  if (row) return row;
  insert('access_policy', { ...POLICY_DEFAULTS, updated_at: nowIso() });
  return get<AccessPolicy>('SELECT * FROM access_policy WHERE id = 1')!;
}

export function updatePolicy(patch: Partial<AccessPolicy>, actor?: SafeUser | null): AccessPolicy {
  getPolicy();
  const editable: (keyof AccessPolicy)[] = [
    'password_min_length',
    'password_require_mixed',
    'session_hours',
    'max_failed_attempts',
    'lockout_minutes',
    'allow_self_registration',
    'require_admin_validation',
  ];
  const data: Record<string, unknown> = { updated_at: nowIso(), updated_by: actor?.id ?? null };
  for (const k of editable) if (patch[k] !== undefined) data[k] = patch[k];
  run(
    `UPDATE access_policy SET ${Object.keys(data)
      .map((k) => `${k} = ?`)
      .join(', ')} WHERE id = 1`,
    Object.values(data),
  );
  audit({
    action: 'update',
    entity: 'access_policy',
    entityId: '1',
    actorId: actor?.id,
    actorLabel: actor?.full_name,
    detail: patch,
  });
  return getPolicy();
}

export function passwordPolicy(): PasswordPolicy {
  const p = getPolicy();
  return { minLength: p.password_min_length, requireMixed: p.password_require_mixed === 1 };
}

// ------------------------------------------------------------- permissions

/**
 * Amorce la matrice role -> permissions, et rattrape celles qui sont
 * apparues depuis l'installation.
 *
 * La DECISION vit dans rattrapage(), qui est pur et teste. Ici on se contente
 * de lire l'etat, de la lui soumettre, et d'ecrire ce qu'elle accorde.
 */
export function ensureRolePermissions() {
  const n = get<{ n: number }>('SELECT COUNT(*) n FROM role_permission')?.n ?? 0;

  const plan = rattrapage({
    dejaAmorcees: all<{ permission: string }>('SELECT permission FROM permission_amorcee').map(
      (r) => r.permission,
    ),
    presentesEnBase: all<{ permission: string }>(
      'SELECT DISTINCT permission FROM role_permission',
    ).map((r) => r.permission),
  });

  for (const { role, permission } of plan.aAccorder) {
    run('INSERT OR IGNORE INTO role_permission (role, permission) VALUES (?, ?)', [role, permission]);
  }
  for (const p of plan.aMarquer) {
    run('INSERT OR IGNORE INTO permission_amorcee (permission) VALUES (?)', [p]);
  }

  // Un rattrapage sur une base deja installee modifie des droits : il se
  // journalise, sinon personne ne saura d'ou vient le changement.
  if (n > 0 && plan.aAccorder.length > 0) {
    audit({
      action: 'update',
      entity: 'role_permission',
      entityId: 'rattrapage',
      detail: { accordees: plan.aAccorder },
    });
  }
}

export function rolePermissions(role: Role): Permission[] {
  ensureRolePermissions();
  return all<{ permission: string }>('SELECT permission FROM role_permission WHERE role = ?', [role])
    .map((r) => r.permission as Permission)
    .filter((p) => ALL_PERMISSIONS.includes(p));
}

export function setRolePermissions(role: Role, permissions: Permission[], actor?: SafeUser | null) {
  const clean = permissions.filter((p) => ALL_PERMISSIONS.includes(p));
  run('DELETE FROM role_permission WHERE role = ?', [role]);
  for (const p of clean) {
    run('INSERT OR IGNORE INTO role_permission (role, permission) VALUES (?, ?)', [role, p]);
  }
  audit({
    action: 'update',
    entity: 'role_permission',
    entityId: role,
    actorId: actor?.id,
    actorLabel: actor?.full_name,
    detail: { role, permissions: clean },
  });
}

export interface UserPermissionOverride {
  permission: Permission;
  granted: number;
  reason: string | null;
  granted_at: string;
}

export function userOverrides(userId: string): UserPermissionOverride[] {
  return all<UserPermissionOverride>(
    'SELECT permission, granted, reason, granted_at FROM user_permission WHERE user_id = ?',
    [userId],
  );
}

export function setUserOverride(
  userId: string,
  permission: Permission,
  granted: boolean | null,
  actor?: SafeUser | null,
  reason?: string,
) {
  if (granted === null) {
    run('DELETE FROM user_permission WHERE user_id = ? AND permission = ?', [userId, permission]);
  } else {
    run('DELETE FROM user_permission WHERE user_id = ? AND permission = ?', [userId, permission]);
    insert('user_permission', {
      id: randomUUID(),
      user_id: userId,
      permission,
      granted: granted ? 1 : 0,
      granted_by: actor?.id ?? null,
      granted_at: nowIso(),
      reason: reason ?? null,
    });
  }
  audit({
    action: 'update',
    entity: 'user_permission',
    entityId: userId,
    actorId: actor?.id,
    actorLabel: actor?.full_name,
    detail: { permission, granted, reason: reason ?? null },
  });
}

/** Permissions effectives : matrice du role, puis derogations individuelles. */
export function effectivePermissions(user: Pick<SafeUser, 'id' | 'role' | 'status'>): Set<Permission> {
  if (user.status !== 'active') return new Set();
  const result = new Set<Permission>(rolePermissions(user.role));
  for (const o of userOverrides(user.id)) {
    if (!ALL_PERMISSIONS.includes(o.permission)) continue;
    if (o.granted === 1) result.add(o.permission);
    else result.delete(o.permission);
  }
  return result;
}

// ------------------------------------------------------------ organisations

export const getOrganization = (id: string) =>
  get<Organization>('SELECT * FROM organization WHERE id = ?', [id]);

export const listOrganizations = (status?: string) =>
  status
    ? all<Organization>('SELECT * FROM organization WHERE status = ? ORDER BY name', [status])
    : all<Organization>('SELECT * FROM organization ORDER BY type, name');

export function createOrganization(data: Partial<Organization>, actor?: SafeUser | null): string {
  const id = data.id ?? randomUUID();
  insert('organization', {
    id,
    type: data.type ?? 'health-center',
    name: data.name,
    code: data.code ?? null,
    parent_id: data.parent_id ?? null,
    country: data.country ?? process.env.FACILITY_COUNTRY ?? 'BJ',
    region: data.region ?? null,
    address: data.address ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    status: data.status ?? 'pending',
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  audit({
    action: 'create',
    entity: 'organization',
    entityId: id,
    actorId: actor?.id,
    actorLabel: actor?.full_name,
    detail: { name: data.name, type: data.type },
  });
  return id;
}

export function updateOrganization(id: string, patch: Partial<Organization>, actor?: SafeUser | null) {
  const editable: (keyof Organization)[] = [
    'name',
    'code',
    'type',
    'parent_id',
    'country',
    'region',
    'address',
    'phone',
    'email',
    'status',
  ];
  const data: Record<string, unknown> = { updated_at: nowIso() };
  for (const k of editable) if (patch[k] !== undefined) data[k] = patch[k];
  update('organization', id, data);
  audit({
    action: 'update',
    entity: 'organization',
    entityId: id,
    actorId: actor?.id,
    actorLabel: actor?.full_name,
    detail: Object.keys(data).join(', '),
  });
}

// -------------------------------------------------------------------- users

export const getUserById = (id: string) => get<UserAccount>('SELECT * FROM user_account WHERE id = ?', [id]);

export const getUserByEmail = (email: string) =>
  get<UserAccount>('SELECT * FROM user_account WHERE lower(email) = lower(?)', [email.trim()]);

export function listUsers(filter: { status?: string; organizationId?: string; role?: string } = {}): SafeUser[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    where.push('status = ?');
    params.push(filter.status);
  }
  if (filter.organizationId) {
    where.push('organization_id = ?');
    params.push(filter.organizationId);
  }
  if (filter.role) {
    where.push('role = ?');
    params.push(filter.role);
  }
  const sql = `SELECT * FROM user_account ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 500`;
  return all<UserAccount>(sql, params).map(toSafeUser);
}

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  organizationId?: string | null;
  phone?: string | null;
  licenseNumber?: string | null;
  status?: UserAccount['status'];
  mustChangePassword?: boolean;
  practitionerId?: string | null;
}

export function createUser(input: CreateUserInput, actor?: SafeUser | null): SafeUser {
  const email = input.email.trim().toLowerCase();
  if (getUserByEmail(email)) throw new Error('Un compte existe deja avec cette adresse e-mail.');

  const { hash, salt, algo } = hashPassword(input.password);
  const id = randomUUID();
  insert('user_account', {
    id,
    email,
    password_hash: hash,
    password_salt: salt,
    password_algo: algo,
    password_changed_at: nowIso(),
    full_name: input.fullName.trim(),
    phone: input.phone ?? null,
    role: input.role,
    organization_id: input.organizationId ?? null,
    practitioner_id: input.practitionerId ?? null,
    license_number: input.licenseNumber ?? null,
    status: input.status ?? 'pending',
    must_change_password: input.mustChangePassword ? 1 : 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  });

  audit({
    action: 'create',
    entity: 'user_account',
    entityId: id,
    actorId: actor?.id,
    actorLabel: actor?.full_name,
    detail: { email, role: input.role, status: input.status ?? 'pending' },
  });
  return toSafeUser(getUserById(id)!);
}

export function setUserStatus(
  userId: string,
  status: UserAccount['status'],
  actor?: SafeUser | null,
  reason?: string,
) {
  update('user_account', userId, {
    status,
    validated_by: actor?.id ?? null,
    validated_at: nowIso(),
    rejection_reason: status === 'rejected' ? (reason ?? null) : null,
    // une suspension ou un refus doit couper l'acces immediatement
    updated_at: nowIso(),
  });
  if (status !== 'active') revokeUserSessions(userId, `statut du compte : ${status}`);

  audit({
    action: 'validate',
    entity: 'user_account',
    entityId: userId,
    actorId: actor?.id,
    actorLabel: actor?.full_name,
    detail: { status, reason: reason ?? null },
  });
}

export function updateUser(userId: string, patch: Partial<UserAccount>, actor?: SafeUser | null) {
  const editable: (keyof UserAccount)[] = [
    'full_name',
    'phone',
    'role',
    'organization_id',
    'license_number',
    'practitioner_id',
  ];
  const data: Record<string, unknown> = { updated_at: nowIso() };
  for (const k of editable) if (patch[k] !== undefined) data[k] = patch[k];
  update('user_account', userId, data);
  audit({
    action: 'update',
    entity: 'user_account',
    entityId: userId,
    actorId: actor?.id,
    actorLabel: actor?.full_name,
    detail: Object.keys(data).join(', '),
  });
}

export function changePassword(userId: string, newPassword: string, actor?: SafeUser | null) {
  const { hash, salt, algo } = hashPassword(newPassword);
  update('user_account', userId, {
    password_hash: hash,
    password_salt: salt,
    password_algo: algo,
    password_changed_at: nowIso(),
    must_change_password: 0,
    failed_attempts: 0,
    locked_until: null,
    updated_at: nowIso(),
  });
  audit({
    action: 'update',
    entity: 'user_account',
    entityId: userId,
    actorId: actor?.id ?? userId,
    actorLabel: actor?.full_name,
    detail: 'changement de mot de passe',
  });
}

// ----------------------------------------------------------------- sessions

const SESSION_BYTES = 32;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface AuthenticateResult {
  ok: boolean;
  user?: SafeUser;
  token?: string;
  error?: string;
}

/**
 * Authentification.
 *
 * Les messages d'erreur restent volontairement identiques qu'il s'agisse d'une
 * adresse inconnue ou d'un mot de passe faux : distinguer les deux permettrait
 * d'enumerer les comptes existants. Le verrouillage temporaire, lui, est
 * annonce, car l'utilisateur legitime doit comprendre pourquoi il est bloque.
 */
export function authenticate(
  email: string,
  password: string,
  context: { ip?: string; userAgent?: string } = {},
): AuthenticateResult {
  const policy = getPolicy();
  const generic = 'Adresse e-mail ou mot de passe incorrect.';
  const user = getUserByEmail(email);

  if (!user) {
    // cout constant : on hache quand meme, pour ne pas fuiter l'existence du compte
    hashPassword(password);
    return { ok: false, error: generic };
  }

  if (user.locked_until && new Date(user.locked_until.replace(' ', 'T') + 'Z') > new Date()) {
    return { ok: false, error: `Compte temporairement verrouille jusqu'a ${user.locked_until} (UTC).` };
  }

  const valid = verifyPassword(password, {
    hash: user.password_hash,
    salt: user.password_salt,
    algo: user.password_algo,
  });

  if (!valid) {
    const attempts = user.failed_attempts + 1;
    const shouldLock = attempts >= policy.max_failed_attempts;
    update('user_account', user.id, {
      failed_attempts: attempts,
      locked_until: shouldLock
        ? new Date(Date.now() + policy.lockout_minutes * 60000).toISOString().replace('T', ' ').slice(0, 19)
        : null,
      updated_at: nowIso(),
    });
    audit({
      action: 'read',
      entity: 'authentification',
      entityId: user.id,
      detail: { resultat: 'echec', tentatives: attempts, verrouille: shouldLock, ip: context.ip ?? null },
    });
    return {
      ok: false,
      error: shouldLock
        ? `Trop de tentatives. Compte verrouille ${policy.lockout_minutes} minutes.`
        : generic,
    };
  }

  if (user.status !== 'active') {
    const messages: Record<string, string> = {
      pending: "Votre compte est en attente de validation par un administrateur.",
      suspended: 'Votre compte est suspendu. Contactez votre administrateur.',
      rejected: `Votre demande a ete refusee.${user.rejection_reason ? ` Motif : ${user.rejection_reason}` : ''}`,
    };
    return { ok: false, error: messages[user.status] ?? 'Compte inactif.' };
  }

  const token = randomBytes(SESSION_BYTES).toString('base64url');
  const expires = new Date(Date.now() + policy.session_hours * 3600_000);
  insert('user_session', {
    id: randomUUID(),
    user_id: user.id,
    token_hash: hashToken(token),
    created_at: nowIso(),
    expires_at: expires.toISOString().replace('T', ' ').slice(0, 19),
    last_seen_at: nowIso(),
    ip: context.ip ?? null,
    user_agent: context.userAgent?.slice(0, 300) ?? null,
  });

  update('user_account', user.id, {
    failed_attempts: 0,
    locked_until: null,
    last_login_at: nowIso(),
    updated_at: nowIso(),
  });

  audit({
    action: 'read',
    entity: 'authentification',
    entityId: user.id,
    actorId: user.id,
    actorLabel: user.full_name,
    detail: { resultat: 'succes', ip: context.ip ?? null },
  });

  return { ok: true, user: toSafeUser(getUserById(user.id)!), token };
}

export function resolveSession(token: string): { user: SafeUser; session: UserSession } | null {
  if (!token) return null;
  const session = get<UserSession>('SELECT * FROM user_session WHERE token_hash = ?', [hashToken(token)]);
  if (!session || session.revoked_at) return null;
  if (new Date(session.expires_at.replace(' ', 'T') + 'Z') <= new Date()) return null;

  const user = getUserById(session.user_id);
  if (!user || user.status !== 'active') return null;

  update('user_session', session.id, { last_seen_at: nowIso() });
  return { user: toSafeUser(user), session };
}

export function revokeSessionByToken(token: string, reason = 'deconnexion') {
  const session = get<UserSession>('SELECT * FROM user_session WHERE token_hash = ?', [hashToken(token)]);
  if (!session || session.revoked_at) return;
  update('user_session', session.id, { revoked_at: nowIso(), revoked_reason: reason });
  audit({ action: 'update', entity: 'user_session', entityId: session.id, actorId: session.user_id, detail: reason });
}

export function revokeSessionById(sessionId: string, actor?: SafeUser | null, reason = 'revoquee par un administrateur') {
  update('user_session', sessionId, { revoked_at: nowIso(), revoked_reason: reason });
  audit({
    action: 'update',
    entity: 'user_session',
    entityId: sessionId,
    actorId: actor?.id,
    actorLabel: actor?.full_name,
    detail: reason,
  });
}

export function revokeUserSessions(userId: string, reason: string) {
  run('UPDATE user_session SET revoked_at = ?, revoked_reason = ? WHERE user_id = ? AND revoked_at IS NULL', [
    nowIso(),
    reason,
    userId,
  ]);
}

export interface SessionRow extends UserSession {
  full_name: string;
  email: string;
  role: Role;
}

export function listActiveSessions(organizationId?: string): SessionRow[] {
  const sql = `SELECT s.*, u.full_name, u.email, u.role
     FROM user_session s JOIN user_account u ON u.id = s.user_id
     WHERE s.revoked_at IS NULL AND s.expires_at > ?
     ${organizationId ? 'AND u.organization_id = ?' : ''}
     ORDER BY s.last_seen_at DESC LIMIT 200`;
  const params: unknown[] = [nowIso()];
  if (organizationId) params.push(organizationId);
  return all<SessionRow>(sql, params);
}

/** Nettoyage des sessions expirees, appele a la connexion. */
export function purgeExpiredSessions() {
  run("DELETE FROM user_session WHERE expires_at < datetime('now', '-30 days')");
}
