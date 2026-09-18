/**
 * Restrictions reglementaires appliquees aux adresses et aux serveurs.
 *
 * Ce module est PUR : il ne lit ni la base, ni l'environnement, ni le reseau.
 * Il recoit une configuration proposee et rend la liste des manquements. Cette
 * separation n'est pas cosmetique — elle permet de verifier la configuration
 * AVANT de l'ecrire, donc de refuser un enregistrement dangereux au lieu de
 * l'afficher en rouge une fois en place.
 *
 * Trois niveaux, et la difference entre eux est le coeur du dispositif :
 *
 *   bloquant   L'enregistrement est refuse. Aucune derogation n'existe. Ce
 *              sont les cas ou la configuration exposerait des donnees de
 *              sante en clair, ou corromprait le dossier medical.
 *   restreint  L'enregistrement est refuse TANT QUE personne n'a accorde une
 *              derogation ecrite. Ce sont les arbitrages qui relevent du
 *              responsable de traitement, pas du logiciel : heberger hors du
 *              territoire, ouvrir l'API sans authentification.
 *   alerte     L'enregistrement passe, le constat reste affiche.
 *
 * Le niveau "restreint" reprend le principe deja retenu pour les
 * contre-indications : le logiciel ne decide pas a la place du responsable,
 * mais il exige une justification ecrite et la trace.
 *
 * Les references citees sont celles qui fondent la regle. Elles ne valent pas
 * attestation de conformite : un logiciel ne certifie pas un traitement de
 * donnees de sante, il empeche seulement les erreurs de configuration qu'on
 * sait nommer.
 */

// ------------------------------------------------------------------- types

export type Scope = 'internal' | 'external';
export type DataClass = 'none' | 'aggregated' | 'pseudonymised' | 'identifying';
export type EndpointCategory = 'fhir' | 'hl7' | 'dhis2' | 'whisper' | 'llm' | 'backup' | 'other';
export type AuthMode = 'none' | 'token' | 'basic' | 'mtls';
export type FhirAccess = 'session' | 'token' | 'open';

export const SCOPE_LABELS: Record<Scope, string> = {
  internal: 'Interne (reseau de la structure)',
  external: 'Externe (hors du reseau de la structure)',
};

export const DATA_CLASS_LABELS: Record<DataClass, string> = {
  none: 'Aucune donnee de sante',
  aggregated: 'Agregats (aucun individu identifiable)',
  pseudonymised: 'Pseudonymise (identite remplacee par un code)',
  identifying: 'Identifiant (nom, date de naissance, identifiants)',
};

export const CATEGORY_LABELS: Record<EndpointCategory, string> = {
  fhir: 'Serveur FHIR (dossier partage)',
  hl7: 'Interface HL7 v2 (SIH)',
  dhis2: 'DHIS2 (surveillance nationale)',
  whisper: 'Serveur de transcription Whisper',
  llm: 'Modele de langage (extraction clinique)',
  backup: 'Depot de sauvegarde',
  other: 'Autre',
};

export const AUTH_MODE_LABELS: Record<AuthMode, string> = {
  none: 'Aucune',
  token: 'Jeton porteur (Bearer)',
  basic: 'Identifiant et mot de passe (Basic)',
  mtls: 'Certificat client (mTLS)',
};

export const FHIR_ACCESS_LABELS: Record<FhirAccess, string> = {
  session: 'Session authentifiee (droit export:read)',
  token: 'Jeton de service (FHIR_API_TOKEN)',
  open: 'Ouverte, sans authentification',
};

export interface NetworkConfig {
  /** Adresse que les utilisateurs saisissent pour joindre l'application. */
  app_public_url: string | null;
  /** Interface d'ecoute : 127.0.0.1 (ce poste seul) ou 0.0.0.0 (tout le reseau). */
  app_bind_host: string;
  app_port: number;
  /** 1 si l'adresse publique est servie en HTTPS (directement ou via un proxy). */
  app_https: number;
  /** Origines autorisees sur l'API FHIR, separees par des virgules. */
  allowed_origins: string;
  fhir_access: FhirAccess;
  db_path: string;
  db_backup_dir: string | null;
  /** Chiffrement du support qui porte la base. Declaratif : seul l'exploitant le sait. */
  db_encrypted: number;
  /** Pays ou les donnees doivent rester, code ISO a deux lettres. */
  data_residency_country: string;
  /** Interrupteur general : sans lui, aucun flux de sante ne sort de la structure. */
  allow_external_transfer: number;
}

export interface Endpoint {
  id: string;
  label: string;
  scope: Scope;
  category: EndpointCategory;
  url: string;
  enabled: number;
  auth_mode: AuthMode;
  /** Nom de la variable d'environnement qui porte le secret, jamais le secret. */
  secret_env: string | null;
  data_class: DataClass;
  country: string | null;
  verify_tls: number;
}

export interface Derogation {
  code: string;
  target: string;
  reason: string;
  granted_by_label: string | null;
  granted_at: string;
}

export type Level = 'blocking' | 'restricted' | 'warning';

export interface Finding {
  code: string;
  level: Level;
  /** 'application', 'database' ou l'identifiant d'un serveur. */
  target: string;
  targetLabel: string;
  title: string;
  detail: string;
  reference: string;
  remedy: string;
  /** Derogation en vigueur, si une restriction a ete levee par ecrit. */
  waived?: Derogation;
}

export interface EvaluationInput {
  config: NetworkConfig;
  endpoints: Endpoint[];
  derogations?: Derogation[];
  /** Presence (jamais la valeur) des secrets declares, calculee par l'appelant. */
  secretsPresent?: Record<string, boolean>;
  /** Port reellement ecoute, pour detecter une adresse declaree obsolete. */
  livePort?: number;
}

export interface Evaluation {
  findings: Finding[];
  /** Manquements sans derogation possible. */
  blocking: Finding[];
  /** Restrictions non encore levees par une derogation ecrite. */
  pending: Finding[];
  /** Restrictions levees, conservees pour la tracabilite. */
  waived: Finding[];
  warnings: Finding[];
  /** true si la configuration peut etre enregistree en l'etat. */
  acceptable: boolean;
}

// ---------------------------------------------------------------- adresses

const PRIVATE_V4 =
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** Hote joignable uniquement depuis le poste lui-meme. */
export function isLoopback(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || /^127\./.test(h);
}

/**
 * Hote qui n'est pas routable sur l'internet public.
 *
 * `.local` et `.lan` sont inclus : ce sont les noms que distribuent les
 * resolveurs de reseau local, et un serveur ainsi nomme est bien interne.
 */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (isLoopback(h)) return true;
  if (PRIVATE_V4.test(h)) return true;
  // IPv6 unique-local (fc00::/7) et lien-local (fe80::/10)
  if (/^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
  if (/\.(local|lan|internal|intranet|home|localdomain)$/.test(h)) return true;
  // Nom sans point : machine nommee sur le reseau local, jamais sur l'internet.
  return !h.includes('.') && !/^\d+$/.test(h);
}

export interface ParsedUrl {
  ok: boolean;
  protocol: string;
  host: string;
  secure: boolean;
  hasUserInfo: boolean;
  /** Parametres de requete dont le nom evoque un secret. */
  secretParams: string[];
}

const SECRET_PARAM = /(token|key|secret|password|passwd|pwd|apikey|api_key|access|auth|sig|signature)/i;

export function parseUrl(raw: string): ParsedUrl {
  const empty: ParsedUrl = { ok: false, protocol: '', host: '', secure: false, hasUserInfo: false, secretParams: [] };
  if (!raw || !raw.trim()) return empty;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return empty;
  }
  const secretParams: string[] = [];
  u.searchParams.forEach((_v, k) => {
    if (SECRET_PARAM.test(k)) secretParams.push(k);
  });
  return {
    ok: true,
    protocol: u.protocol.replace(':', ''),
    host: u.hostname,
    secure: u.protocol === 'https:' || u.protocol === 'wss:',
    hasUserInfo: Boolean(u.username || u.password),
    secretParams,
  };
}

/** L'ecoute sort-elle du poste local ? */
export function bindsToNetwork(bindHost: string): boolean {
  const h = (bindHost || '').trim();
  return h !== '' && !isLoopback(h);
}

export function originList(raw: string): string[] {
  return (raw || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

// ------------------------------------------------------------------ regles

const carriesHealthData = (c: DataClass) => c !== 'none';
const carriesIdentity = (c: DataClass) => c === 'identifying' || c === 'pseudonymised';

function finding(f: Finding): Finding {
  return f;
}

/**
 * Evalue une configuration complete.
 *
 * L'ordre des regles n'a pas d'importance : aucune ne depend du resultat d'une
 * autre. Une meme cible peut accumuler plusieurs manquements, et c'est voulu —
 * masquer les suivants derriere le premier ferait corriger une configuration
 * en trois allers-retours.
 */
export function evaluate(input: EvaluationInput): Evaluation {
  const { config, endpoints, derogations = [], secretsPresent = {}, livePort } = input;
  const out: Finding[] = [];

  const onNetwork = bindsToNetwork(config.app_bind_host);
  const residency = (config.data_residency_country || '').trim().toUpperCase();

  // ------------------------------------------------------------ application

  if (onNetwork && config.app_https !== 1) {
    out.push(
      finding({
        code: 'RESEAU_SANS_TLS',
        level: 'restricted',
        target: 'application',
        targetLabel: "Adresse de l'application",
        title: 'Application exposee au reseau sans chiffrement',
        detail:
          `L'application ecoute sur ${config.app_bind_host}, donc au-dela de ce poste, et l'adresse ` +
          "publique est declaree en HTTP. Tout le trafic — identifiants de connexion, contenu des " +
          'consultations — circule en clair sur le reseau de la structure. Le microphone reste par ' +
          'ailleurs inutilisable sur ces adresses : les navigateurs le reservent a HTTPS.',
        reference:
          'RGPD art. 32 (securite du traitement) ; HIPAA Security Rule 45 CFR 164.312(e)(1) ; ISO 27799 ; PGSSI-S',
        remedy:
          'Placer un proxy TLS (Caddy, nginx) devant l application et declarer l adresse publique en https://, ' +
          'ou limiter l ecoute a 127.0.0.1 si un seul poste utilise l application.',
      }),
    );
  }

  const origins = originList(config.allowed_origins);
  if (origins.includes('*')) {
    out.push(
      finding({
        code: 'ORIGINES_TOUTES',
        level: onNetwork ? 'blocking' : 'warning',
        target: 'application',
        targetLabel: "Adresse de l'application",
        title: "Toutes les origines sont autorisees sur l'API FHIR",
        detail:
          "L'API FHIR sert des ressources Patient, Condition et Observation. Avec une origine a `*`, " +
          "n'importe quelle page web ouverte par un utilisateur peut les lire depuis son navigateur." +
          (onNetwork
            ? " L'application etant exposee au reseau, la combinaison est refusee."
            : " L'ecoute etant limitee a ce poste, la portee reste faible, mais le reglage n est pas tenable en service."),
        reference: 'RGPD art. 5.1.f et art. 32 ; ISO 27799 ; principe de minimisation des acces',
        remedy:
          'Lister explicitement les origines des systemes appeles a interroger l API, par exemple ' +
          'https://sih.hopital.bj. Laisser la liste vide interdit tout appel navigateur inter-origine.',
      }),
    );
  }

  if (config.fhir_access === 'open') {
    out.push(
      finding({
        code: 'API_FHIR_SANS_AUTHENTIFICATION',
        level: 'restricted',
        target: 'application',
        targetLabel: "Adresse de l'application",
        title: "API FHIR ouverte sans authentification",
        detail:
          "En acces ouvert, /api/fhir repond a tout appelant capable d'atteindre le serveur, sans " +
          'identification ni trace nominative. Sur une ecoute reseau, cela revient a publier le dossier ' +
          'medical a tout le reseau de la structure.',
        reference:
          "RGPD art. 32.1.b et art. 5.1.f ; HIPAA 45 CFR 164.312(a)(1) et (b) ; PGSSI-S (imputabilite des acces)",
        remedy:
          'Choisir « Session authentifiee » pour les usages internes, ou « Jeton de service » pour ' +
          'un systeme tiers, le secret restant dans FHIR_API_TOKEN cote serveur.',
      }),
    );
  }

  if (config.fhir_access === 'token' && !secretsPresent.FHIR_API_TOKEN) {
    out.push(
      finding({
        code: 'JETON_API_ABSENT',
        level: 'blocking',
        target: 'application',
        targetLabel: "Adresse de l'application",
        title: "Acces par jeton demande, mais aucun jeton n'est defini",
        detail:
          "L'API FHIR est reglee sur « Jeton de service » alors que FHIR_API_TOKEN est absent de " +
          "l'environnement du serveur. Enregistrer ce reglage rendrait l'API inutilisable, ou pire, " +
          'la laisserait comparer a une valeur vide.',
        reference: 'RGPD art. 32 ; PGSSI-S (gestion des secrets)',
        remedy:
          "Definir FHIR_API_TOKEN dans .env.local (serveur web) ou dans l'environnement du service, " +
          'avec une valeur aleatoire d au moins 32 caracteres, puis redemarrer.',
      }),
    );
  }

  const publicUrl = parseUrl(config.app_public_url ?? '');
  if (config.app_public_url && !publicUrl.ok) {
    out.push(
      finding({
        code: 'ADRESSE_APPLICATION_INVALIDE',
        level: 'blocking',
        target: 'application',
        targetLabel: "Adresse de l'application",
        title: "L'adresse publique n'est pas une URL valide",
        detail: `« ${config.app_public_url} » n'a pas pu etre interprete comme une adresse.`,
        reference: 'Coherence de configuration',
        remedy: 'Ecrire une adresse complete, protocole compris : https://parledocteur.hopital.bj',
      }),
    );
  } else if (publicUrl.ok && publicUrl.secure && config.app_https !== 1) {
    out.push(
      finding({
        code: 'TLS_DECLARE_INCOHERENT',
        level: 'warning',
        target: 'application',
        targetLabel: "Adresse de l'application",
        title: "L'adresse publique est en HTTPS mais le chiffrement est declare absent",
        detail:
          "L'adresse annonce https:// alors que la case « servie en HTTPS » n'est pas cochee. Les " +
          'restrictions se calculent sur la case, pas sur l adresse : le controle est donc plus severe ' +
          'que la realite, ou l adresse est fausse.',
        reference: 'Coherence de configuration',
        remedy: 'Cocher « servie en HTTPS » si un proxy TLS est bien en place, sinon corriger l adresse.',
      }),
    );
  }

  if (livePort !== undefined && Number(config.app_port) !== livePort) {
    out.push(
      finding({
        code: 'PORT_DECLARE_INCOHERENT',
        level: 'warning',
        target: 'application',
        targetLabel: "Adresse de l'application",
        title: 'Le port declare ne correspond pas au port ecoute',
        detail:
          `La configuration indique le port ${config.app_port} alors que le serveur repond ` +
          `actuellement sur le port ${livePort}. Les adresses communiquees aux utilisateurs seront fausses.`,
        reference: 'Coherence de configuration',
        remedy:
          `Corriger le port declare, ou demarrer le serveur sur le port ${config.app_port}. ` +
          "L'application desktop tire un port au hasard a chaque lancement : c'est normal qu'il varie.",
      }),
    );
  }

  // --------------------------------------------------------------- base

  const dbPath = (config.db_path || '').trim();
  if (/^(\\\\|\/\/)/.test(dbPath)) {
    out.push(
      finding({
        code: 'BASE_SUR_PARTAGE_RESEAU',
        level: 'blocking',
        target: 'database',
        targetLabel: 'Base de donnees',
        title: 'La base est placee sur un partage reseau',
        detail:
          `« ${dbPath} » designe un partage reseau. SQLite verrouille ses fichiers par des primitives ` +
          'que SMB et NFS n honorent pas de maniere fiable : deux ecritures simultanees corrompent la ' +
          "base. Il ne s'agit pas d'un risque theorique de performance, mais de la perte du dossier medical.",
        reference: 'Documentation SQLite (How To Corrupt A Database File) ; ISO 27799 (integrite)',
        remedy:
          'Garder la base sur un disque local du serveur et partager l application par le reseau, ' +
          'pas le fichier. Les sauvegardes, elles, peuvent partir sur le partage.',
      }),
    );
  }

  if (config.db_encrypted !== 1) {
    out.push(
      finding({
        code: 'BASE_NON_CHIFFREE',
        level: 'warning',
        target: 'database',
        targetLabel: 'Base de donnees',
        title: 'Le support de la base n est pas declare chiffre',
        detail:
          'Le fichier de base contient les dossiers en clair. Un poste vole ou un disque sorti de la ' +
          "machine donne acces a l'ensemble des consultations sans mot de passe.",
        reference:
          'HIPAA 45 CFR 164.312(a)(2)(iv) (mesure adressable) ; RGPD art. 32.1.a ; ISO 27799',
        remedy:
          'Activer le chiffrement du disque (BitLocker sous Windows, LUKS sous Linux, FileVault sous macOS), ' +
          'puis cocher la case ici. La case est declarative : elle enregistre ce que vous avez mis en place.',
      }),
    );
  }

  const backupDir = (config.db_backup_dir || '').trim();
  if (!backupDir) {
    out.push(
      finding({
        code: 'SAUVEGARDE_NON_CONFIGUREE',
        level: 'warning',
        target: 'database',
        targetLabel: 'Base de donnees',
        title: 'Aucun emplacement de sauvegarde defini',
        detail:
          'Les sauvegardes sont ecrites a cote de la base. Une panne du disque emporte alors la base ' +
          'et ses copies.',
        reference: 'RGPD art. 32.1.c (disponibilite et resilience) ; ISO 27799',
        remedy:
          'Indiquer un emplacement sur un autre support : disque externe, partage reseau, volume ' +
          'de sauvegarde. Une copie hors du batiment reste necessaire.',
      }),
    );
  } else if (sameVolume(backupDir, dbPath)) {
    out.push(
      finding({
        code: 'SAUVEGARDE_MEME_SUPPORT',
        level: 'warning',
        target: 'database',
        targetLabel: 'Base de donnees',
        title: 'Les sauvegardes sont sur le meme support que la base',
        detail:
          `« ${backupDir} » se trouve sur le meme volume que la base. Une defaillance du disque, un ` +
          'chiffrement par rancongiciel ou une erreur de manipulation detruisent les deux ensemble.',
        reference: 'RGPD art. 32.1.c ; ISO 27799 ; regle de sauvegarde 3-2-1',
        remedy: 'Choisir un volume distinct, et sortir une copie du batiment a intervalle regulier.',
      }),
    );
  }

  // ---------------------------------------------------------- serveurs

  for (const e of endpoints) {
    if (e.enabled !== 1) continue;
    const u = parseUrl(e.url);
    const label = e.label || CATEGORY_LABELS[e.category];

    if (!u.ok) {
      out.push(
        finding({
          code: 'ADRESSE_SERVEUR_INVALIDE',
          level: 'blocking',
          target: e.id,
          targetLabel: label,
          title: "L'adresse du serveur n'est pas une URL valide",
          detail: `« ${e.url} » n'a pas pu etre interprete comme une adresse.`,
          reference: 'Coherence de configuration',
          remedy: 'Ecrire une adresse complete, protocole compris : https://serveur.exemple.bj/fhir',
        }),
      );
      continue;
    }

    const privateHost = isPrivateHost(u.host);

    // La portee declaree est ce qui assouplit les autres regles. Si elle peut
    // mentir, tout le dispositif tombe : on la verifie contre l'adresse.
    if (e.scope === 'internal' && !privateHost) {
      out.push(
        finding({
          code: 'PORTEE_DECLAREE_FAUSSE',
          level: 'blocking',
          target: e.id,
          targetLabel: label,
          title: 'Serveur declare interne alors que son adresse est publique',
          detail:
            `« ${u.host} » n'appartient a aucune plage privee. Declarer ce serveur interne leve des ` +
            "controles prevus pour les flux sortants — notamment l'autorisation de transfert et la " +
            'verification du pays d hebergement.',
          reference: "RGPD art. 44 a 49 (transferts) ; loi beninoise 2017-20 portant code du numerique",
          remedy: 'Basculer la portee sur « Externe », ou corriger l adresse si le serveur est bien sur le reseau.',
        }),
      );
    }

    if (u.hasUserInfo || u.secretParams.length > 0) {
      out.push(
        finding({
          code: 'SECRET_DANS_ADRESSE',
          level: 'blocking',
          target: e.id,
          targetLabel: label,
          title: "L'adresse contient un secret",
          detail: u.hasUserInfo
            ? "L'adresse porte un identifiant et un mot de passe. Elle serait enregistree en clair dans " +
              "la base de configuration, recopiee dans le journal d'audit et dans les traces de transmission."
            : `L'adresse porte le parametre ${u.secretParams.join(', ')}, dont le nom evoque un secret. ` +
              "Les adresses completes apparaissent dans les journaux ; les secrets n'y ont pas leur place.",
          reference: 'PGSSI-S (gestion des secrets) ; ISO 27799 ; RGPD art. 32',
          remedy:
            "Retirer le secret de l'adresse et le placer dans une variable d'environnement du serveur, " +
            'dont seul le nom est renseigne ici.',
        }),
      );
    }

    if (carriesHealthData(e.data_class) && !u.secure && !isLoopback(u.host)) {
      const identity = carriesIdentity(e.data_class);
      out.push(
        finding({
          code: 'TRANSPORT_EN_CLAIR',
          level: identity || !privateHost ? 'blocking' : 'restricted',
          target: e.id,
          targetLabel: label,
          title: 'Donnees de sante transmises sans chiffrement',
          detail:
            `Le flux est declare « ${DATA_CLASS_LABELS[e.data_class]} » et part en ${u.protocol}:// vers ` +
            `${u.host}. Toute machine sur le trajet lit le contenu.` +
            (identity ? '' : " Meme agrege, un flux de sante en clair reste interceptable et modifiable."),
          reference:
            'RGPD art. 32.1.a ; HIPAA 45 CFR 164.312(e)(1) ; ISO 27799 ; PGSSI-S (confidentialite des echanges)',
          remedy: 'Passer le serveur distant en HTTPS. Aucun contournement ne remplace le chiffrement du transport.',
        }),
      );
    }

    if (u.secure && e.verify_tls !== 1) {
      out.push(
        finding({
          code: 'CERTIFICAT_NON_VERIFIE',
          level: 'blocking',
          target: e.id,
          targetLabel: label,
          title: 'Verification du certificat desactivee',
          detail:
            'Sans verification du certificat, le chiffrement subsiste mais plus rien ne garantit ' +
            "l'identite du destinataire : un intermediaire qui se presente a sa place dechiffre tout le " +
            'flux. Le HTTPS devient decoratif.',
          reference: 'RGPD art. 32.1.b ; HIPAA 45 CFR 164.312(e)(2)(i) ; ISO 27799',
          remedy:
            'Installer le certificat de l autorite interne sur le serveur ParleDocteur plutot que de ' +
            'desactiver le controle. Un certificat auto-signe se fait reconnaitre, il ne se contourne pas.',
        }),
      );
    }

    if (e.scope === 'external' && carriesHealthData(e.data_class) && config.allow_external_transfer !== 1) {
      out.push(
        finding({
          code: 'TRANSFERT_EXTERNE_DESACTIVE',
          level: 'blocking',
          target: e.id,
          targetLabel: label,
          title: 'Flux sortant alors que les transferts externes sont interdits',
          detail:
            "La configuration de la structure interdit tout transfert de donnees de sante hors de son " +
            'reseau. Ce serveur est declare externe et transporte des donnees de sante.',
          reference: 'Politique de la structure ; RGPD art. 5.1.b ; loi beninoise 2017-20',
          remedy:
            'Soit desactiver ce serveur, soit autoriser explicitement les transferts externes dans la ' +
            "section « Territoire et transferts ». L'autorisation ouvre alors les controles de pays.",
        }),
      );
    }

    if (
      e.scope === 'external' &&
      carriesIdentity(e.data_class) &&
      residency &&
      e.country &&
      e.country.trim().toUpperCase() !== residency
    ) {
      out.push(
        finding({
          code: 'TRANSFERT_HORS_TERRITOIRE',
          level: 'restricted',
          target: e.id,
          targetLabel: label,
          title: 'Donnees de sante transferees hors du territoire declare',
          detail:
            `Le serveur est heberge en ${e.country.trim().toUpperCase()} alors que les donnees doivent ` +
            `rester en ${residency}. Un transfert hors du territoire de collecte est un traitement a part ` +
            'entiere, soumis a une base juridique propre.',
          reference:
            'Loi beninoise 2017-20 portant code du numerique (autorisation prealable de l APDP) ; ' +
            'RGPD chapitre V, art. 44 a 49 ; Convention de Malabo (UA, 2014)',
          remedy:
            "Documenter ici la base du transfert : autorisation de l autorite de protection, clauses " +
            'contractuelles types, ou decision d adequation. A defaut, heberger le serveur sur le territoire.',
        }),
      );
    }

    if (e.category === 'dhis2' && e.data_class === 'identifying') {
      out.push(
        finding({
          code: 'SURVEILLANCE_NOMINATIVE',
          level: 'blocking',
          target: e.id,
          targetLabel: label,
          title: 'Surveillance epidemiologique alimentee en donnees nominatives',
          detail:
            'La remontee de surveillance repond a un besoin statistique et sanitaire qui ne requiert pas ' +
            "l'identite des patients. Y verser des donnees identifiantes depasse la finalite declaree et " +
            'cree un fichier nominatif national que personne n a autorise.',
          reference:
            'RGPD art. 5.1.c (minimisation) et art. 9 ; Reglement sanitaire international (2005), art. 45 ; ' +
            'recommandations OMS sur la surveillance',
          remedy:
            'Choisir « Agregats » ou « Pseudonymise ». ParleDocteur pseudonymise deja les evenements DHIS2 ' +
            "qu'il produit.",
        }),
      );
    }

    if (e.category === 'llm' && e.scope === 'external' && e.data_class === 'identifying') {
      out.push(
        finding({
          code: 'MODELE_TIERS_DONNEES_IDENTIFIANTES',
          level: 'restricted',
          target: e.id,
          targetLabel: label,
          title: 'Transcription identifiante envoyee a un modele de langage tiers',
          detail:
            "Le contenu d'une consultation part chez un prestataire exterieur avec les elements " +
            "d'identite. Le prestataire devient sous-traitant au sens du reglement, ce qui suppose un " +
            'contrat, une localisation connue et une duree de conservation opposable.',
          reference:
            'RGPD art. 9 (donnees de sante), art. 28 (sous-traitance), chapitre V ; ' +
            'HIPAA 45 CFR 164.308(b) (business associate agreement)',
          remedy:
            'Declarer le flux « Pseudonymise » apres retrait des identifiants, ou basculer sur le moteur ' +
            "d'extraction local hors ligne, qui ne sort aucune donnee du poste.",
        }),
      );
    }

    if (e.scope === 'external' && carriesHealthData(e.data_class) && e.auth_mode === 'none') {
      out.push(
        finding({
          code: 'DESTINATAIRE_NON_AUTHENTIFIE',
          level: 'blocking',
          target: e.id,
          targetLabel: label,
          title: 'Envoi vers un serveur externe sans authentification',
          detail:
            "Sans authentification, rien n'atteste que le serveur qui recoit les donnees est bien celui " +
            'que la structure a choisi, ni que la structure est bien celle qui envoie. La transmission ' +
            "n'est pas imputable.",
          reference: 'PGSSI-S (authentification des acteurs) ; RGPD art. 32.1.b ; HIPAA 45 CFR 164.312(d)',
          remedy: 'Configurer un jeton porteur ou un certificat client, le secret restant dans l environnement.',
        }),
      );
    }

    if (e.auth_mode !== 'none' && e.auth_mode !== 'mtls') {
      const name = (e.secret_env || '').trim();
      if (!name) {
        out.push(
          finding({
            code: 'SECRET_NON_DECLARE',
            level: 'warning',
            target: e.id,
            targetLabel: label,
            title: "Aucune variable d'environnement ne porte le secret",
            detail:
              `L'authentification « ${AUTH_MODE_LABELS[e.auth_mode]} » est demandee mais aucun nom de ` +
              "variable n'est renseigne. Les envois echoueront au moment de la transmission.",
            reference: 'PGSSI-S (gestion des secrets)',
            remedy: 'Indiquer le nom de la variable, par exemple FHIR_EXPORT_TOKEN, et la definir cote serveur.',
          }),
        );
      } else if (secretsPresent[name] === false) {
        out.push(
          finding({
            code: 'SECRET_ABSENT',
            level: 'warning',
            target: e.id,
            targetLabel: label,
            title: `La variable ${name} est declaree mais absente du serveur`,
            detail:
              `L'authentification renvoie a ${name}, qui n'est pas definie dans l'environnement de ce ` +
              'serveur. Les transmissions partiront sans en-tete d authentification et seront refusees.',
            reference: 'PGSSI-S (gestion des secrets)',
            remedy:
              `Ajouter ${name} dans .env.local puis redemarrer le serveur. Sa valeur n'est ni lue ni ` +
              'affichee ici, seule sa presence est verifiee.',
          }),
        );
      }
    }

    if (e.auth_mode === 'mtls') {
      out.push(
        finding({
          code: 'MTLS_NON_PORTE_PAR_L_APPLICATION',
          level: 'warning',
          target: e.id,
          targetLabel: label,
          title: 'Certificat client attendu, mais ParleDocteur n en presente aucun',
          detail:
            "Le mode mTLS est declare, or l'application n'embarque pas de certificat client : ses " +
            "requetes partiront sans, et le serveur distant les refusera — ou pire, les acceptera sans " +
            "authentifier l'emetteur. Le double sens du certificat doit etre porte par un composant " +
            'place devant.',
          reference: 'PGSSI-S (authentification des acteurs) ; RGPD art. 32.1.b',
          remedy:
            "Terminer le mTLS sur un proxy sortant (stunnel, nginx, Envoy) qui porte le certificat de " +
            "la structure, et pointer l'adresse declaree ici vers ce proxy. A defaut, utiliser un jeton " +
            'porteur.',
        }),
      );
    }

    if (e.auth_mode === 'basic' && e.scope === 'external') {
      out.push(
        finding({
          code: 'AUTHENTIFICATION_FAIBLE',
          level: 'warning',
          target: e.id,
          targetLabel: label,
          title: 'Authentification par mot de passe vers un serveur externe',
          detail:
            "L'en-tete Basic transporte un mot de passe reutilisable, qui ne peut etre revoque sans le " +
            'changer partout. Un jeton se revoque seul et se limite dans le temps.',
          reference: 'PGSSI-S ; NIST SP 800-63B',
          remedy: 'Demander au systeme distant un jeton de service, ou un certificat client.',
        }),
      );
    }
  }

  // ------------------------------------------------------- derogations

  const key = (code: string, target: string) => `${code}::${target}`;
  const waivers = new Map(derogations.map((d) => [key(d.code, d.target), d]));

  const findings = out.map((f) => {
    if (f.level !== 'restricted') return f;
    const w = waivers.get(key(f.code, f.target));
    return w ? { ...f, waived: w } : f;
  });

  const blocking = findings.filter((f) => f.level === 'blocking');
  const pending = findings.filter((f) => f.level === 'restricted' && !f.waived);
  const waived = findings.filter((f) => f.level === 'restricted' && f.waived);
  const warnings = findings.filter((f) => f.level === 'warning');

  return {
    findings,
    blocking,
    pending,
    waived,
    warnings,
    acceptable: blocking.length === 0 && pending.length === 0,
  };
}

/**
 * Deux chemins sont-ils sur le meme volume ?
 *
 * Comparaison volontairement grossiere — lettre de lecteur sous Windows,
 * premier segment sous POSIX. Un faux negatif se contente de ne pas alerter ;
 * un faux positif afficherait un avertissement injustifie, ce qui use la
 * vigilance plus surement qu'il ne la nourrit.
 */
export function sameVolume(a: string, b: string): boolean {
  const root = (p: string) => {
    const s = p.replace(/\\/g, '/').trim();
    const win = /^([a-z]):\//i.exec(s);
    if (win) return `win:${win[1].toLowerCase()}`;
    const unc = /^\/\/([^/]+)\/([^/]+)/.exec(s);
    if (unc) return `unc:${unc[1].toLowerCase()}/${unc[2].toLowerCase()}`;
    const posix = /^\/([^/]+)/.exec(s);
    if (posix) return `posix:/${posix[1]}`;
    return null;
  };
  const ra = root(a);
  const rb = root(b);
  return ra !== null && ra === rb;
}

/** Codes dont la levee reste possible, pour l'interface. */
export const DEROGABLE_CODES = [
  'RESEAU_SANS_TLS',
  'API_FHIR_SANS_AUTHENTIFICATION',
  'TRANSPORT_EN_CLAIR',
  'TRANSFERT_HORS_TERRITOIRE',
  'MODELE_TIERS_DONNEES_IDENTIFIANTES',
] as const;

/** Longueur minimale d'une justification de derogation. */
export const MIN_JUSTIFICATION = 30;
