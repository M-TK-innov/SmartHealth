/**
 * Ce qu'un acte coute, et ce qui se passe quand on ne le sait pas.
 *
 * MODULE PUR : ni base, ni horloge. Il recoit un acte et un bareme, et rend
 * une ligne de facture ou un refus motive.
 *
 * LA REGLE QUI TIENT TOUT LE RESTE : UN ACTE SANS TARIF N'EST PAS FACTURE.
 * Ni a zero, ni au prix d'un acte voisin, ni « en attendant ». Une ligne a
 * zero ressemble a une gratuite decidee par quelqu'un, et personne ne la
 * corrige jamais ; un prix approche se retrouve dans la caisse d'un
 * etablissement qui n'en a jamais voulu. Le refus porte le code manquant,
 * pour que le responsable sache exactement quoi ajouter au bareme.
 *
 * POURQUOI LA FACTURATION AUTOMATIQUE NE DECIDE PAS DE L'URGENCE. Elle la
 * recoit. Le caractere vital d'un acte decide si un impaye peut en bloquer un
 * autre : c'est une decision de soin, pas de comptabilite.
 */

export type Urgence = 'vitale' | 'urgente' | 'programmable';

/** Un tarif tel que l'etablissement l'a pose. */
export interface Tarif {
  code: string;
  libelle: string;
  /** Francs CFA entiers. */
  montant: number;
}

/** Un acte a facturer, tel que le module qui l'a produit le decrit. */
export interface ActeAFacturer {
  /** Le code au bareme : « consultation-externe », « examen:2339-0 »... */
  code: string;
  /** Ce qui s'affichera sur la facture, si le bareme ne dit pas mieux. */
  libelle: string;
  quantite: number;
  urgence: Urgence;
  /** Ce qui a produit cet acte, pour ne jamais le facturer deux fois. */
  source: string;
}

export interface LigneProposee {
  libelle: string;
  montant: number;
  quantite: number;
  urgence: Urgence;
  source: string;
}

export type Tarification =
  | { ok: true; ligne: LigneProposee }
  | { ok: false; motif: string; codeManquant: string | null };

const refus = (motif: string, codeManquant: string | null = null): Tarification => ({
  ok: false,
  motif,
  codeManquant,
});

/**
 * Le tarif d'un code, ou rien.
 *
 * Le bareme de l'etablissement passe avant le bareme general : un centre qui
 * a pose son prix l'a fait pour une raison, et un bareme national ne doit pas
 * le lui reprendre.
 */
export function tarifDe(bareme: Tarif[], code: string): Tarif | null {
  return bareme.find((t) => t.code === code) ?? null;
}

/**
 * Prepare la ligne de facture d'un acte.
 *
 * Rend un refus plutot qu'une ligne des que quelque chose manque ou ne tient
 * pas debout. L'appelant ne doit jamais avoir a verifier le resultat avant de
 * l'ecrire : si `ok` est vrai, la ligne est ecrivable telle quelle.
 */
export function tarifer(acte: ActeAFacturer, bareme: Tarif[]): Tarification {
  if (!acte.code.trim()) return refus('Acte sans code : impossible de le tarifer.');
  if (!acte.source.trim()) {
    // Sans source, rien n'empeche de facturer deux fois le meme acte.
    return refus('Acte sans origine : il serait refacture a chaque tentative.');
  }
  if (!Number.isInteger(acte.quantite) || acte.quantite < 1) {
    return refus('Quantite invalide : au moins un.');
  }

  const t = tarifDe(bareme, acte.code);
  if (!t) {
    return refus(
      `Aucun tarif pose pour « ${acte.code} ». L acte est enregistre mais non facture : ajoutez-le au bareme.`,
      acte.code,
    );
  }
  if (!Number.isInteger(t.montant) || t.montant < 0) {
    return refus(`Le tarif de « ${acte.code} » n est pas un montant entier positif.`, acte.code);
  }
  if (t.montant === 0) {
    // Un tarif a zero est peut-etre voulu — un acte pris en charge
    // integralement — mais il doit avoir ete POSE a zero, pas deduit d'une
    // absence. On l'accepte ici, puisque quelqu'un l'a ecrit.
    return {
      ok: true,
      ligne: {
        libelle: t.libelle || acte.libelle,
        montant: 0,
        quantite: acte.quantite,
        urgence: acte.urgence,
        source: acte.source,
      },
    };
  }

  return {
    ok: true,
    ligne: {
      // Le libelle du bareme fait foi : c'est celui que le caissier reconnait
      // et que le patient retrouvera sur son telephone.
      libelle: t.libelle || acte.libelle,
      montant: t.montant,
      quantite: acte.quantite,
      urgence: acte.urgence,
      source: acte.source,
    },
  };
}

/**
 * Le code au bareme d'une consultation.
 *
 * Une consultation d'urgence ne coute pas le meme prix qu'une consultation
 * externe, et les deux existent dans tous les baremes de centre de sante.
 */
export function codeConsultation(urgence: Urgence): string {
  return urgence === 'programmable' ? 'consultation-externe' : 'consultation-urgence';
}

/** Le code au bareme d'un examen, par son code LOINC quand il en a un. */
export function codeExamen(loinc: string | null, examen: string): string {
  return loinc ? `examen:${loinc}` : `examen:${examen.toLowerCase().replace(/\s+/g, '-')}`;
}

/** Le code au bareme d'un medicament, par son code ATC quand il en a un. */
export function codeMedicament(atc: string | null, nom: string): string {
  return atc ? `medicament:${atc}` : `medicament:${nom.toLowerCase().replace(/\s+/g, '-')}`;
}
