/**
 * Verification des prerequis, au premier lancement.
 *
 * Elle ne s'adresse pas a un developpeur mais au responsable qui installe
 * l'application dans une structure de soin, souvent sans informaticien
 * derriere lui. Deux consequences sur la forme :
 *
 *   - chaque constat dit CE QU'IL EMPECHE, pas ce qui manque. « Node 20 »
 *     n'apprend rien ; « l'application ne demarrera pas » se comprend.
 *   - chaque constat porte un remede applicable sur place.
 *
 * TROIS NIVEAUX, et ils ne se negocient pas :
 *
 *   bloquant    l'application ne peut pas fonctionner. On le dit avant que le
 *               responsable ne saisisse quoi que ce soit, pas apres.
 *   limitant    l'application fonctionne, mais une capacite manque. Le cas le
 *               plus frequent : pas de microphone utilisable, donc pas de
 *               dictee — le reste du dossier medical marche.
 *   remarque    rien n'est empeche ; c'est une information de deploiement.
 *
 * Module PUR : il recoit un releve de l'environnement et rend des constats. La
 * collecte, elle, depend de la plateforme et vit ailleurs. C'est ce qui permet
 * de tester les regles sur des environnements qu'on n'a pas sous la main —
 * un poste Linux sans Python, un macOS sans micro — sans les simuler a moitie.
 */

export type NiveauPrerequis = 'bloquant' | 'limitant' | 'remarque';

export interface Releve {
  /** 'win32' | 'darwin' | 'linux' — tel que Node le rapporte. */
  plateforme: string;
  /** Version majeure de Node qui execute le serveur. */
  nodeMajeur: number;
  /** Memoire vive totale, en Mo. */
  memoireMo: number;
  /** Espace libre sur le volume de la base, en Mo. `null` si non mesurable. */
  disqueLibreMo: number | null;
  /** Le dossier de donnees est-il accessible en ecriture ? */
  donneesInscriptibles: boolean;
  /** Chemin du dossier de donnees, pour le message. */
  cheminDonnees: string;
  /** L'origine servie est-elle sure au sens des navigateurs (https ou localhost) ? */
  origineSure: boolean;
  /** Adresse par laquelle l'application est jointe, pour le message. */
  origine: string;
  /** Le modele Whisper est-il present sur le poste (pas a telecharger) ? */
  whisperLocalPresent: boolean;
  /** Interprete Python trouve, pour le service de transcription en langue locale. */
  pythonPresent: boolean;
  /** Modules Python manquants parmi ceux qu'exige le service. */
  pythonModulesManquants: string[];
  /** Le service de transcription en langue locale est-il installe sur ce poste ? */
  serviceLangueLocalePresent: boolean;
  /** Une cle de modele de langage est-elle configuree ? */
  cleModeleLangage: boolean;
}

export interface ConstatPrerequis {
  code: string;
  niveau: NiveauPrerequis;
  titre: string;
  /** Ce que cela empeche, en clair. */
  detail: string;
  /** Ce qu'il faut faire, applicable sur place. */
  remede: string;
}

/** Version de Node sous laquelle le serveur ne demarre pas. */
export const NODE_MINIMUM = 22;
/** En dessous, SQLite et le modele sur appareil se disputent la memoire. */
export const MEMOIRE_MINIMALE_MO = 2048;
export const MEMOIRE_CONFORTABLE_MO = 4096;
/** La base et ses sauvegardes grossissent ; en dessous, l'ecriture echouera bientot. */
export const DISQUE_MINIMUM_MO = 500;
export const DISQUE_CONFORTABLE_MO = 2048;

function constat(c: ConstatPrerequis): ConstatPrerequis {
  return c;
}

/**
 * Confronte un releve aux prerequis.
 *
 * L'ordre du tableau rendu est l'ordre de lecture : bloquants d'abord, parce
 * que c'est ce qui decide si l'installation peut continuer.
 */
export function verifier(r: Releve): ConstatPrerequis[] {
  const constats: ConstatPrerequis[] = [];

  // Les regles sont groupees PAR SUJET, pas par gravite : une regle neuve
  // se pose a cote de celles qui parlent de la meme chose, sans avoir a se
  // demander ou son niveau la place dans la lecture. Le tri final s en charge.

  // --- STOCKAGE : ou les dossiers sont ecrits ------------------------------
  if (!r.donneesInscriptibles) {
    constats.push(
      constat({
        code: 'DONNEES_NON_INSCRIPTIBLES',
        niveau: 'bloquant',
        titre: "Le dossier des donnees n'est pas accessible en ecriture",
        detail:
          `Rien ne peut etre enregistre dans ${r.cheminDonnees} : ni consultation, ni compte, ni compte rendu. ` +
          "L'application s'ouvrirait pour perdre tout ce qu'on y saisit.",
        remede:
          'Donner le droit d ecriture au compte qui fait tourner l application sur ce dossier, ' +
          'ou designer un autre emplacement avec la variable PARLEDOCTEUR_DB.',
      }),
    );
  }
  if (r.disqueLibreMo !== null && r.disqueLibreMo < DISQUE_MINIMUM_MO) {
    constats.push(
      constat({
        code: 'DISQUE_INSUFFISANT',
        niveau: 'bloquant',
        titre: `Il reste ${r.disqueLibreMo} Mo sur le disque`,
        detail:
          'La base, ses sauvegardes et les fichiers temporaires ne tiendront pas. ' +
          'Une ecriture qui echoue en pleine consultation peut laisser un dossier incomplet.',
        remede: `Liberer de l espace : ${DISQUE_CONFORTABLE_MO} Mo au moins, davantage si les sauvegardes restent sur ce poste.`,
      }),
    );
  }
  if (r.disqueLibreMo !== null && r.disqueLibreMo >= DISQUE_MINIMUM_MO && r.disqueLibreMo < DISQUE_CONFORTABLE_MO) {
    constats.push(
      constat({
        code: 'DISQUE_JUSTE',
        niveau: 'remarque',
        titre: `Il reste ${Math.round(r.disqueLibreMo / 1024)} Go sur le disque`,
        detail: 'Suffisant pour demarrer, mais les sauvegardes s accumulent et la base grossit avec l activite.',
        remede: 'Prevoir de deplacer les sauvegardes vers un support externe, ou surveiller cet espace.',
      }),
    );
  }

  // --- PLATEFORME : ce qui fait tourner le serveur -------------------------
  if (r.nodeMajeur > 0 && r.nodeMajeur < NODE_MINIMUM) {
    constats.push(
      constat({
        code: 'NODE_TROP_ANCIEN',
        niveau: 'bloquant',
        titre: `Node ${r.nodeMajeur} est trop ancien`,
        detail:
          `La base de donnees utilise le module SQLite integre a Node, apparu en version ${NODE_MINIMUM}. ` +
          'Sur cette version, le serveur ne demarre pas du tout.',
        remede:
          `Installer Node ${NODE_MINIMUM} ou plus recent (nodejs.org). ` +
          "L'application desktop embarque sa propre version et n'est pas concernee.",
      }),
    );
  }
  if (r.memoireMo > 0 && r.memoireMo < MEMOIRE_MINIMALE_MO) {
    constats.push(
      constat({
        code: 'MEMOIRE_FAIBLE',
        niveau: 'limitant',
        titre: `Ce poste dispose de ${Math.round(r.memoireMo / 1024)} Go de memoire`,
        detail:
          'La transcription sur appareil charge un modele en memoire. En dessous de 2 Go, ' +
          'elle ralentira le poste au point de gener la consultation.',
        remede:
          'Utiliser la reconnaissance du navigateur ou un serveur de transcription de la structure, ' +
          'qui ne demandent rien a ce poste.',
      }),
    );
  }
  if (r.memoireMo >= MEMOIRE_MINIMALE_MO && r.memoireMo < MEMOIRE_CONFORTABLE_MO) {
    constats.push(
      constat({
        code: 'MEMOIRE_JUSTE',
        niveau: 'remarque',
        titre: `Ce poste dispose de ${Math.round(r.memoireMo / 1024)} Go de memoire`,
        detail: 'La transcription sur appareil fonctionnera, mais laissez peu d autres applications ouvertes.',
        remede: 'Aucune action necessaire.',
      }),
    );
  }

  // --- RESEAU : par quelle adresse on joint l application ------------------
  if (!r.origineSure) {
    constats.push(
      constat({
        code: 'ORIGINE_NON_SURE',
        niveau: 'limitant',
        titre: 'Le microphone sera refuse depuis les autres postes',
        detail:
          `L application est servie sur ${r.origine}, que les navigateurs ne considerent pas comme une origine sure. ` +
          'Ils reservent le microphone a HTTPS et a localhost : la dictee ne fonctionnera que sur ce poste-ci. ' +
          'La saisie manuelle, elle, reste disponible partout.',
        remede:
          'Placer un proxy TLS (Caddy, nginx) devant l application et declarer son adresse en https://, ' +
          'ou n utiliser la dictee que depuis le poste qui heberge.',
      }),
    );
  }

  // --- MOTEURS : ce qui ecoute et ce qui analyse ---------------------------
  if (!r.whisperLocalPresent) {
    constats.push(
      constat({
        code: 'MODELE_LOCAL_ABSENT',
        niveau: 'limitant',
        titre: 'Le modele de transcription sur appareil doit etre telecharge',
        detail:
          "Le moteur qui transcrit sans rien envoyer hors du poste n'est pas present. " +
          'Il se telecharge au premier usage, ce qui demande une connexion Internet : ' +
          'sur un poste isole, ce moteur restera indisponible.',
        remede:
          'Installer la version desktop, qui embarque le modele, ou connecter le poste une fois ' +
          'le temps du telechargement (environ 85 Mo, garde en cache ensuite).',
      }),
    );
  }
  if (r.serviceLangueLocalePresent && !r.pythonPresent) {
    constats.push(
      constat({
        code: 'PYTHON_ABSENT',
        niveau: 'limitant',
        titre: 'Python est absent : la transcription en langue locale ne demarrera pas',
        detail:
          'Le service de transcription en fon est present sur ce poste mais rien ne peut l executer. ' +
          'Les autres moteurs de transcription fonctionnent normalement.',
        remede: 'Installer Python 3.10 ou plus recent (python.org), puis relancer l application.',
      }),
    );
  }
  if (r.serviceLangueLocalePresent && r.pythonPresent && r.pythonModulesManquants.length > 0) {
    constats.push(
      constat({
        code: 'MODULES_PYTHON_ABSENTS',
        niveau: 'limitant',
        titre: 'La transcription en langue locale manque de ses dependances',
        detail:
          `Modules absents : ${r.pythonModulesManquants.join(', ')}. ` +
          'Le service ne demarrera pas ; les autres moteurs de transcription fonctionnent normalement.',
        remede:
          'Installer PyTorch en suivant pytorch.org, puis : pip install -r services/griot/requirements.txt',
      }),
    );
  }
  if (!r.cleModeleLangage) {
    constats.push(
      constat({
        code: 'MODELE_LANGAGE_ABSENT',
        niveau: 'remarque',
        titre: 'Aucune cle de modele de langage configuree',
        detail:
          "L extraction clinique basculera sur le moteur local deterministe : 100 % hors ligne, " +
          'couverture plus etroite, mais jamais inventif. Ce n est pas une panne — c est un mode de marche assume.',
        remede: 'Renseigner ANTHROPIC_API_KEY pour l extraction par modele de langage, si la structure le souhaite.',
      }),
    );
  }

  // Ordre de lecture : ce qui decide si l installation peut continuer en premier.
  const rang = { bloquant: 0, limitant: 1, remarque: 2 };
  return constats.sort((a, b) => rang[a.niveau] - rang[b.niveau]);
}

/** Resume chiffre, pour l'en-tete de l'ecran et le code de sortie d'un script. */
export function bilan(constats: ConstatPrerequis[]) {
  return {
    bloquants: constats.filter((c) => c.niveau === 'bloquant').length,
    limitants: constats.filter((c) => c.niveau === 'limitant').length,
    remarques: constats.filter((c) => c.niveau === 'remarque').length,
    /** L'installation peut-elle se poursuivre ? */
    utilisable: constats.every((c) => c.niveau !== 'bloquant'),
  };
}
