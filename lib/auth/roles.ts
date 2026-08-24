/**
 * Roles, permissions et hierarchie des organisations.
 *
 * Le controle d'acces repose sur trois couches, dans cet ordre :
 *   1. le ROLE du compte donne un jeu de permissions par defaut ;
 *   2. un administrateur peut accorder ou retirer une permission a un compte
 *      precis (derogation individuelle, tracee) ;
 *   3. le CLOISONNEMENT par organisation limite ensuite ce que la permission
 *      permet de voir : un medecin autorise a lire les dossiers ne lit que
 *      ceux de son etablissement.
 *
 * La couche 3 n'est pas negociable par permission : c'est une regle de
 * confidentialite, pas un droit attribuable.
 */

export const ROLES = ['medecin', 'hopital', 'ministere', 'admin', 'super_admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  medecin: 'Medecin',
  hopital: 'Etablissement de sante',
  ministere: 'Ministere de la sante',
  admin: 'Administrateur plateforme',
  super_admin: 'Super-administrateur',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  medecin:
    "Consulte, enregistre et signe les dossiers des patients de son etablissement. Valide les ordonnances qu'il prescrit.",
  hopital:
    "Administre son etablissement : cree et valide les comptes des medecins, suit l'activite, exporte vers les systemes tiers.",
  ministere:
    "Acces national aux indicateurs agreges et a la surveillance epidemiologique. N'accede a aucun dossier nominatif.",
  admin:
    'Administre la plateforme : organisations, comptes, politique de mots de passe, sessions, journal.',
  super_admin:
    "Tous les droits, y compris la base de donnees, les serveurs et la matrice des permissions elle-meme.",
};

// --------------------------------------------------------------- permissions

export const PERMISSIONS = {
  // --- clinique
  'patient:read': 'Consulter les dossiers patients',
  'patient:write': 'Creer et modifier un dossier patient',
  'consultation:read': 'Consulter les consultations',
  'consultation:write': 'Enregistrer une consultation et son analyse',
  'consultation:sign': 'Signer un compte rendu de consultation',
  'prescription:validate': "Valider une ordonnance (acte de prescription)",
  'transcript:record': 'Capturer et transcrire une consultation',

  // --- interoperabilite
  'export:read': 'Generer et telecharger les exports FHIR / HL7 / DHIS2',
  'export:send': "Transmettre un export vers un systeme d'information tiers",

  // --- pilotage
  'stats:facility': "Voir les statistiques de son etablissement",
  'stats:national': 'Voir les indicateurs agreges nationaux',
  'surveillance:read': 'Acceder a la surveillance epidemiologique',

  // --- administration des comptes
  'org:read': 'Consulter les organisations',
  'org:write': 'Creer et modifier des organisations',
  'org:validate': 'Valider ou suspendre une organisation',
  'user:read': 'Consulter les comptes',
  'user:write': 'Creer et modifier des comptes',
  'user:validate': 'Valider, refuser ou suspendre un compte',
  'permission:manage': 'Modifier les droits attribues aux roles et aux comptes',
  'session:manage': 'Consulter et revoquer les sessions actives',

  // --- systeme
  'audit:read': "Consulter le journal d'audit",
  'policy:manage': "Configurer la politique d'acces (mots de passe, sessions, verrouillage)",
  'database:manage': 'Administrer la base de donnees (integrite, compactage, sauvegarde)',
  'server:manage': 'Consulter et configurer les serveurs et les integrations',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  {
    label: 'Clinique',
    permissions: [
      'patient:read',
      'patient:write',
      'consultation:read',
      'consultation:write',
      'consultation:sign',
      'prescription:validate',
      'transcript:record',
    ],
  },
  { label: 'Interoperabilite', permissions: ['export:read', 'export:send'] },
  { label: 'Pilotage', permissions: ['stats:facility', 'stats:national', 'surveillance:read'] },
  {
    label: 'Comptes et organisations',
    permissions: [
      'org:read',
      'org:write',
      'org:validate',
      'user:read',
      'user:write',
      'user:validate',
      'permission:manage',
      'session:manage',
    ],
  },
  { label: 'Systeme', permissions: ['audit:read', 'policy:manage', 'database:manage', 'server:manage'] },
];

/**
 * Matrice par defaut. Elle sert de valeur initiale : une fois en base, un
 * administrateur peut la modifier depuis la console.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  medecin: [
    'patient:read',
    'patient:write',
    'consultation:read',
    'consultation:write',
    'consultation:sign',
    'prescription:validate',
    'transcript:record',
    'export:read',
  ],
  hopital: [
    'patient:read',
    'consultation:read',
    'export:read',
    'export:send',
    'stats:facility',
    'user:read',
    'user:write',
    'user:validate',
    'session:manage',
    'audit:read',
    'org:read',
  ],
  // Le ministere pilote et surveille : aucun acces nominatif au dossier.
  ministere: ['stats:national', 'stats:facility', 'surveillance:read', 'org:read', 'export:read'],
  admin: [
    'org:read',
    'org:write',
    'org:validate',
    'user:read',
    'user:write',
    'user:validate',
    'session:manage',
    'audit:read',
    'policy:manage',
    'stats:national',
    'stats:facility',
  ],
  super_admin: [...ALL_PERMISSIONS],
};

// ----------------------------------------------------------- qui valide qui

/**
 * Un role ne peut valider que les roles situes sous lui. Sans cette regle, un
 * administrateur d'etablissement pourrait s'auto-promouvoir super-administrateur.
 */
export const VALIDATION_SCOPE: Record<Role, Role[]> = {
  medecin: [],
  hopital: ['medecin'],
  admin: ['medecin', 'hopital', 'ministere'],
  super_admin: ['medecin', 'hopital', 'ministere', 'admin', 'super_admin'],
  ministere: [],
};

export function canValidateRole(actor: Role, target: Role): boolean {
  return VALIDATION_SCOPE[actor]?.includes(target) ?? false;
}

/** Roles ouverts a l'inscription libre. On ne s'inscrit jamais administrateur. */
export const SELF_REGISTRABLE_ROLES: Role[] = ['medecin', 'hopital', 'ministere'];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

// -------------------------------------------------------------- organisations

export const ORG_TYPES = ['platform', 'ministry', 'hospital', 'health-center'] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  platform: 'Plateforme',
  ministry: 'Ministere',
  hospital: 'Hopital',
  'health-center': 'Centre de sante',
};

/** Type d'organisation attendu pour un role donne, a l'inscription. */
export const ROLE_ORG_TYPE: Partial<Record<Role, OrgType[]>> = {
  medecin: ['hospital', 'health-center'],
  hopital: ['hospital', 'health-center'],
  ministere: ['ministry'],
};

/**
 * Portee des donnees cliniques visibles par un role.
 *   own-org  : uniquement son etablissement
 *   national : indicateurs agreges, sans identite patient
 *   all      : toutes les organisations
 */
export type DataScope = 'own-org' | 'national' | 'all';

export const ROLE_DATA_SCOPE: Record<Role, DataScope> = {
  medecin: 'own-org',
  hopital: 'own-org',
  ministere: 'national',
  admin: 'all',
  super_admin: 'all',
};
