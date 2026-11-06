/**
 * Compteur d'allegement administratif.
 *
 * A QUOI IL SERT
 *
 * Un dossier de simplification affirme que l'usager gagne du temps et des
 * deplacements. Tant que ce n'est pas compte, c'est une promesse. Ce module
 * compte, et surtout il compte d'une maniere qui resiste a la lecture d'un
 * evaluateur hostile.
 *
 * TROIS REGLES, ET LA DEUXIEME EST LA PLUS IMPORTANTE
 *
 * 1. RIEN DE NOMINATIF. Les evenements ne portent ni patient, ni
 *    consultation, ni soignant : une structure, un jour, un type, une
 *    quantite. Un compteur que l'on peut remonter jusqu'a une personne est
 *    un second dossier medical, avec une garde plus faible que le premier.
 *
 * 2. CE QUI EST CONSTATE N'EST PAS CE QUI EST INFERE. Qu'une facture ait ete
 *    consultee a distance, on le CONSTATE : la requete a eu lieu. Qu'un
 *    examen n'ait pas ete refait, on ne l'observe jamais, on l'INFERE, parce
 *    que le contrefactuel est inconnaissable. Le resume separe donc les deux
 *    familles et refuse de les additionner. Un rapport qui melange une mesure
 *    et une hypothese se fait demolir sur la premiere question, et emporte
 *    avec lui le reste du dossier.
 *
 * 3. ON NE COMPTE QUE L'ALLEGEMENT REEL. Une information presente en base
 *    mais jamais presentee au soignant n'a allege personne : elle mesure le
 *    remplissage de la base, pas le service rendu. Un evenement ne compte
 *    donc que si la donnee etait DISPONIBLE et qu'elle a ete PRESENTEE.
 *
 * Module PUR : ni base, ni horloge.
 */

export type TypeAllegement =
  /** Une information deja connue a ete presentee au soignant, donc non redemandee a l'usager. */
  | 'antecedent-non-redemande'
  /** Un resultat d'examen anterieur etait disponible et a ete presente au point de soin. */
  | 'resultat-anterieur-presente'
  /** Une ordonnance ou une facture a ete consultee hors de la structure. */
  | 'consultation-a-distance'
  /** Un rapport destine au niveau central a ete produit sans ressaisie. */
  | 'rapport-produit-sans-ressaisie';

export type Nature = 'constate' | 'infere';

/**
 * Ce que chaque type est vraiment.
 *
 * `constate` : l'evenement a eu lieu et le systeme en est temoin direct.
 * `infere`   : le systeme observe une condition, et l'allegement en est
 *              deduit. La deduction est raisonnable, elle n'est pas une
 *              observation, et le resume le dira.
 */
export const NATURES: Record<TypeAllegement, Nature> = {
  // On constate que l'information a ete affichee au soignant. Qu'il ne l'ait
  // pas redemandee oralement, on ne peut que le supposer.
  'antecedent-non-redemande': 'infere',
  // Idem : le resultat etait la et a ete ouvert. Que l'examen eut ete refait
  // sans lui reste une hypothese, raisonnable mais non verifiee.
  'resultat-anterieur-presente': 'infere',
  // La requete a eu lieu, depuis l'exterieur. Le deplacement epargne est
  // deduit, mais la consultation a distance, elle, est un fait.
  'consultation-a-distance': 'constate',
  // Le rapport a ete produit par la machine. La ressaisie evitee est un fait.
  'rapport-produit-sans-ressaisie': 'constate',
};

export const TYPES: TypeAllegement[] = Object.keys(NATURES) as TypeAllegement[];

/** Libelle lisible, pour la restitution. */
export const LIBELLES: Record<TypeAllegement, string> = {
  'antecedent-non-redemande': 'Informations deja connues, presentees au soignant',
  'resultat-anterieur-presente': 'Resultats anterieurs disponibles au point de soin',
  'consultation-a-distance': 'Consultations de documents hors de la structure',
  'rapport-produit-sans-ressaisie': 'Rapports produits sans ressaisie',
};

export interface EvenementCandidat {
  type: TypeAllegement;
  /** La donnee existait-elle, venue d'un episode anterieur ? */
  disponible: boolean;
  /** A-t-elle ete effectivement presentee, ouverte, utilisee ? */
  presentee: boolean;
  quantite: number;
}

/**
 * Cet evenement merite-t-il d'etre compte ?
 *
 * Les deux conditions sont exigees ensemble. Disponible sans presentee, c'est
 * du remplissage de base ; presentee sans disponible n'a pas de sens, et
 * signale un appelant qui s'est trompe.
 */
export function qualifie(e: EvenementCandidat): boolean {
  if (!TYPES.includes(e.type)) return false;
  if (!Number.isInteger(e.quantite) || e.quantite <= 0) return false;
  return e.disponible && e.presentee;
}

export interface Evenement {
  type: TypeAllegement;
  quantite: number;
}

export interface Resume {
  /** Faits observes, defendables tels quels. */
  constate: { type: TypeAllegement; libelle: string; quantite: number }[];
  /** Deductions raisonnables, presentees comme telles. */
  infere: { type: TypeAllegement; libelle: string; quantite: number }[];
  totalConstate: number;
  totalInfere: number;
}

/**
 * Agrege des evenements en un resume.
 *
 * Il n'existe DELIBEREMENT pas de total general. Additionner un fait et une
 * hypothese produit un nombre qui n'est ni l'un ni l'autre, et c'est
 * exactement le chiffre qu'on citerait ensuite partout.
 */
export function agreger(evenements: Evenement[]): Resume {
  // Aucun filtre sur le type ici : `parNature` ne parcourt que les types
  // connus, donc un type inconnu n'atteint jamais la sortie. Le garde-fou
  // qui se trouvait a cet endroit ne changeait aucun comportement, et une
  // mutation l'a montre en survivant.
  const cumul = new Map<TypeAllegement, number>();
  for (const e of evenements) {
    if (!Number.isInteger(e.quantite) || e.quantite <= 0) continue;
    cumul.set(e.type, (cumul.get(e.type) ?? 0) + e.quantite);
  }

  const parNature = (n: Nature) =>
    TYPES.filter((t) => NATURES[t] === n && cumul.has(t)).map((t) => ({
      type: t,
      libelle: LIBELLES[t],
      quantite: cumul.get(t)!,
    }));

  const constate = parNature('constate');
  const infere = parNature('infere');

  return {
    constate,
    infere,
    totalConstate: constate.reduce((n, l) => n + l.quantite, 0),
    totalInfere: infere.reduce((n, l) => n + l.quantite, 0),
  };
}

/**
 * Met le resume en phrases, sans le surjouer.
 *
 * La formulation est la moitie du travail : « 412 examens evites » serait
 * faux, « 412 resultats anterieurs etaient disponibles au point de soin »
 * est vrai et se defend devant quiconque.
 */
export function formuler(r: Resume): string[] {
  const phrases: string[] = [];

  if (r.totalConstate === 0 && r.totalInfere === 0) {
    return ['Aucun allegement mesure sur la periode.'];
  }

  for (const l of r.constate) {
    phrases.push(`${l.quantite} ${l.libelle.toLowerCase()} (constate).`);
  }
  for (const l of r.infere) {
    phrases.push(`${l.quantite} ${l.libelle.toLowerCase()} (deduit, non observe).`);
  }

  phrases.push(
    'Les lignes marquees « deduit » decrivent une condition observee dont ' +
      "l'allegement est infere : le systeme ne peut pas savoir ce qui se " +
      'serait passe sans lui.',
  );

  return phrases;
}
