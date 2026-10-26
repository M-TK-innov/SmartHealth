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

  // --- parcours du patient et caisse
  'flux:read': "Voir les files d'attente et la tension des postes",
  'flux:write': 'Placer, appeler et orienter un patient dans les files',
  'caisse:read': 'Consulter une facture et son reste a charge',
  'caisse:write': 'Facturer un acte et encaisser un paiement',
  'pharmacie:read': 'Consulter le stock de pharmacie',
  'pharmacie:dispense': 'Dispenser un medicament a un patient',
  'pharmacie:stock': 'Enregistrer une livraison et retirer les lots perimes',
  'plateau:read': 'Consulter les demandes et resultats d examen',
  'plateau:write': 'Prelever, saisir et corriger un resultat',
  'plateau:acquitter': 'Acquitter une valeur critique au nom d un soignant joint',
  'bloc:read': 'Consulter le programme operatoire',
  'bloc:write': 'Programmer une intervention et conduire sa checklist',

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
  {
    label: 'Parcours et caisse',
    permissions: ['flux:read', 'flux:write', 'caisse:read', 'caisse:write'],
  },
  {
    label: 'Pharmacie',
    permissions: ['pharmacie:read', 'pharmacie:dispense', 'pharmacie:stock'],
  },
  {
    label: 'Plateau technique et bloc',
    permissions: ['plateau:read', 'plateau:write', 'plateau:acquitter', 'bloc:read', 'bloc:write'],
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
    // Le medecin appelle son patient suivant et VOIT le reste a charge — pour
    // pouvoir en parler et orienter — mais il n'encaisse pas. Separer celui
    // qui soigne de celui qui tient la caisse est une regle de controle
    // interne elementaire, et elle protege aussi le medecin.
    'flux:read',
    'flux:write',
    'caisse:read',
    // Il VOIT le stock — prescrire ce qui est en rupture fait revenir le
    // patient pour rien — mais il ne dispense pas et n'y touche pas.
    'pharmacie:read',
    // Il demande les examens, lit les resultats et acquitte ce qu'on lui
    // transmet. Il ne SAISIT pas de resultat : ce n'est pas son poste, et
    // confondre les deux retire au laboratoire la responsabilite de ce
    // qu'il rend.
    'plateau:read',
    'plateau:acquitter',
    'bloc:read',
    'bloc:write',
  ],
  hopital: [
    'patient:read',
    'consultation:read',
    'flux:read',
    'flux:write',
    'caisse:read',
    'caisse:write',
    'pharmacie:read',
    'pharmacie:dispense',
    'pharmacie:stock',
    'plateau:read',
    'plateau:write',
    'plateau:acquitter',
    'bloc:read',
    'bloc:write',
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

// ------------------------------------------- rattrapage a la mise a jour

export interface EtatMatrice {
  /** Permissions deja amorcees au moins une fois (table permission_amorcee). */
  dejaAmorcees: string[];
  /** Permissions presentes aujourd'hui sur au moins un role. */
  presentesEnBase: string[];
}

export interface Rattrapage {
  aAccorder: { role: Role; permission: Permission }[];
  aMarquer: Permission[];
}

/**
 * Ce qu'une mise a jour doit accorder, et rien de plus.
 *
 * Fonction PURE : elle ne lit ni n'ecrit la base. C'est la partie qui decide,
 * et c'est elle qu'on peut eprouver — le code qui ecrit n'a plus qu'a
 * appliquer.
 *
 * LA REGLE : on n'accorde QUE les permissions jamais amorcees. Une
 * permission deja connue et aujourd'hui absente a ete retiree par un
 * administrateur ; une mise a jour n'a pas a defaire sa decision.
 *
 * Il n'y a pas de cas particulier pour l'installation neuve : une matrice
 * vide n'a rien d'amorce, donc TOUT y est nouveau, et la regle generale pose
 * la matrice par defaut d'elle-meme. Une branche dediee donnerait le meme
 * resultat par un autre chemin — c'est-a-dire un chemin de moins a eprouver.
 *
 * Angle mort assume, documente ici parce qu'il doit se lire avec la regle :
 * sur une base anterieure a la table de suivi, l'historique est reconstitue
 * a partir des permissions encore presentes. Une permission retiree de TOUS
 * les roles — super-administrateur compris, qui les a toutes par defaut —
 * passe donc pour jamais amorcee et sera accordee une fois. Le cas est
 * etroit ; le defaut inverse, un module muet apres mise a jour, coute bien
 * plus cher a un etablissement.
 */
export function rattrapage(etat: EtatMatrice): Rattrapage {
  // Si la table de suivi est vide, on reconstitue l'historique a partir des
  // droits encore presents : c'est une base anterieure a son introduction.
  const connues = new Set(etat.dejaAmorcees.length > 0 ? etat.dejaAmorcees : etat.presentesEnBase);
  const nouvelles = ALL_PERMISSIONS.filter((p) => !connues.has(p));

  if (nouvelles.length === 0) {
    // Cas de tous les demarrages ordinaires : rien a accorder. On ne marque
    // que si la table de suivi est encore vide, pour qu'un lancement
    // ordinaire ne reecrive pas la matrice d'acces a chaque fois.
    return { aAccorder: [], aMarquer: etat.dejaAmorcees.length === 0 ? [...ALL_PERMISSIONS] : [] };
  }

  return {
    aAccorder: ROLES.flatMap((role) =>
      DEFAULT_ROLE_PERMISSIONS[role]
        .filter((permission) => nouvelles.includes(permission))
        .map((permission) => ({ role, permission })),
    ),
    aMarquer: [...ALL_PERMISSIONS],
  };
}

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
