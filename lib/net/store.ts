import { randomUUID } from 'node:crypto';
import { all, audit, databasePath, get, insert, nowIso, run, update } from '@/lib/db';
import { currentPort } from '@/lib/auth/network';
import {
  evaluate,
  type AuthMode,
  type DataClass,
  type Derogation,
  type Endpoint,
  type EndpointCategory,
  type Evaluation,
  type FhirAccess,
  type Finding,
  type NetworkConfig,
  type Scope,
} from '@/lib/compliance/rules';

/**
 * Adresses de connexion, serveurs declares et derogations.
 *
 * Deux principes tiennent ce module :
 *
 *   1. Les ADRESSES sont une donnee d'exploitation : elles changent quand la
 *      structure change de reseau, et se modifient depuis la console.
 *      Les SECRETS restent dans l'environnement du serveur ; la base n'en
 *      retient que le nom de la variable. Un secret modifiable en ligne est un
 *      secret expose.
 *
 *   2. Rien n'est ecrit sans avoir ete evalue. La verification n'est pas un
 *      affichage a posteriori : `saveConfig` et `saveEndpoint` refusent une
 *      configuration bloquante. Un controle qu'on peut enregistrer puis
 *      ignorer n'est pas un controle.
 */

export interface NetworkConfigRow extends NetworkConfig {
  id: number;
  updated_by: string | null;
  updated_at: string;
}

export interface EndpointRow extends Endpoint {
  note: string | null;
  last_test_at: string | null;
  last_test_status: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface DerogationRow extends Derogation {
  id: string;
  granted_by: string | null;
}

export class ComplianceError extends Error {
  constructor(
    message: string,
    readonly evaluation: Evaluation,
  ) {
    super(message);
  }
}

// -------------------------------------------------------------- lecture

/**
 * Configuration courante, creee au premier appel.
 *
 * Les valeurs initiales decrivent l'installation telle qu'elle tourne : le
 * chemin reel de la base, le port reellement ecoute. Une configuration
 * pre-remplie avec des valeurs plausibles mais fausses ferait valider par
 * l'exploitant une description qui n'est pas la sienne.
 *
 * L'acces a l'API FHIR demarre sur « session authentifiee », et les transferts
 * externes sur « interdits ». Une installation neuve part fermee : c'est
 * l'ouverture qui doit etre un acte explicite, pas la fermeture.
 */
export function networkConfig(): NetworkConfigRow {
  const row = get<NetworkConfigRow>('SELECT * FROM network_config WHERE id = 1');
  if (row) return row;

  insert('network_config', {
    id: 1,
    app_public_url: null,
    app_bind_host: '127.0.0.1',
    app_port: currentPort(),
    app_https: 0,
    allowed_origins: '',
    fhir_access: 'session',
    db_path: databasePath(),
    db_backup_dir: null,
    db_encrypted: 0,
    data_residency_country: (process.env.FACILITY_COUNTRY || 'BJ').toUpperCase(),
    allow_external_transfer: 0,
    updated_at: nowIso(),
  });
  seedEndpointsFromEnvironment();
  return get<NetworkConfigRow>('SELECT * FROM network_config WHERE id = 1')!;
}

/**
 * Reprend les destinations deja declarees dans l'environnement.
 *
 * Une installation existante a ses adresses dans .env.local. Les ignorer
 * obligerait a les ressaisir, et surtout laisserait croire qu'aucun flux ne
 * sort alors que l'ancien chemin fonctionne toujours. On les importe donc, en
 * les declarant au niveau de risque le plus eleve : c'est a l'exploitant de
 * requalifier a la baisse, jamais au logiciel de supposer qu'un flux est
 * anodin.
 */
function seedEndpointsFromEnvironment() {
  const declared = (v?: string) => (v && v.trim() ? v.trim() : null);

  const candidates: Array<Omit<EndpointRow, 'created_at' | 'updated_at' | 'updated_by' | 'id'> & { id?: string }> = [];

  const fhir = declared(process.env.FHIR_EXPORT_ENDPOINT);
  if (fhir) {
    candidates.push({
      label: 'Serveur FHIR de destination',
      scope: 'external',
      category: 'fhir',
      url: fhir,
      enabled: 1,
      auth_mode: declared(process.env.FHIR_EXPORT_TOKEN) ? 'token' : 'none',
      secret_env: declared(process.env.FHIR_EXPORT_TOKEN) ? 'FHIR_EXPORT_TOKEN' : null,
      data_class: 'identifying',
      country: null,
      verify_tls: 1,
      note: 'Importe depuis FHIR_EXPORT_ENDPOINT.',
      last_test_at: null,
      last_test_status: null,
    });
  }

  const dhis2 = declared(process.env.DHIS2_BASE_URL);
  if (dhis2) {
    candidates.push({
      label: 'DHIS2 — surveillance nationale',
      scope: 'external',
      category: 'dhis2',
      url: `${dhis2.replace(/\/$/, '')}/api/tracker`,
      enabled: 1,
      auth_mode: declared(process.env.DHIS2_TOKEN) ? 'token' : 'none',
      secret_env: declared(process.env.DHIS2_TOKEN) ? 'DHIS2_TOKEN' : null,
      data_class: 'pseudonymised',
      country: null,
      verify_tls: 1,
      note: 'Importe depuis DHIS2_BASE_URL.',
      last_test_at: null,
      last_test_status: null,
    });
  }

  const whisper = declared(process.env.WHISPER_ENDPOINT);
  if (whisper) {
    candidates.push({
      label: 'Serveur Whisper de la structure',
      scope: 'internal',
      category: 'whisper',
      url: whisper,
      enabled: 1,
      auth_mode: declared(process.env.WHISPER_TOKEN) ? 'token' : 'none',
      secret_env: declared(process.env.WHISPER_TOKEN) ? 'WHISPER_TOKEN' : null,
      // L'audio brut d'une consultation porte les noms prononces a voix haute.
      data_class: 'identifying',
      country: null,
      verify_tls: 1,
      note: 'Importe depuis WHISPER_ENDPOINT.',
      last_test_at: null,
      last_test_status: null,
    });
  }

  if (declared(process.env.ANTHROPIC_API_KEY)) {
    candidates.push({
      label: 'Modele de langage — extraction clinique',
      scope: 'external',
      category: 'llm',
      url: 'https://api.anthropic.com/v1/messages',
      enabled: 1,
      auth_mode: 'token',
      secret_env: 'ANTHROPIC_API_KEY',
      data_class: 'identifying',
      country: 'US',
      verify_tls: 1,
      note: "Importe depuis ANTHROPIC_API_KEY. Le moteur local hors ligne prend le relais s'il est desactive.",
      last_test_at: null,
      last_test_status: null,
    });
  }

  for (const c of candidates) {
    insert('network_endpoint', { ...c, id: randomUUID(), created_at: nowIso(), updated_at: nowIso() });
  }
}

export function listEndpoints(): EndpointRow[] {
  networkConfig();
  return all<EndpointRow>('SELECT * FROM network_endpoint ORDER BY scope, category, label');
}

export const getEndpoint = (id: string) =>
  get<EndpointRow>('SELECT * FROM network_endpoint WHERE id = ?', [id]);

export function listDerogations(): DerogationRow[] {
  return all<DerogationRow>('SELECT * FROM compliance_derogation ORDER BY granted_at DESC');
}

/**
 * Presence des secrets declares.
 *
 * On rend un booleen par nom de variable. Jamais la valeur : savoir qu'une cle
 * est definie suffit a diagnostiquer, la lire ne sert qu'a la voler.
 */
export function secretsPresent(names: (string | null | undefined)[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const n of [...names, 'FHIR_API_TOKEN']) {
    const name = (n || '').trim();
    if (!name) continue;
    out[name] = Boolean(process.env[name] && process.env[name]!.trim());
  }
  return out;
}

/** Evaluation de la configuration en vigueur. */
export function evaluateCurrent(): Evaluation {
  const config = networkConfig();
  const endpoints = listEndpoints();
  return evaluate({
    config,
    endpoints,
    derogations: listDerogations(),
    secretsPresent: secretsPresent(endpoints.map((e) => e.secret_env)),
    livePort: currentPort(),
  });
}

/** Evaluation d'une configuration proposee, avant ecriture. */
export function evaluateProposal(config: NetworkConfig, endpoints: Endpoint[]): Evaluation {
  return evaluate({
    config,
    endpoints,
    derogations: listDerogations(),
    secretsPresent: secretsPresent(endpoints.map((e) => e.secret_env)),
    livePort: currentPort(),
  });
}

// -------------------------------------------------------------- ecriture

/**
 * Manquements que le changement INTRODUIT.
 *
 * Refuser sur l'etat absolu condamnerait l'exploitant a une impasse : une
 * installation deja non conforme — serveurs importes de l'environnement,
 * derogation revoquee, variable disparue — ne pourrait plus etre corrigee,
 * puisque chaque correction partielle serait rejetee pour un manquement
 * qu'elle ne cause pas.
 *
 * Plus important : cela interdirait de DURCIR la politique. Retirer
 * l'autorisation de transfert rend non conformes les serveurs externes
 * declares ; c'est le but recherche, et ils cessent alors d'etre utilises.
 */
function introduced(before: Evaluation, after: Evaluation): Finding[] {
  const known = new Set([...before.blocking, ...before.pending].map((f) => `${f.code}::${f.target}`));
  return [...after.blocking, ...after.pending].filter((f) => !known.has(`${f.code}::${f.target}`));
}

type Actor = { id: string; full_name: string; role: string } | null | undefined;

const CONFIG_FIELDS: (keyof NetworkConfig)[] = [
  'app_public_url',
  'app_bind_host',
  'app_port',
  'app_https',
  'allowed_origins',
  'fhir_access',
  'db_path',
  'db_backup_dir',
  'db_encrypted',
  'data_residency_country',
  'allow_external_transfer',
];

export function saveConfig(patch: Partial<NetworkConfig>, actor: Actor): { config: NetworkConfigRow; evaluation: Evaluation } {
  const current = networkConfig();
  const proposed: NetworkConfig = { ...current };
  for (const k of CONFIG_FIELDS) {
    if (patch[k] !== undefined) (proposed as unknown as Record<string, unknown>)[k] = patch[k];
  }

  const endpoints = listEndpoints();
  const before = evaluateProposal(current, endpoints);
  const evaluation = evaluateProposal(proposed, endpoints);
  /**
   * Seuls comptent ici les manquements qui portent sur l'application ou sur la
   * base — ce que ce formulaire regle.
   *
   * Un changement de politique rend souvent des serveurs non conformes : c'est
   * precisement l'effet recherche quand on RETIRE l'autorisation de transfert
   * ou qu'on change de territoire. Les compter comme des manquements introduits
   * rendrait le durcissement impossible, ce qui serait exactement l'inverse du
   * but. Ces serveurs cessent simplement d'etre utilisables : `resolveEndpoint`
   * ne les rend plus, et la page les affiche en manquement.
   */
  const nouveaux = introduced(before, evaluation).filter(
    (f) => f.target === 'application' || f.target === 'database',
  );
  if (nouveaux.length > 0) {
    throw new ComplianceError(
      "Configuration refusee : elle enfreint des restrictions applicables aux systemes d'information de sante.",
      { ...evaluation, blocking: nouveaux.filter((f) => f.level === 'blocking'), pending: nouveaux.filter((f) => f.level === 'restricted') },
    );
  }

  const data: Record<string, unknown> = { updated_at: nowIso(), updated_by: actor?.id ?? null };
  for (const k of CONFIG_FIELDS) if (patch[k] !== undefined) data[k] = patch[k];
  run(
    `UPDATE network_config SET ${Object.keys(data)
      .map((k) => `${k} = ?`)
      .join(', ')} WHERE id = 1`,
    Object.values(data),
  );

  audit({
    action: 'update',
    entity: 'network_config',
    entityId: '1',
    actorId: actor?.id,
    actorLabel: actor?.full_name,
    detail: Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'updated_at')),
  });

  return { config: networkConfig(), evaluation: evaluateCurrent() };
}

const ENDPOINT_FIELDS: (keyof Endpoint | 'note')[] = [
  'label',
  'scope',
  'category',
  'url',
  'enabled',
  'auth_mode',
  'secret_env',
  'data_class',
  'country',
  'verify_tls',
  'note',
];

export interface EndpointInput {
  id?: string;
  label?: string;
  scope?: Scope;
  category?: EndpointCategory;
  url?: string;
  enabled?: number;
  auth_mode?: AuthMode;
  secret_env?: string | null;
  data_class?: DataClass;
  country?: string | null;
  verify_tls?: number;
  note?: string | null;
}

/**
 * Cree ou met a jour une destination.
 *
 * L'evaluation porte sur la liste COMPLETE telle qu'elle serait apres
 * l'ecriture, pas sur la seule ligne modifiee : plusieurs regles dependent de
 * la configuration generale (autorisation de transfert, territoire declare).
 */
export function saveEndpoint(
  input: EndpointInput,
  actor: Actor,
): { endpoint: EndpointRow; evaluation: Evaluation; pending: Finding[]; message: string | null } {
  const config = networkConfig();
  const existing = input.id ? getEndpoint(input.id) : undefined;
  if (input.id && !existing) throw new Error('Serveur introuvable.');

  const merged: EndpointRow = {
    id: existing?.id ?? randomUUID(),
    label: (input.label ?? existing?.label ?? '').trim(),
    scope: input.scope ?? existing?.scope ?? 'internal',
    category: input.category ?? existing?.category ?? 'other',
    url: (input.url ?? existing?.url ?? '').trim(),
    enabled: input.enabled ?? existing?.enabled ?? 1,
    auth_mode: input.auth_mode ?? existing?.auth_mode ?? 'none',
    secret_env: normaliseSecretName(input.secret_env ?? existing?.secret_env ?? null),
    data_class: input.data_class ?? existing?.data_class ?? 'none',
    country: (input.country ?? existing?.country ?? null)?.trim().toUpperCase() || null,
    verify_tls: input.verify_tls ?? existing?.verify_tls ?? 1,
    note: input.note ?? existing?.note ?? null,
    last_test_at: existing?.last_test_at ?? null,
    last_test_status: existing?.last_test_status ?? null,
    created_at: existing?.created_at ?? nowIso(),
    updated_at: nowIso(),
    updated_by: actor?.id ?? null,
  };

  if (!merged.label) throw new Error('Un nom est requis pour identifier ce serveur.');
  if (!merged.url) throw new Error('Une adresse est requise.');

  const all_ = listEndpoints();
  const others = all_.filter((e) => e.id !== merged.id);
  const before = evaluateProposal(config, all_);
  let evaluation = evaluateProposal(config, [...others, merged]);
  let nouveaux = introduced(before, evaluation);

  const bloquants = nouveaux.filter((f) => f.level === 'blocking');
  if (bloquants.length > 0) {
    throw new ComplianceError(
      'Serveur refuse : sa declaration enfreint des restrictions applicables aux donnees de sante.',
      { ...evaluation, blocking: bloquants, pending: nouveaux.filter((f) => f.level === 'restricted') },
    );
  }

  /**
   * Restrictions a lever : deux reponses, selon que le serveur existe deja.
   *
   * Serveur NOUVEAU : on l'enregistre DESACTIVE. Refuser purement creerait une
   * impasse — la derogation se rattache a un identifiant precis, et celui d'un
   * serveur jamais ecrit change a chaque tentative : le responsable ne pourrait
   * jamais lever la restriction qu'on lui oppose. Un serveur desactive ne
   * recoit rien, `resolveEndpoint` ne le rend pas ; il devient une declaration
   * en attente de signature.
   *
   * Serveur EXISTANT : on refuse. Son identifiant est stable, la derogation se
   * signe depuis la liste des constats, et repondre « enregistre » a une
   * activation qui n'a pas eu lieu induirait en erreur.
   */
  const aLever = nouveaux.filter((f) => f.level === 'restricted' && f.target === merged.id);
  const misEnAttente = aLever.length > 0 && merged.enabled === 1 && !existing;
  if (aLever.length > 0 && merged.enabled === 1 && existing) {
    throw new ComplianceError(
      `Activation refusee : ${aLever.length} restriction${aLever.length > 1 ? 's' : ''} ` +
        `doi${aLever.length > 1 ? 'vent' : 't'} etre levee${aLever.length > 1 ? 's' : ''} par ecrit au prealable.`,
      { ...evaluation, blocking: [], pending: aLever },
    );
  }
  if (misEnAttente) {
    merged.enabled = 0;
    evaluation = evaluateProposal(config, [...others, merged]);
    nouveaux = introduced(before, evaluation);
  }

  // Une restriction portant sur une AUTRE cible n'a pas ete introduite par ce
  // serveur : la desactiver n'y changerait rien, et il n'y a pas lieu de la lui
  // imputer. Elle reste visible dans l'evaluation generale.
  const restantes = nouveaux.filter((f) => f.level === 'restricted');
  if (restantes.length > 0) {
    throw new ComplianceError(
      'Serveur refuse : sa declaration enfreint des restrictions applicables aux donnees de sante.',
      { ...evaluation, blocking: [], pending: restantes },
    );
  }

  if (existing) {
    const data: Record<string, unknown> = { updated_at: merged.updated_at, updated_by: merged.updated_by };
    for (const k of ENDPOINT_FIELDS) data[k] = (merged as unknown as Record<string, unknown>)[k];
    update('network_endpoint', merged.id, data);
  } else {
    insert('network_endpoint', merged as unknown as Record<string, unknown>);
  }

  audit({
    action: existing ? 'update' : 'create',
    entity: 'network_endpoint',
    entityId: merged.id,
    actorId: actor?.id,
    actorLabel: actor?.full_name,
    detail: {
      label: merged.label,
      scope: merged.scope,
      category: merged.category,
      url: merged.url,
      data_class: merged.data_class,
      enabled: merged.enabled,
    },
  });

  return {
    endpoint: getEndpoint(merged.id)!,
    evaluation: evaluateCurrent(),
    pending: aLever,
    message: misEnAttente
      ? `Serveur enregistre mais DESACTIVE : ${aLever.length} restriction${aLever.length > 1 ? 's' : ''} ` +
        'doi' +
        (aLever.length > 1 ? 'vent' : 't') +
        ' etre levee' +
        (aLever.length > 1 ? 's' : '') +
        ' par ecrit avant de l activer. Aucune donnee ne part vers un serveur desactive.'
      : null,
  };
}

export function deleteEndpoint(id: string, actor: Actor) {
  const existing = getEndpoint(id);
  if (!existing) throw new Error('Serveur introuvable.');
  run('DELETE FROM network_endpoint WHERE id = ?', [id]);
  run('DELETE FROM compliance_derogation WHERE target = ?', [id]);
  audit({
    action: 'delete',
    entity: 'network_endpoint',
    entityId: id,
    actorId: actor?.id,
    actorLabel: actor?.full_name,
    detail: { label: existing.label, url: existing.url },
  });
}

/**
 * Nom de variable d'environnement, normalise.
 *
 * On refuse tout ce qui n'est pas un identifiant : si une valeur de secret est
 * collee ici par erreur, elle finirait en clair dans la base de configuration
 * et dans le journal d'audit.
 */
function normaliseSecretName(raw: string | null): string | null {
  const v = (raw || '').trim();
  if (!v) return null;
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(v)) {
    throw new Error(
      "Le champ attend le NOM d'une variable d'environnement (ex. FHIR_EXPORT_TOKEN), pas la valeur du secret.",
    );
  }
  return v.toUpperCase();
}

// ------------------------------------------------------------ derogations

/**
 * Leve une restriction, par ecrit.
 *
 * Reserve au super-administrateur, et volontairement pas rattache a une
 * permission attribuable : accepter un transfert hors du territoire ou une API
 * ouverte engage le responsable de traitement. C'est une decision, pas un
 * droit qu'on delegue en cochant une case — la meme logique que le
 * cloisonnement par etablissement, qui n'est pas negociable par permission.
 */
export function grantDerogation(
  input: { code: string; target: string; reason: string },
  actor: Actor,
): DerogationRow {
  const code = (input.code || '').trim();
  const target = (input.target || '').trim();
  const reason = (input.reason || '').trim();
  if (!code || !target) throw new Error('Restriction a lever non precisee.');

  run('DELETE FROM compliance_derogation WHERE code = ? AND target = ?', [code, target]);
  const id = randomUUID();
  insert('compliance_derogation', {
    id,
    code,
    target,
    reason,
    granted_by: actor?.id ?? null,
    granted_by_label: actor?.full_name ?? null,
    granted_at: nowIso(),
  });

  audit({
    action: 'validate',
    entity: 'compliance_derogation',
    entityId: id,
    actorId: actor?.id,
    actorLabel: actor?.full_name,
    detail: { code, target, reason },
  });

  return get<DerogationRow>('SELECT * FROM compliance_derogation WHERE id = ?', [id])!;
}

export function revokeDerogation(code: string, target: string, actor: Actor) {
  run('DELETE FROM compliance_derogation WHERE code = ? AND target = ?', [code, target]);
  audit({
    action: 'delete',
    entity: 'compliance_derogation',
    entityId: `${code}::${target}`,
    actorId: actor?.id,
    actorLabel: actor?.full_name,
    detail: { code, target },
  });
}

export function recordTest(id: string, status: string) {
  update('network_endpoint', id, { last_test_at: nowIso(), last_test_status: status.slice(0, 200) });
}

// ------------------------------------------------ resolution a l'execution

/**
 * Destination utilisable pour un usage donne.
 *
 * Trois filtres successifs, et le troisieme est le seul qui compte vraiment :
 * une destination dont la declaration est bloquante n'est pas rendue, meme si
 * elle est enregistree. Une configuration peut devenir non conforme apres coup
 * — l'autorisation de transfert retiree, le territoire modifie — et il serait
 * absurde de continuer a emettre vers elle parce qu'elle avait ete acceptee
 * un jour.
 */
export function resolveEndpoint(
  category: EndpointCategory,
  /**
   * Depart entre plusieurs destinations d'une meme categorie. Whisper et Griot
   * partagent la categorie « transcription » parce qu'ils recoivent la meme
   * chose — de l'audio brut de consultation, donc une donnee identifiante —
   * et doivent donc subir les memes restrictions. Seule leur adresse differe.
   */
  match?: (e: EndpointRow) => boolean,
): {
  endpoint: EndpointRow;
  secret: string | null;
} | null {
  const rows = listEndpoints().filter(
    (e) => e.category === category && e.enabled === 1 && (!match || match(e)),
  );
  if (rows.length === 0) return null;

  const evaluation = evaluateCurrent();
  const blocked = new Set(evaluation.blocking.map((f) => f.target));
  const pending = new Set(evaluation.pending.map((f) => f.target));

  const usable = rows.find((e) => !blocked.has(e.id) && !pending.has(e.id));
  if (!usable) return null;

  const secret = usable.secret_env ? (process.env[usable.secret_env]?.trim() ?? null) : null;
  return { endpoint: usable, secret };
}

/** Motif de refus, quand `resolveEndpoint` ne rend rien alors qu'une ligne existe. */
export function blockingReason(
  category: EndpointCategory,
  match?: (e: EndpointRow) => boolean,
): string | null {
  const rows = listEndpoints().filter(
    (e) => e.category === category && e.enabled === 1 && (!match || match(e)),
  );
  if (rows.length === 0) return null;
  const ids = new Set(rows.map((e) => e.id));
  const evaluation = evaluateCurrent();
  const first = [...evaluation.blocking, ...evaluation.pending].find((f) => ids.has(f.target));
  return first ? `${first.title} — ${first.remedy}` : null;
}

/** Valeur d'Access-Control-Allow-Origin a rendre pour une requete donnee. */
export function corsOriginFor(requestOrigin: string | null): string | null {
  const { allowed_origins } = networkConfig();
  const list = allowed_origins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (list.length === 0) return null;
  if (list.includes('*')) return '*';
  if (requestOrigin && list.includes(requestOrigin)) return requestOrigin;
  return null;
}

export type { Evaluation, Finding } from '@/lib/compliance/rules';
