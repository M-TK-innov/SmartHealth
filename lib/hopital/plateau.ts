/**
 * Plateau technique : laboratoire et imagerie.
 *
 * Meme circuit pour les deux — demande, prelevement ou realisation,
 * resultat, validation, remise — parce que les erreurs y sont les memes.
 *
 * QUATRE INVARIANTS, par ordre de ce qu'ils empechent :
 *
 *   1. UNE VALEUR CRITIQUE EST ACQUITTEE, PAS AFFICHEE. Une kaliemie a 7
 *      mmol/l posee dans une liste de resultats est une kaliemie que
 *      personne n'a lue. Tant qu'un soignant nomme ne l'a pas acquittee,
 *      elle reste « a transmettre » et le dit.
 *
 *   2. SANS SEUIL CONFIGURE, UN RESULTAT N'EST PAS DECLARE NORMAL. Il est
 *      declare NON INTERPRETE. Afficher « normal » faute de seuil est le
 *      mensonge le plus coûteux qu'un logiciel de laboratoire puisse dire.
 *
 *   3. L'IDENTITE SE VERIFIE AU PRELEVEMENT. L'echange de deux tubes est
 *      l'erreur de laboratoire la plus ancienne et la plus grave : elle
 *      donne deux resultats parfaitement plausibles, attribues a l'envers.
 *
 *   4. UN RESULTAT NE S'ECRASE PAS. Une correction est une nouvelle
 *      version, avec son motif ; l'ancienne reste, marquee remplacee. Un
 *      clinicien a pu agir sur elle, et l'effacer efface aussi la raison
 *      de ce qu'il a fait.
 *
 * Module PUR : ni base ni horloge implicite.
 */

import { minutesEntre } from '../temps.ts';

export type Domaine = 'laboratoire' | 'imagerie';

export type EtatDemande =
  | 'demandee'
  | 'prelevee'
  | 'en-cours'
  | 'resultat-disponible'
  | 'validee'
  | 'annulee';

export type Priorite = 'routine' | 'urgente' | 'vitale';

export interface Demande {
  id: string;
  patientId: string;
  domaine: Domaine;
  /** Libelle de l'examen, tel qu'il figure sur la demande. */
  examen: string;
  priorite: Priorite;
  etat: EtatDemande;
  demandeeLe: string;
  preleveeLe: string | null;
}

/**
 * Bornes au-dela desquelles un resultat doit etre transmis sans delai.
 *
 * Elles ne sont PAS codees en dur dans ce module : elles sont fournies par
 * l'etablissement, parce qu'un seuil critique depend de la population, de
 * l'automate et de ce que le service sait faire en reponse. Un seuil
 * recopie d'ailleurs et presente comme une verite engage un laboratoire
 * qui ne l'a jamais valide.
 */
export interface SeuilCritique {
  examen: string;
  unite: string;
  bas: number | null;
  haut: number | null;
}

/**
 * Duree au-dela de laquelle un echantillon ne doit plus etre analyse.
 *
 * Un tube oublie deux heures sur une paillasse rend une kaliemie faussement
 * haute : le potassium sort des hematies. On traite alors une hyperkaliemie
 * qui n'existe pas, sur un patient qui va bien.
 */
export interface StabiliteEchantillon {
  examen: string;
  minutes: number;
}

export type MotifRefusPlateau =
  | 'IDENTITE_DISCORDANTE'
  | 'DEMANDE_CLOSE'
  | 'PAS_PRELEVEE'
  | 'DEJA_PRELEVEE'
  | 'ECHANTILLON_HORS_DELAI'
  | 'VALEUR_INVALIDE'
  | 'RESULTAT_DEJA_VALIDE'
  | 'MOTIF_REQUIS';

export interface RefusPlateau {
  ok: false;
  motif: MotifRefusPlateau;
  message: string;
  remede: string;
}

export type DecisionPlateau<T> = { ok: true; resultat: T } | RefusPlateau;

function refuse(motif: MotifRefusPlateau, message: string, remede: string): RefusPlateau {
  return { ok: false, motif, message, remede };
}

// ------------------------------------------------------------- prelevement

export interface DemandePrelevement {
  demande: Demande;
  /**
   * Identite relue a voix haute au lit du patient, et non recopiee de
   * l'ecran. C'est tout l'interet du controle : si elle vient de l'ecran,
   * elle concordera toujours.
   */
  identiteAnnoncee: { nom: string; naissance: string };
  identiteDossier: { nom: string; naissance: string };
  quand: string;
}

export interface Prelevement {
  demandeId: string;
  preleveLe: string;
}

/**
 * Enregistre un prelevement, apres controle d'identite.
 *
 * La date de naissance accompagne le nom parce que deux homonymes dans un
 * meme service ne sont pas une hypothese d'ecole : c'est la situation
 * ordinaire d'une maternite ou d'un service de pediatrie.
 */
export function prelever(d: DemandePrelevement): DecisionPlateau<Prelevement> {
  if (d.demande.etat === 'annulee') {
    return refuse(
      'DEMANDE_CLOSE',
      'Cette demande a ete annulee.',
      'Verifier aupres du prescripteur, ou saisir une nouvelle demande.',
    );
  }
  if (d.demande.etat !== 'demandee') {
    return refuse(
      'DEJA_PRELEVEE',
      'Cette demande a deja ete prelevee.',
      'Verifier l etiquette du tube : un deuxieme prelevement sous la meme demande ne serait pas rattachable.',
    );
  }

  const nomOk = memeNom(d.identiteAnnoncee.nom, d.identiteDossier.nom);
  const naissanceOk = d.identiteAnnoncee.naissance === d.identiteDossier.naissance;
  if (!nomOk || !naissanceOk) {
    return refuse(
      'IDENTITE_DISCORDANTE',
      `L identite annoncee ne correspond pas au dossier (${!nomOk ? 'nom' : 'date de naissance'}).`,
      'Ne pas prelever. Reprendre l identite avec le patient, et verifier qu il s agit bien du bon dossier.',
    );
  }

  return { ok: true, resultat: { demandeId: d.demande.id, preleveLe: d.quand } };
}

function memeNom(a: string, b: string): boolean {
  const n = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(' ');
  // Les mots sont tries : « Houngbedji Bernard » et « Bernard Houngbedji »
  // sont la meme personne, et un agent qui annonce le prenom d'abord ne
  // doit pas declencher une alerte d'identitovigilance pour rien. Une
  // alerte qui se declenche a tort est une alerte qu'on apprend a ignorer.
  return n(a) === n(b) && n(a) !== '';
}

// ---------------------------------------------------------------- resultat

export type Interpretation = 'normal' | 'anormal' | 'critique' | 'non-interprete';

export interface Resultat {
  demandeId: string;
  examen: string;
  valeurNum: number | null;
  valeurTexte: string | null;
  unite: string | null;
  interpretation: Interpretation;
  /** Vrai tant qu'une valeur critique n'a pas ete acquittee par quelqu'un. */
  aTransmettre: boolean;
  renduLe: string;
}

export interface DemandeResultat {
  demande: Demande;
  valeurNum?: number | null;
  valeurTexte?: string | null;
  unite?: string | null;
  seuils: SeuilCritique[];
  stabilites: StabiliteEchantillon[];
  quand: string;
}

/**
 * Enregistre un resultat.
 *
 * L'interpretation n'est jamais devinee : elle vient des seuils fournis par
 * l'etablissement. Sans seuil pour cet examen, le resultat est rendu
 * « non interprete » — et le dit — plutot que « normal ».
 */
export function rendreResultat(d: DemandeResultat): DecisionPlateau<Resultat> {
  if (d.demande.etat === 'annulee') {
    return refuse(
      'DEMANDE_CLOSE',
      'Cette demande a ete annulee : aucun resultat ne peut y etre rattache.',
      'Verifier le numero de demande porte sur l echantillon.',
    );
  }
  if (d.demande.etat === 'validee') {
    return refuse(
      'RESULTAT_DEJA_VALIDE',
      'Ce resultat a deja ete valide.',
      'Deposer une correction, qui creera une nouvelle version sans effacer la precedente.',
    );
  }
  if (!d.demande.preleveeLe) {
    return refuse(
      'PAS_PRELEVEE',
      'Aucun prelevement n est enregistre pour cette demande.',
      'Enregistrer le prelevement, avec son controle d identite, avant de saisir un resultat.',
    );
  }

  const aucuneValeur =
    (d.valeurNum === null || d.valeurNum === undefined) &&
    !(d.valeurTexte && d.valeurTexte.trim());
  if (aucuneValeur) {
    return refuse(
      'VALEUR_INVALIDE',
      'Un resultat doit porter une valeur, chiffree ou redigee.',
      'Saisir la valeur mesuree, ou le compte rendu pour un examen d imagerie.',
    );
  }
  if (d.valeurNum !== null && d.valeurNum !== undefined && !Number.isFinite(d.valeurNum)) {
    return refuse('VALEUR_INVALIDE', 'La valeur chiffree n est pas un nombre.', 'Corriger la saisie.');
  }

  const stabilite = d.stabilites.find((s) => memeExamen(s.examen, d.demande.examen));
  if (stabilite && d.demande.preleveeLe) {
    const age = minutesEntre(d.demande.preleveeLe, d.quand);
    if (age > stabilite.minutes) {
      return refuse(
        'ECHANTILLON_HORS_DELAI',
        `L echantillon a ete preleve il y a ${age} minutes, au-dela des ${stabilite.minutes} minutes de stabilite pour ${d.demande.examen}.`,
        'Ne pas rendre ce resultat : il serait faux dans le sens qui fait traiter. Reprelever.',
      );
    }
  }

  const interpretation = interpreter(d.demande.examen, d.valeurNum ?? null, d.seuils);

  return {
    ok: true,
    resultat: {
      demandeId: d.demande.id,
      examen: d.demande.examen,
      valeurNum: d.valeurNum ?? null,
      valeurTexte: d.valeurTexte ?? null,
      unite: d.unite ?? null,
      interpretation,
      // Une valeur critique part « a transmettre » et y reste jusqu'a ce
      // que quelqu'un l'acquitte nommement.
      aTransmettre: interpretation === 'critique',
      renduLe: d.quand,
    },
  };
}

/**
 * Interprete une valeur au regard des seuils de l'etablissement.
 *
 * Trois sorties seulement, et « normal » est la plus rare : elle demande un
 * seuil configure ET une valeur chiffree dedans. Tout le reste est
 * « non interprete », ce qui n'est pas un echec du logiciel mais un
 * constat — le biologiste n'a pas encore pose de borne pour cet examen.
 */
export function interpreter(
  examen: string,
  valeur: number | null,
  seuils: SeuilCritique[],
): Interpretation {
  if (valeur === null) return 'non-interprete';
  const s = seuils.find((x) => memeExamen(x.examen, examen));
  if (!s) return 'non-interprete';
  // UNE LIGNE SANS AUCUNE BORNE NE CONFIGURE RIEN. L'examen est declare —
  // on sait l'unite dans laquelle il se rend — mais aucune borne n'a ete
  // posee, souvent parce qu'elle depend du contexte : la parasitemie d'une
  // goutte epaisse ne s'alerte pas au meme niveau partout.
  //
  // Rendre « normal » reviendrait alors a affirmer une absence de danger
  // que personne n'a etablie, et le declarer serait PIRE que de n'avoir
  // aucune ligne du tout : la presence de la ligne laisse croire que le
  // laboratoire s'est prononce.
  if (s.bas === null && s.haut === null) return 'non-interprete';
  if (s.bas !== null && valeur <= s.bas) return 'critique';
  if (s.haut !== null && valeur >= s.haut) return 'critique';
  return 'normal';
}

function memeExamen(a: string, b: string): boolean {
  const n = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  return n(a) === n(b);
}

// --------------------------------------------------------------- acquitter

export interface Acquittement {
  demandeId: string;
  /** Qui a recu la valeur. Un acquittement anonyme n'acquitte rien. */
  transmisA: string;
  transmisLe: string;
  commentaire: string | null;
}

/**
 * Acquitte une valeur critique : quelqu'un l'a recue, et on sait qui.
 *
 * Le nom du destinataire est OBLIGATOIRE. « Transmis » sans destinataire
 * est exactement ce qu'on retrouve dans les dossiers apres un accident :
 * la case est cochee, et personne ne se souvient d'avoir ete appele.
 */
export function acquitter(
  resultat: Resultat,
  transmisA: string,
  quand: string,
  commentaire: string | null = null,
): DecisionPlateau<Acquittement> {
  if (!resultat.aTransmettre) {
    return refuse(
      'VALEUR_INVALIDE',
      'Ce resultat n appelle pas de transmission immediate.',
      'Aucune action necessaire.',
    );
  }
  if (!transmisA.trim()) {
    return refuse(
      'MOTIF_REQUIS',
      'Le nom du soignant prevenu est requis.',
      'Saisir qui a ete joint. Un acquittement anonyme n acquitte rien.',
    );
  }
  return {
    ok: true,
    resultat: {
      demandeId: resultat.demandeId,
      transmisA: transmisA.trim(),
      transmisLe: quand,
      commentaire,
    },
  };
}

// -------------------------------------------------------------- correction

export interface Correction {
  demandeId: string;
  motif: string;
  /** Version precedente, conservee. */
  remplace: Resultat;
  nouveau: Resultat;
}

/**
 * Corrige un resultat deja rendu.
 *
 * L'ancien n'est PAS modifie : il est conserve et marque remplace. Un
 * clinicien a pu prescrire sur sa foi, et effacer la valeur efface aussi
 * la raison de ce qu'il a fait.
 */
export function corriger(
  ancien: Resultat,
  nouveau: Omit<Resultat, 'demandeId'>,
  motif: string,
): DecisionPlateau<Correction> {
  if (!motif.trim()) {
    return refuse(
      'MOTIF_REQUIS',
      'Une correction de resultat exige un motif.',
      'Indiquer ce qui a change : erreur de saisie, recontrole, nouvel echantillon.',
    );
  }
  return {
    ok: true,
    resultat: {
      demandeId: ancien.demandeId,
      motif: motif.trim(),
      remplace: ancien,
      nouveau: { ...nouveau, demandeId: ancien.demandeId },
    },
  };
}

// ------------------------------------------------------------------ mesure

export interface TensionPlateau {
  domaine: Domaine;
  demandees: number;
  prelevees: number;
  enAttenteDeResultat: number;
  /** Valeurs critiques rendues et NON encore acquittees. */
  critiquesNonTransmises: number;
  /** Delai median entre demande et resultat, en minutes. */
  delaiMedianMinutes: number;
}

export function tensionPlateau(
  domaine: Domaine,
  demandes: Demande[],
  resultats: Resultat[],
): TensionPlateau {
  const duDomaine = demandes.filter((d) => d.domaine === domaine);
  const parId = new Map(resultats.map((r) => [r.demandeId, r]));

  const delais = duDomaine
    .map((d) => {
      const r = parId.get(d.id);
      return r ? minutesEntre(d.demandeeLe, r.renduLe) : null;
    })
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);

  return {
    domaine,
    demandees: duDomaine.filter((d) => d.etat === 'demandee').length,
    prelevees: duDomaine.filter((d) => d.etat === 'prelevee').length,
    enAttenteDeResultat: duDomaine.filter(
      (d) => d.etat === 'demandee' || d.etat === 'prelevee' || d.etat === 'en-cours',
    ).length,
    // Le chiffre qui doit etre a zero. Il compte des patients dont le
    // resultat dangereux attend dans une liste.
    critiquesNonTransmises: duDomaine.filter((d) => parId.get(d.id)?.aTransmettre).length,
    delaiMedianMinutes: delais.length === 0 ? 0 : delais[Math.floor(delais.length / 2)],
  };
}
