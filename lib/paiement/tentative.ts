/**
 * Tentative de paiement en ligne.
 *
 * CE QUI SE JOUE ICI
 *
 * De l'argent reel bouge, par un operateur tiers, de facon asynchrone. Les
 * deux fautes possibles n'ont pas le meme prix :
 *
 *   - marquer payee une facture qui ne l'est pas : la structure perd la
 *     somme et ne s'en apercoit qu'au rapprochement, parfois jamais ;
 *   - ne pas enregistrer un paiement reellement recu : le patient repaie,
 *     ou se fait reclamer une somme qu'il a versee.
 *
 * La seconde est rattrapable au guichet, la premiere beaucoup moins. D'ou la
 * regle centrale : AUCUNE LIGNE DE PAIEMENT NE NAIT D'UNE TENTATIVE NON
 * CONFIRMEE PAR L'OPERATEUR.
 *
 * UN PAIEMENT EN LIGNE NE SE REFUSE PAS POUR DEPASSEMENT
 *
 * `encaisser` de la caisse refuse, a juste titre, un versement superieur au
 * reste a charge : au comptoir, on rend la monnaie plutot que d'encaisser
 * de travers. En ligne, l'argent a DEJA bouge quand on l'apprend. Le
 * refuser ne le renvoie pas au patient, cela le fait disparaitre des
 * comptes. On enregistre donc, et le trop-percu est nomme par `solde`, qui
 * sait deja le faire.
 *
 * Module PUR : ni base, ni horloge, ni reseau.
 */

export type EtatTentative = 'initiee' | 'confirmee' | 'echouee' | 'expiree';

export type Operateur = 'mtn-momo' | 'moov-money' | 'pi-spi';

export const OPERATEURS: Record<Operateur, string> = {
  'mtn-momo': 'MTN Mobile Money',
  'moov-money': 'Moov Money',
  'pi-spi': 'Paiement instantane (PI-SPI)',
};

export interface Tentative {
  reference: string;
  factureId: string;
  operateur: Operateur;
  /** Montant demande au depart, en francs entiers. */
  montantDemande: number;
  etat: EtatTentative;
  /** Montant que l'operateur declare avoir transfere, une fois confirme. */
  montantConfirme: number | null;
  initieeLe: string;
  termineeLe: string | null;
}

// ------------------------------------------------------------- references

/**
 * Alphabet de la reference, le meme que celui des codes d'enrolement.
 *
 * Elle est dictee au guichet, recopiee sur un recu, parfois lue au
 * telephone a un operateur. Les caracteres jumeaux en sont absents.
 */
export const ALPHABET_REFERENCE = 'ABCDEFGHJKMNPQRTUVWXYZ23456789';

export const LONGUEUR_REFERENCE = 10;

/** Met une reference saisie sous sa forme de comparaison. */
export function normaliserReference(brut: string): string {
  return (brut ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Forme lisible : deux groupes, pour la dicter sans se perdre. */
export function formaterReference(reference: string): string {
  const r = normaliserReference(reference);
  if (r.length !== LONGUEUR_REFERENCE) return reference;
  return `${r.slice(0, 5)} ${r.slice(5)}`;
}

/**
 * Reference d'une facture, telle qu'on la dicte et telle qu'on la cherche.
 *
 * UNE SEULE FONCTION, APPELEE PARTOUT. L'ecran du patient affichait d'abord
 * un identifiant court en tete de facture et une reference differente dans
 * le bloc de reglement : le patient dictait la seconde, le caissier cherchait
 * la premiere, et personne ne comprenait pourquoi cela ne se trouvait pas.
 */
export const LONGUEUR_REFERENCE_FACTURE = 8;

export function referenceFacture(factureId: string): string {
  const brut = (factureId ?? '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  const r = brut.slice(0, LONGUEUR_REFERENCE_FACTURE);
  if (r.length < LONGUEUR_REFERENCE_FACTURE) return r;
  return `${r.slice(0, 4)} ${r.slice(4)}`;
}

// --------------------------------------------------------- initialisation

export type Refus = { ok: false; motif: string };
export type Issue<T> = { ok: true; resultat: T } | Refus;

/**
 * Un montant est-il recevable pour une tentative ?
 *
 * Les francs CFA n'ont pas de centimes : un montant fractionnaire vient
 * forcement d'un calcul fait ailleurs, et il faut le refuser plutot que
 * l'arrondir en silence.
 */
export function montantRecevable(montant: number, resteACharge: number): Issue<number> {
  if (!Number.isInteger(montant)) {
    return { ok: false, motif: 'Le montant doit etre un nombre entier de francs.' };
  }
  if (montant <= 0) {
    return { ok: false, motif: 'Le montant doit etre superieur a zero.' };
  }
  if (resteACharge <= 0) {
    return { ok: false, motif: 'Cette facture est deja soldee.' };
  }
  if (montant > resteACharge) {
    return {
      ok: false,
      motif: `Le montant depasse le reste a charge. A payer : ${resteACharge} F.`,
    };
  }
  return { ok: true, resultat: montant };
}

// ------------------------------------------------------------ transitions

export type Evenement =
  | { type: 'confirmation'; montant: number }
  | { type: 'echec'; motif?: string }
  | { type: 'expiration' };

export interface Transition {
  /** Nouvel etat, ou `null` si rien ne change. */
  etat: EtatTentative | null;
  /** Faut-il ecrire une ligne de paiement ? */
  enregistrerPaiement: boolean;
  /** Montant a enregistrer, s'il y a lieu. */
  montant: number | null;
  /** Pourquoi, pour le journal. */
  motif: string;
}

const RIEN: Transition = {
  etat: null,
  enregistrerPaiement: false,
  montant: null,
  motif: 'Aucun changement.',
};

/**
 * Applique un evenement d'operateur a une tentative.
 *
 * DEUX INVARIANTS
 *
 * 1. `confirmee` est DEFINITIF. Une confirmation recue deux fois — ce que
 *    font tous les operateurs quand ils n'ont pas vu notre accuse — ne doit
 *    pas creer un second paiement. Un echec annonce apres une confirmation
 *    est ignore : l'argent est arrive, le dire n'y change rien.
 *
 * 2. `echouee` n'est PAS definitif. Un operateur peut annoncer un echec puis
 *    une reussite tardive, et refuser cette reussite ferait disparaitre un
 *    paiement reel. Le sens de l'erreur compte : une facture qui reste due
 *    alors qu'elle est payee se corrige au guichet ; une facture soldee sans
 *    argent ne se voit jamais.
 */
export function appliquer(t: Pick<Tentative, 'etat'>, e: Evenement): Transition {
  if (t.etat === 'confirmee') {
    return {
      ...RIEN,
      motif:
        e.type === 'confirmation'
          ? 'Confirmation deja prise en compte.'
          : 'Tentative deja confirmee : evenement ignore.',
    };
  }

  if (e.type === 'confirmation') {
    if (!Number.isInteger(e.montant) || e.montant <= 0) {
      return { ...RIEN, motif: 'Montant confirme invalide : rien enregistre.' };
    }
    return {
      etat: 'confirmee',
      enregistrerPaiement: true,
      // Le montant est celui que l'OPERATEUR declare, pas celui demande :
      // un paiement partiel reste un paiement, et l'ecart doit se voir.
      montant: e.montant,
      motif: 'Paiement confirme par l operateur.',
    };
  }

  if (e.type === 'echec') {
    if (t.etat === 'expiree') return { ...RIEN, motif: 'Tentative deja expiree.' };
    return {
      etat: 'echouee',
      enregistrerPaiement: false,
      montant: null,
      motif: e.motif ? `Echec : ${e.motif}` : 'Echec signale par l operateur.',
    };
  }

  // expiration
  if (t.etat === 'echouee') return { ...RIEN, motif: 'Tentative deja en echec.' };
  if (t.etat === 'expiree') return RIEN;
  return {
    etat: 'expiree',
    enregistrerPaiement: false,
    montant: null,
    motif: 'Aucune reponse de l operateur dans le delai.',
  };
}

/** Une tentative attend-elle encore une reponse ? */
export function enAttente(etat: EtatTentative): boolean {
  return etat === 'initiee';
}

/**
 * Ce qu'il faut dire au patient, selon l'etat.
 *
 * Aucun message ne promet que la facture est soldee : seule la caisse le
 * sait, apres que le paiement a ete enregistre et le solde recalcule.
 */
export function messageEtat(etat: EtatTentative): string {
  switch (etat) {
    case 'initiee':
      return 'Paiement en cours. Validez sur votre telephone, puis revenez ici.';
    case 'confirmee':
      return 'Paiement recu. Il apparait sur votre facture.';
    case 'echouee':
      return "Le paiement n'a pas abouti. Rien n'a ete preleve. Vous pouvez reessayer.";
    case 'expiree':
      return "Pas de reponse de l operateur. Si une somme a ete prelevee, presentez-vous a la caisse avec votre reference.";
  }
}
