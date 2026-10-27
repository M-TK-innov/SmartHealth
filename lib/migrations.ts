/**
 * Migrations additives de la base.
 *
 * `CREATE TABLE IF NOT EXISTS` ne touche pas une table deja creee : une base
 * installee avant l'ajout d'une colonne ne l'aurait jamais. On ajoute donc
 * explicitement les colonnes manquantes. UNIQUEMENT DES AJOUTS : on ne
 * supprime ni ne renomme rien dans une base de dossiers medicaux.
 *
 * L'ORDRE EST LA RAISON D'ETRE DE CE FICHIER. Le schema s'applique d'abord,
 * les colonnes manquantes ensuite. Un index declare dans le schema sur une
 * colonne qui n'arrive qu'a la migration echoue donc AVANT que la colonne
 * n'existe — et la base ne s'ouvre plus du tout. Le defaut est invisible en
 * developpement, ou la base est toujours neuve, et bloque chaque
 * etablissement deja installe. Les index portant sur une colonne migree se
 * declarent ici, et pas dans le schema.
 *
 * Module sans dependance : il s'eprouve hors de l'application.
 */

/** [table, colonne, definition SQL] */
export const COLONNES_AJOUTEES: [table: string, colonne: string, definition: string][] = [
  ['patient', 'organization_id', 'TEXT'],
  ['consultation', 'organization_id', 'TEXT'],
  ['transcript_segment', 'speaker_source', "TEXT DEFAULT 'auto'"],
  ['transcript_segment', 'speaker_confidence', 'REAL'],
  ['transcript_segment', 'pitch_hz', 'REAL'],
  ['transcript_segment', 'source_text', 'TEXT'],
  ['transcript_segment', 'source_language', 'TEXT'],
  // Rattache une consultation au sejour pendant lequel elle a eu lieu.
  // Sans ce lien, le dossier d'une hospitalisation est une liste de
  // consultations qu'il faut recoller a la main par les dates — et une
  // consultation externe du meme jour s'y glisse sans qu'on le voie.
  // Nullable : une consultation externe n'appartient a aucun sejour, et
  // c'est une situation normale, pas une donnee manquante.
  ['consultation', 'sejour_id', 'TEXT'],
  // Fuseau de l'etablissement, detecte au premier demarrage depuis la
  // machine qui sert l'application — un serveur de dispensaire tourne
  // dans le dispensaire. Nullable : tant qu'il est vide, la detection
  // repasse, et un responsable peut le corriger depuis la console.
  ['organization', 'fuseau', 'TEXT'],
];

/**
 * Index portant sur une colonne ajoutee ci-dessus.
 *
 * Ils s'executent APRES les ALTER TABLE. Les declarer dans le schema
 * empecherait toute base existante de s'ouvrir.
 */
export const INDEX_APRES_MIGRATION: string[] = [
  'CREATE INDEX IF NOT EXISTS idx_consult_sejour ON consultation(sejour_id)',
];

/** Le strict minimum attendu d'une base, pour que ce module reste testable. */
export interface BaseMigrable {
  prepare(sql: string): { all(): unknown[] };
  exec(sql: string): void;
}

/**
 * Applique les migrations. Idempotent : on peut l'appeler a chaque ouverture.
 *
 * Rend la liste de ce qui a ete fait, pour qu'un appelant puisse le
 * journaliser — une colonne qui apparait sans trace est une colonne que
 * personne ne saura expliquer dans six mois.
 */
export function appliquerMigrations(base: BaseMigrable): string[] {
  const faites: string[] = [];

  const colonnes = (table: string): string[] => {
    try {
      return (base.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
        (c) => c.name,
      );
    } catch {
      return [];
    }
  };

  for (const [table, colonne, definition] of COLONNES_AJOUTEES) {
    const existantes = colonnes(table);
    // existantes vide = la table n'existe pas encore : il n'y a rien a
    // migrer, le schema vient de la creer avec toutes ses colonnes.
    if (existantes.length && !existantes.includes(colonne)) {
      base.exec(`ALTER TABLE ${table} ADD COLUMN ${colonne} ${definition}`);
      faites.push(`${table}.${colonne}`);
    }
  }

  for (const sql of INDEX_APRES_MIGRATION) {
    base.exec(sql);
  }

  return faites;
}
