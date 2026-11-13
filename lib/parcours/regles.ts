/**
 * Ce qui attend un patient, et qui doit s'en charger.
 *
 * CE MODULE EST LE LIEN ENTRE LES AUTRES. Les files, les consultations, le
 * laboratoire, la caisse, la pharmacie et les sejours existaient chacun de
 * leur cote : chaque agent voyait sa part et personne ne voyait le trajet. Un
 * patient preleve dont le resultat etait rendu attendait qu'un soignant pense
 * a aller le lire ; une ordonnance validee attendait que le patient pense a
 * passer en pharmacie. Rien ne plantait, et tout prenait la journee.
 *
 * MODULE PUR : ni base, ni horloge, ni hasard. Il recoit un etat deja
 * rassemble et rend une decision. C'est ce qui permet de tester « le patient a
 * une facture impayee ET une ordonnance a retirer » sans monter d'hopital.
 *
 * TROIS REGLES QUI NE SONT PAS DES DETAILS
 *
 * 1. UNE SEULE SUITE A LA FOIS. On rend l'etape qui vient, pas la liste de
 *    tout ce qui reste. Une liste de six choses a faire ne se lit pas dans un
 *    couloir ; une phrase, si.
 *
 * 2. CE QUI EST CLINIQUE N'EST JAMAIS AUTOMATIQUE. La plateforme place un
 *    patient dans une file, elle ne decide pas qu'il est soigne. Chaque suite
 *    porte donc `automatique`, et ce drapeau est faux des qu'un soignant doit
 *    juger. Une automatisation qui signe a la place de quelqu'un ne fait pas
 *    gagner du temps : elle deplace la responsabilite sans le dire.
 *
 * 3. L'ORDRE EST CELUI DU RISQUE, PAS CELUI DU PLANNING. Un resultat critique
 *    non acquitte passe devant une facture impayee, et une facture impayee
 *    passe devant un rendez-vous de controle. Trier par date aurait mis la
 *    facture en tete, parce qu'elle est plus ancienne.
 */

export type Etape =
  | 'accueil'
  | 'consultation'
  | 'examen'
  | 'resultat'
  | 'ordonnance'
  | 'pharmacie'
  | 'caisse'
  | 'lit'
  | 'sortie'
  | 'rien';

/** L'etat du patient, rassemble depuis tous les modules. */
export interface EtatParcours {
  /** Passage ouvert dans une file, et sa categorie de poste. */
  file: { posteId: string; posteNom: string; etat: string } | null;
  /** Consultation ouverte, non signee. */
  consultationOuverte: string | null;
  /** Consultation analysee qui attend une signature. */
  consultationASigner: string | null;
  /** Examens demandes dont le prelevement n'a pas eu lieu. */
  aPrelever: number;
  /** Resultats rendus dont personne n'a encore accuse reception. */
  resultatsNonLus: number;
  /** Valeur critique rendue que personne n'a acquittee nommement. */
  critiqueNonAcquittee: boolean;
  /** Ordonnance redigee mais non validee par un praticien. */
  ordonnanceAValider: boolean;
  /** Ordonnance validee, non encore dispensee. */
  ordonnanceARetirer: boolean;
  /** Reste a charge, en francs. */
  resteACharge: number;
  /** Sejour en cours, et lit assigne ou non. */
  sejour: { id: string; litAssigne: boolean } | null;
}

export interface Suite {
  etape: Etape;
  /** Ce qu'il y a a faire, en une phrase lisible dans un couloir. */
  libelle: string;
  /** Pourquoi maintenant. Vide quand c'est evident. */
  pourquoi: string;
  /** Qui s'en charge : le poste, pas la personne. */
  qui: 'accueil' | 'medecin' | 'laboratoire' | 'pharmacie' | 'caisse' | 'patient';
  /**
   * La plateforme peut-elle le faire seule ?
   *
   * Faux des qu'un humain doit juger. Un vrai des qu'il s'agit de deplacer un
   * objet d'une liste a une autre.
   */
  automatique: boolean;
  /**
   * Quelqu'un doit-il agir ?
   *
   * Faux pour « consultation en cours » ou « hospitalise, rien en attente » :
   * ce sont des CONSTATS, pas des attentes. Les ecrans qui listent ce qui
   * attend se servent de ce drapeau — comparer des libelles marcherait
   * aujourd'hui et casserait a la premiere reformulation.
   */
  attente: boolean;
}

const RIEN: Suite = {
  etape: 'rien',
  libelle: 'Rien en attente',
  pourquoi: '',
  qui: 'accueil',
  automatique: false,
  attente: false,
};

/**
 * Ce qui vient ensuite pour ce patient.
 *
 * L'ordre des tests EST la regle : le premier qui repond gagne. Le relire de
 * haut en bas doit se lire comme une phrase — d'abord ce qui peut tuer,
 * ensuite ce qui bloque le soin, enfin ce qui bloque la sortie.
 */
export function prochaineEtape(e: EtatParcours): Suite {
  // 1. Une valeur critique dont personne n'a accuse reception. Rien ne passe
  //    devant : le laboratoire a rendu un resultat que nul n'a lu.
  if (e.critiqueNonAcquittee) {
    return {
      etape: 'resultat',
      libelle: 'Resultat critique a acquitter',
      pourquoi: 'Le laboratoire a rendu une valeur critique et personne n a encore ete joint.',
      qui: 'medecin',
      automatique: false,
      attente: true,
    };
  }

  // 2. Un compte rendu analyse qui attend la signature. Tant qu'il n'est pas
  //    signe, rien n'en sort : ni ordonnance valable, ni ligne de rapport.
  if (e.consultationASigner) {
    return {
      etape: 'consultation',
      libelle: 'Compte rendu a signer',
      pourquoi: 'Une consultation analysee attend la signature du praticien.',
      qui: 'medecin',
      automatique: false,
      attente: true,
    };
  }

  // 3. Une ordonnance redigee mais non validee. Elle ne vaut rien en
  //    pharmacie, et le patient repartirait les mains vides.
  if (e.ordonnanceAValider) {
    return {
      etape: 'ordonnance',
      libelle: 'Ordonnance a valider',
      pourquoi: 'Une ordonnance est redigee mais aucun praticien ne l a validee.',
      qui: 'medecin',
      automatique: false,
      attente: true,
    };
  }

  // 4. Un prelevement demande et non fait. C'est le seul geste de cette liste
  //    qu'un retard rend inutile : l'examen a ete demande pour aujourd'hui.
  if (e.aPrelever > 0) {
    return {
      etape: 'examen',
      libelle: `${e.aPrelever} prelevement${e.aPrelever > 1 ? 's' : ''} a faire`,
      pourquoi: 'Un praticien a demande ces examens et personne n a encore preleve.',
      qui: 'laboratoire',
      automatique: false,
      attente: true,
    };
  }

  // 5. Des resultats rendus que personne n'a ouverts. Non critiques, sinon
  //    ils seraient sortis en 1.
  if (e.resultatsNonLus > 0) {
    return {
      etape: 'resultat',
      libelle: `${e.resultatsNonLus} resultat${e.resultatsNonLus > 1 ? 's' : ''} a relire`,
      pourquoi: 'Le laboratoire a rendu, le dossier attend la lecture.',
      qui: 'medecin',
      automatique: false,
      attente: true,
    };
  }

  // 6. Un sejour sans lit. Le patient est admis et attend debout.
  if (e.sejour && !e.sejour.litAssigne) {
    return {
      etape: 'lit',
      libelle: 'Lit a assigner',
      pourquoi: 'Le patient est admis mais aucun lit ne lui est attribue.',
      qui: 'accueil',
      // La plateforme sait proposer un lit libre de l'unite. Elle le PROPOSE :
      // choisir qui va ou releve de l'accueil, qui sait ce que la liste ne dit
      // pas — un voisin de chambre, une famille, une contagion.
      automatique: false,
      attente: true,
    };
  }

  // 7. Une ordonnance validee a retirer. Le soin est decide, il manque le
  //    medicament.
  if (e.ordonnanceARetirer) {
    return {
      etape: 'pharmacie',
      libelle: 'Ordonnance a delivrer',
      pourquoi: 'Une ordonnance validee attend la pharmacie.',
      qui: 'pharmacie',
      automatique: false,
      attente: true,
    };
  }

  // 8. Un reste a charge. Vient apres le soin, jamais avant : facturer avant
  //    de soigner est precisement ce qu'on ne veut pas automatiser.
  if (e.resteACharge > 0) {
    return {
      etape: 'caisse',
      libelle: 'Reste a charge a regler',
      pourquoi: 'Une facture ouverte porte un montant non solde.',
      qui: 'caisse',
      automatique: false,
      attente: true,
    };
  }

  // 9. Le patient attend dans une file sans que rien d'autre ne soit en
  //    cours. C'est la seule suite que la plateforme enchaine seule : appeler
  //    le suivant ne juge rien, cela deplace une ligne.
  if (e.file && e.file.etat === 'en-attente') {
    return {
      etape: 'accueil',
      libelle: `En attente a ${e.file.posteNom}`,
      pourquoi: '',
      qui: 'accueil',
      automatique: true,
      attente: true,
    };
  }

  // 10. Une consultation ouverte et rien d'autre : c'est en cours, et c'est
  //     bien. Ce n'est pas une attente.
  if (e.consultationOuverte) {
    return {
      etape: 'consultation',
      libelle: 'Consultation en cours',
      pourquoi: '',
      qui: 'medecin',
      automatique: false,
      attente: false,
    };
  }

  // 11. Un sejour avec son lit, rien en attente : le patient est hospitalise
  //     et tout est a jour.
  if (e.sejour) {
    return {
      etape: 'sortie',
      libelle: 'Hospitalise, rien en attente',
      pourquoi: '',
      qui: 'accueil',
      automatique: false,
      attente: false,
    };
  }

  return RIEN;
}

/**
 * Tout ce qui attend, et non la seule etape suivante.
 *
 * Sert aux ecrans de poste, qui montrent une file de patients : chacun y lit
 * ce qui le concerne. L'ordre est celui de `prochaineEtape`, applique etape
 * par etape sur un etat qu'on vide au fur et a mesure.
 */
export function toutCeQuiAttend(e: EtatParcours): Suite[] {
  const suites: Suite[] = [];
  let reste: EtatParcours = { ...e };

  // Vingt tours au maximum : un etat qui ne se vide pas signale une regle qui
  // ne consomme pas ce qu'elle rend, et une boucle infinie en production vaut
  // bien une borne ici.
  for (let i = 0; i < 20; i += 1) {
    const s = prochaineEtape(reste);
    if (s.etape === 'rien') break;
    suites.push(s);
    reste = consommer(reste, s);
    if (s.etape === 'accueil' || s.etape === 'sortie') break;
  }
  return suites;
}

/** Retire de l'etat ce que cette suite couvre, pour passer a la suivante. */
function consommer(e: EtatParcours, s: Suite): EtatParcours {
  switch (s.etape) {
    case 'resultat':
      return e.critiqueNonAcquittee
        ? { ...e, critiqueNonAcquittee: false }
        : { ...e, resultatsNonLus: 0 };
    case 'consultation':
      return e.consultationASigner
        ? { ...e, consultationASigner: null }
        : { ...e, consultationOuverte: null };
    case 'ordonnance':
      return { ...e, ordonnanceAValider: false };
    case 'examen':
      return { ...e, aPrelever: 0 };
    case 'lit':
      return { ...e, sejour: e.sejour ? { ...e.sejour, litAssigne: true } : null };
    case 'pharmacie':
      return { ...e, ordonnanceARetirer: false };
    case 'caisse':
      return { ...e, resteACharge: 0 };
    default:
      return e;
  }
}

/** Un etat sans rien en attente. Sert aux tests et aux ecrans vides. */
export const ETAT_VIDE: EtatParcours = {
  file: null,
  consultationOuverte: null,
  consultationASigner: null,
  aPrelever: 0,
  resultatsNonLus: 0,
  critiqueNonAcquittee: false,
  ordonnanceAValider: false,
  ordonnanceARetirer: false,
  resteACharge: 0,
  sejour: null,
};
