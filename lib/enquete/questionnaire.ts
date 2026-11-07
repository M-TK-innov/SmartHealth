/**
 * Questionnaire d'enquete usagers, et validation des reponses recues.
 *
 * CE QUE CE MODULE PROTEGE
 *
 * Le formulaire est servi par une page PUBLIQUE, sur un domaine que nous ne
 * controlons pas. N'importe qui peut donc envoyer n'importe quoi a la route
 * qui enregistre. Ce qui entre dans la base n'est pas ce que le formulaire
 * propose : c'est ce que CE module accepte.
 *
 * D'ou la forme retenue. Les questions et leurs options sont declarees une
 * fois, et trois choses s'en servent : la validation, le depouillement, et
 * le controle que le formulaire publie bien les memes valeurs. Une option
 * ajoutee a un seul endroit se voit immediatement.
 *
 * TROIS CHOIX QUI NE SONT PAS DES DETAILS
 *
 * 1. Une cle inconnue fait ECHOUER la reponse entiere, au lieu d'etre
 *    ignoree. Un champ ignore en silence, c'est une reponse a moitie perdue
 *    que personne ne remarque avant le depouillement.
 *
 * 2. Un texte libre trop long est REFUSE, pas tronque. Tronquer modifie ce
 *    qu'une personne a ecrit et le presente ensuite comme sa phrase.
 *
 * 3. Une reponse ou seul le centre est renseigne est refusee. Ce n'est pas
 *    une reponse, c'est un formulaire ouvert puis abandonne.
 *
 * Module PUR : ni base, ni horloge, ni reseau.
 */

export type Groupe = 'usager' | 'agent';

export interface Option {
  valeur: string;
  libelle: string;
}

export interface Question {
  cle: string;
  groupe: Groupe;
  numero: string;
  intitule: string;
  options: Option[];
}

/**
 * Les questions a choix unique, dans l'ordre du formulaire.
 *
 * Les valeurs sont courtes et stables : ce sont elles qui partent en base et
 * que l'on retrouvera dans deux mois. Les libelles, eux, peuvent etre
 * reformules sans rien casser.
 */
export const QUESTIONS: Question[] = [
  {
    cle: 'q1',
    groupe: 'usager',
    numero: '1',
    intitule: 'Carnet de sante lors de la derniere visite',
    options: [
      { valeur: 'avait', libelle: "Oui, je l'avais" },
      { valeur: 'oublie', libelle: 'Non, oublie' },
      { valeur: 'perdu', libelle: 'Non, perdu ou abime' },
      { valeur: 'aucun', libelle: "Non, je n'en ai pas" },
      { valeur: 'plein', libelle: 'Non, il etait plein' },
    ],
  },
  {
    cle: 'q2',
    groupe: 'usager',
    numero: '2',
    intitule: 'Informations deja donnees et redemandees',
    options: [
      { valeur: 'non', libelle: 'Non' },
      { valeur: 'partie', libelle: 'Oui, une partie' },
      { valeur: 'tout', libelle: 'Oui, tout a ete redemande' },
    ],
  },
  {
    cle: 'q3',
    groupe: 'usager',
    numero: '3',
    intitule: 'Documents a apporter ou presenter',
    options: [
      { valeur: '0', libelle: 'Aucun' },
      { valeur: '1', libelle: '1' },
      { valeur: '2', libelle: '2' },
      { valeur: '3', libelle: '3' },
      { valeur: '4+', libelle: '4 ou plus' },
    ],
  },
  {
    cle: 'q4',
    groupe: 'usager',
    numero: '4',
    intitule: 'Examen redemande faute de resultat sous la main',
    options: [
      { valeur: 'non', libelle: 'Non' },
      { valeur: 'une', libelle: 'Oui, une fois' },
      { valeur: 'plusieurs', libelle: 'Oui, deux fois ou plus' },
      { valeur: 'inconnu', libelle: 'Je ne sais pas' },
    ],
  },
  {
    cle: 'q5',
    groupe: 'usager',
    numero: '5',
    intitule: 'Deplacement uniquement pour un papier',
    options: [
      { valeur: 'non', libelle: 'Non' },
      { valeur: 'une', libelle: 'Oui, une fois' },
      { valeur: 'deux-trois', libelle: 'Oui, deux ou trois fois' },
      { valeur: 'plus', libelle: 'Oui, plus de trois fois' },
    ],
  },
  {
    cle: 'q6',
    groupe: 'usager',
    numero: '6',
    intitule: 'Ordonnances et factures consultables sur le telephone',
    options: [
      { valeur: 'oui', libelle: 'Oui' },
      { valeur: 'non', libelle: 'Non' },
      { valeur: 'sans-telephone', libelle: "Je n'ai pas de telephone qui le permet" },
    ],
  },
  {
    cle: 'a1',
    groupe: 'agent',
    numero: 'A1',
    intitule: 'Memes informations ecrites a plusieurs endroits',
    options: [
      { valeur: 'non', libelle: 'Non' },
      { valeur: 'deux', libelle: 'Oui, deux fois' },
      { valeur: 'trois+', libelle: 'Oui, trois fois ou plus' },
    ],
  },
  {
    cle: 'a2',
    groupe: 'agent',
    numero: 'A2',
    intitule: 'Temps de preparation du rapport mensuel',
    options: [
      { valeur: 'heure', libelle: "Moins d'une heure" },
      { valeur: 'demi', libelle: 'Une demi-journee' },
      { valeur: 'jour', libelle: 'Une journee' },
      { valeur: 'plus', libelle: "Plus d'une journee" },
    ],
  },
  {
    cle: 'a3',
    groupe: 'agent',
    numero: 'A3',
    intitule: 'Rapport transmis a la date prevue',
    options: [
      { valeur: 'toujours', libelle: 'Toujours' },
      { valeur: 'souvent', libelle: 'Souvent' },
      { valeur: 'rarement', libelle: 'Rarement' },
    ],
  },
  {
    cle: 'a4',
    groupe: 'agent',
    numero: 'A4',
    intitule: "Information redemandee au patient alors qu'elle figure au dossier",
    options: [
      { valeur: 'non', libelle: 'Non' },
      { valeur: 'parfois', libelle: 'Parfois' },
      { valeur: 'souvent', libelle: 'Souvent' },
    ],
  },
];

export interface ChampLibre {
  cle: string;
  intitule: string;
  maximum: number;
  /** Un champ de contexte ne vaut pas, a lui seul, une reponse. */
  compteCommeReponse: boolean;
}

export const CHAMPS_LIBRES: ChampLibre[] = [
  { cle: 'centre', intitule: 'Centre de sante', maximum: 80, compteCommeReponse: false },
  { cle: 'libre', intitule: 'Une chose a ajouter', maximum: 200, compteCommeReponse: true },
  {
    cle: 'a5',
    intitule: 'Ce qui ferait gagner le plus de temps',
    maximum: 200,
    compteCommeReponse: true,
  },
];

/** Toutes les cles acceptees, et aucune autre. */
export const CLES: string[] = [
  ...QUESTIONS.map((q) => q.cle),
  ...CHAMPS_LIBRES.map((c) => c.cle),
];

export type Reponse = Record<string, string | null>;

export type Refus = { ok: false; motif: string };
export type Issue<T> = { ok: true; resultat: T } | Refus;

/**
 * Met un texte libre sous sa forme stockee.
 *
 * Les caracteres de controle sautent : ils ne s'affichent pas, ils ne se
 * voient pas a la relecture, et ils servent surtout a maquiller du texte.
 * Les espaces de bord aussi : « CS Calavi » et « CS Calavi  » sont le meme
 * centre, et les compter separement fausserait le depouillement.
 */
export function nettoyerTexte(brut: string): string {
  return brut
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Valide une reponse recue du formulaire public.
 *
 * Rend la ligne prete a inserer, ou le motif du refus. Le motif est destine
 * au journal du serveur, pas au navigateur : dire a un envoi automatise
 * quelle cle lui a manque, c'est lui expliquer comment reussir.
 */
export function valider(brut: unknown): Issue<Reponse> {
  if (brut === null || typeof brut !== 'object' || Array.isArray(brut)) {
    return { ok: false, motif: 'Charge utile absente ou mal formee.' };
  }

  const entree = brut as Record<string, unknown>;

  for (const cle of Object.keys(entree)) {
    if (!CLES.includes(cle)) return { ok: false, motif: `Champ inconnu : ${cle}.` };
  }

  const sortie: Reponse = {};
  let repondue = false;

  for (const question of QUESTIONS) {
    const valeur = entree[question.cle];
    if (valeur === undefined || valeur === null || valeur === '') {
      sortie[question.cle] = null;
      continue;
    }
    if (typeof valeur !== 'string') {
      return { ok: false, motif: `${question.cle} : valeur non textuelle.` };
    }
    if (!question.options.some((o) => o.valeur === valeur)) {
      return { ok: false, motif: `${question.cle} : option hors liste.` };
    }
    sortie[question.cle] = valeur;
    repondue = true;
  }

  for (const champ of CHAMPS_LIBRES) {
    const valeur = entree[champ.cle];
    if (valeur === undefined || valeur === null || valeur === '') {
      sortie[champ.cle] = null;
      continue;
    }
    if (typeof valeur !== 'string') {
      return { ok: false, motif: `${champ.cle} : valeur non textuelle.` };
    }
    const propre = nettoyerTexte(valeur);
    if (propre === '') {
      sortie[champ.cle] = null;
      continue;
    }
    if (propre.length > champ.maximum) {
      // Refus et non troncature : une phrase coupee serait ensuite citee
      // comme la phrase de quelqu'un.
      return { ok: false, motif: `${champ.cle} : au-dela de ${champ.maximum} caracteres.` };
    }
    sortie[champ.cle] = propre;
    if (champ.compteCommeReponse) repondue = true;
  }

  if (!repondue) {
    return { ok: false, motif: 'Aucune reponse : formulaire vide.' };
  }

  return { ok: true, resultat: sortie };
}

// ----------------------------------------------------------- depouillement

export interface Decompte {
  valeur: string;
  libelle: string;
  nombre: number;
}

export interface QuestionDepouillee {
  cle: string;
  numero: string;
  groupe: Groupe;
  intitule: string;
  /** Reponses exprimees sur cette question, hors non-reponses. */
  exprimees: number;
  decomptes: Decompte[];
}

/**
 * Depouille un ensemble de reponses.
 *
 * CHAQUE QUESTION A SA PROPRE BASE. Une personne peut avoir repondu aux six
 * questions usager et a aucune question agent. Rapporter tous les
 * pourcentages au nombre total de formulaires donnerait des chiffres faux,
 * et toujours dans le meme sens : a la baisse.
 *
 * Le pourcentage n'est pas calcule ici. Il se calcule a l'affichage, a
 * partir de `exprimees`, pour que la base du calcul reste sous les yeux.
 */
export function depouiller(lignes: Reponse[]): QuestionDepouillee[] {
  return QUESTIONS.map((question) => {
    const decomptes: Decompte[] = question.options.map((o) => ({
      valeur: o.valeur,
      libelle: o.libelle,
      nombre: 0,
    }));
    let exprimees = 0;

    for (const ligne of lignes) {
      const valeur = ligne[question.cle];
      if (valeur === null || valeur === undefined) continue;
      const cible = decomptes.find((d) => d.valeur === valeur);
      // Une valeur hors liste ne peut venir que d'une option retiree du
      // questionnaire apres coup. On ne l'invente pas dans le depouillement :
      // elle est absente des decomptes, et donc absente du total exprime.
      if (!cible) continue;
      cible.nombre += 1;
      exprimees += 1;
    }

    return {
      cle: question.cle,
      numero: question.numero,
      groupe: question.groupe,
      intitule: question.intitule,
      exprimees,
      decomptes,
    };
  });
}
