/**
 * Le parcours de demonstration : ce que la plateforme doit MONTRER.
 *
 * CE QUE CE MODULE CORRIGE. Le jeu de donnees construisait jusqu'ici le
 * decor — unites, lits, postes, rayon de pharmacie, salles d'operation — et
 * s'arretait la. Six tables du parcours restaient vides : `passage`,
 * `facture`, `paiement`, `dispensation`, `resultat_examen`,
 * `checklist_bloc`. Autrement dit, les ecrans construits pour le flux des
 * patients, la caisse, la dispensation, le rendu des resultats et la
 * checklist du bloc s'ouvraient sur rien. Une demonstration qui ouvre un
 * ecran vide ne demontre pas que le code est prudent ; elle demontre qu'il
 * n'a jamais tourne.
 *
 * CE QUI EST CHOISI ICI, ET POURQUOI. Chaque ligne est posee pour faire
 * apparaitre un cas ETROIT, jamais le cas moyen :
 *
 *   - une urgence vitale arrivee en dernier, pour voir le triage l'appeler
 *     en premier ;
 *   - deux patients remontes par anciennete, et un parti sans avoir ete vu,
 *     parce que c'est cette part-la qui mesure un poste sature ;
 *   - une facture au reste a charge non nul portant un acte programmable,
 *     pour voir l'avis bloquer ce qui peut attendre et seulement cela ;
 *   - une dispensation servie sur le lot qui PERIME LE PREMIER, et non sur
 *     le plus gros ;
 *   - une ligne d'ordonnance en rupture franche, qui ne sera pas servie ;
 *   - une kaliemie d'abord rendue normale, puis corrigee en valeur critique,
 *     l'ancienne version conservee et la nouvelle acquittee nommement ;
 *   - une hemoglobine critique qui, elle, attend encore d'etre transmise ;
 *   - une goutte epaisse sans seuil, rendue « non interpretee » ;
 *   - une intervention au bloc dont le temps « avant incision » est
 *     incomplet, pour que l'ecran dise ce qui manque avant d'inciser.
 *
 * CE QUI N'EST PAS FAIT ICI, VOLONTAIREMENT. La consultation pediatrique
 * reste SANS analyse, sans diagnostic et sans ordonnance : c'est elle qu'on
 * analyse en direct devant la salle. La prerenseigner reviendrait a montrer
 * un resultat deja ecrit et a ne rien prouver du tout.
 *
 * Module PUR : il ne touche ni la base ni l'horloge. Il rend une liste
 * d'ecritures, que l'appelant applique. C'est ce qui permet de verifier les
 * invariants du parcours dans `npm test`, sans base de donnees.
 */

/** Valeur acceptee dans une ligne : ce que SQLite sait stocker. */
export type Valeur = string | number | null;

export type Ligne = Record<string, Valeur>;

/**
 * Une ecriture a appliquer. Deux formes seulement : poser une ligne, ou
 * corriger une ligne que le decor a deja posee (le stock d'un lot qu'on
 * vient de servir, l'etat d'une demande dont le resultat est rendu).
 */
export type Ecriture =
  | { op: 'inserer'; table: string; ligne: Ligne }
  | { op: 'modifier'; table: string; id: string; champs: Ligne };

/** Un article du rayon, avec ses lots, tels que le decor les a poses. */
export interface ArticleDemo {
  id: string;
  lots: { id: string; numero: string; perimeLe: string; quantite: number }[];
}

export interface ContexteDemo {
  organizationId: string;
  practitionerId: string;
  /** Nom affiche du praticien : un acquittement nomme son destinataire. */
  praticienNom: string;
  patients: { adjoa: string; koffi: string; bernard: string };
  /** Hospitalisation en cours de Bernard, posee par le decor. */
  sejourBernard: string;
  /** Postes du decor, par code : ACC, TRI, CONS-1, CAISSE, PHARM, LABO. */
  postes: Record<string, string>;
  /** Rayon de pharmacie, par DCI. */
  articles: Record<string, ArticleDemo>;
  /** Demande de kaliemie deja prelevee, posee par le decor. */
  demandeKaliemie: string;
  /** Demande d'echographie obstetricale, posee par le decor. */
  demandeEchographie: string;
  /** Cure de hernie inguinale, au programme du jour. */
  interventionHernie: string;
  /** Instant de reference : tout est relatif a lui. */
  maintenant: Date;
  /** Generateur d'identifiants, injecte pour que le test soit reproductible. */
  id: () => string;
}

/**
 * Seuils critiques du jeu de demonstration.
 *
 * ILS SONT ICI, ET PAS DANS LE SCRIPT D'AMORCAGE, parce que les resultats
 * du parcours doivent pouvoir etre confrontes a eux dans `npm test` : une
 * valeur annoncee « critique » dans la demonstration et rendue « normale »
 * par la regle serait une demonstration qui ment. Deux copies auraient
 * diverge a la premiere retouche.
 *
 * Ce ne sont PAS des constantes de l'application. Un seuil critique depend
 * de la population, de l'automate et de ce que le service sait faire en
 * reponse ; celui-ci est un point de depart, a revoir et a valider par le
 * biologiste du site. C'est pourquoi `valide_par` et `valide_le` restent
 * vides.
 */
export const SEUILS_DEMONSTRATION = [
  { examen: 'Kaliemie', unite: 'mmol/l', bas: 2.8, haut: 6.0, stabilite: 60 },
  { examen: 'Glycemie', unite: 'g/l', bas: 0.4, haut: 4.0, stabilite: 120 },
  { examen: 'Hemoglobine', unite: 'g/dl', bas: 6.0, haut: null, stabilite: 480 },
  { examen: 'Creatininemie', unite: 'mg/l', bas: null, haut: 50, stabilite: 480 },
  // Sans seuil, volontairement : la goutte epaisse se rend en parasitemie,
  // et le seuil d'alerte depend du contexte de transmission. L'absence est
  // un choix, et l'ecran dira « non interprete » plutot que « normal ».
  { examen: 'Goutte epaisse', unite: 'parasites/ul', bas: null, haut: null, stabilite: 240 },
] as const;

const MINUTE = 60_000;
const JOUR = 86_400_000;

/** Forme horodatee de SQLite, celle que produit datetime('now'). */
function horodatage(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

/** Forme date seule. */
function jourSeul(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Montants en FRANCS CFA ENTIERS. Les tarifs sont ceux d'un centre de sante
 * de commune, pas d'une clinique : un jeu de demonstration a 150 000 F la
 * consultation ne se discute pas avec un directeur d'hopital.
 */
const TARIF = {
  consultationExterne: 1_000,
  consultationUrgence: 2_000,
  journeeHospitalisation: 3_500,
  kaliemie: 2_500,
  glycemie: 1_000,
  hemoglobine: 2_000,
  cureHernie: 45_000,
  amoxicilline: 1_500,
} as const;

/**
 * Les patients de la salle d'attente.
 *
 * Ils n'ont pas d'antecedents : ce sont des gens qui attendent, et la file
 * ne sait rien d'eux avant le triage. Leur donner un dossier fourni
 * laisserait croire que l'accueil dispose d'informations qu'il n'a pas.
 *
 * `attenteMinutes` est l'ecart a l'instant de reference. Les valeurs sont
 * choisies autour du seuil d'anciennete de 90 minutes, de part et d'autre.
 */
interface Attendant {
  mrn: string;
  prenom: string;
  nom: string;
  naissance: string;
  genre: 'male' | 'female';
  ville: string;
  langue: string;
  /** Code du poste ou la personne attend. */
  poste: string;
  gravite: 'vitale' | 'urgente' | 'standard' | 'differable';
  etat: 'en-attente' | 'en-cours' | 'parti';
  /** Minutes ecoulees depuis l'arrivee, a l'instant de reference. */
  attenteMinutes: number;
  /** Pour qui est reparti : au bout de combien de minutes d'attente. */
  partiApresMinutes: number | null;
  motif: string;
}

const SALLE_ATTENTE: Attendant[] = [
  {
    mrn: 'CSC-2026-00004',
    prenom: 'Sika',
    nom: 'Ahouansou',
    naissance: '1991-02-17',
    genre: 'female',
    ville: 'Cotonou',
    langue: 'fon',
    poste: 'CONS-1',
    gravite: 'standard',
    etat: 'en-attente',
    // 105 minutes : au-dela du seuil d'anciennete, donc remontee d'un cran.
    attenteMinutes: 105,
    partiApresMinutes: null,
    motif: 'Douleurs abdominales depuis deux jours',
  },
  {
    mrn: 'CSC-2026-00005',
    prenom: 'Gaston',
    nom: 'Dossou',
    naissance: '1969-08-05',
    genre: 'male',
    ville: 'Abomey-Calavi',
    langue: 'fr',
    poste: 'CONS-1',
    gravite: 'differable',
    etat: 'en-attente',
    // 150 minutes : remonte aussi, et passe devant les autres differables
    // SANS jamais passer devant un cas plus grave. C'est la composition des
    // deux regles qu'il faut pouvoir montrer.
    attenteMinutes: 150,
    partiApresMinutes: null,
    motif: 'Renouvellement d ordonnance',
  },
  {
    mrn: 'CSC-2026-00006',
    prenom: 'Delphine',
    nom: 'Zinsou',
    naissance: '2017-01-24',
    genre: 'female',
    ville: 'Cotonou',
    langue: 'fr',
    poste: 'CONS-1',
    gravite: 'standard',
    etat: 'en-attente',
    attenteMinutes: 40,
    partiApresMinutes: null,
    motif: 'Toux et fievre',
  },
  {
    mrn: 'CSC-2026-00007',
    prenom: 'Felicite',
    nom: 'Agbo',
    naissance: '1986-12-02',
    genre: 'female',
    ville: 'Porto-Novo',
    langue: 'fon',
    poste: 'CONS-1',
    // PARTIE SANS AVOIR ETE VUE, apres plus de trois heures. C'est
    // l'indicateur le plus direct d'un poste sature, et le seul que
    // l'application perdrait si « parti » etait confondu avec « termine ».
    gravite: 'standard',
    etat: 'parti',
    attenteMinutes: 190,
    partiApresMinutes: 170,
    motif: 'Controle de tension',
  },
  {
    mrn: 'CSC-2026-00008',
    prenom: 'Rachidou',
    nom: 'Bio',
    naissance: '1984-06-30',
    genre: 'male',
    ville: 'Parakou',
    langue: 'fr',
    poste: 'TRI',
    // ARRIVE EN DERNIER, APPELE EN PREMIER. Si la file le place derriere
    // quiconque, le triage ne fonctionne pas.
    gravite: 'vitale',
    etat: 'en-attente',
    attenteMinutes: 6,
    partiApresMinutes: null,
    motif: 'Detresse respiratoire',
  },
  {
    mrn: 'CSC-2026-00009',
    prenom: 'Marguerite',
    nom: 'Tossou',
    naissance: '1995-05-19',
    genre: 'female',
    ville: 'Cotonou',
    langue: 'fon',
    poste: 'TRI',
    gravite: 'standard',
    etat: 'en-attente',
    attenteMinutes: 25,
    partiApresMinutes: null,
    motif: 'Plaie du pied',
  },
];

/**
 * Checklist du bloc, temps par temps.
 *
 * Le temps « avant induction » est complet ; « avant incision » ne l'est
 * PAS. L'etat choisi pour l'intervention est donc « patient au bloc » : le
 * patient est entre, et l'ecran doit nommer les deux points qui manquent
 * avant qu'on incise. Une checklist entierement cochee ne montre rien.
 */
const CHECKLIST_FAITE = {
  'avant-induction': ['identite', 'consentement', 'site-marque', 'allergies', 'materiel'],
  'avant-incision': ['equipe-presentee', 'antibioprophylaxie'],
} as const;

/**
 * Construit le parcours. Ordre des ecritures = ordre d'insertion : une
 * ligne ne reference jamais une ligne posee apres elle.
 */
export function parcoursDemonstration(ctx: ContexteDemo): Ecriture[] {
  const { maintenant, id, organizationId: org, practitionerId: dr } = ctx;
  const ecritures: Ecriture[] = [];

  const poser = (table: string, ligne: Ligne) => {
    ecritures.push({ op: 'inserer', table, ligne });
    return String(ligne.id);
  };
  const corriger = (table: string, cible: string, champs: Ligne) =>
    ecritures.push({ op: 'modifier', table, id: cible, champs });

  /** Horodatage a N minutes de l'instant de reference (negatif = passe). */
  const t = (minutes: number) => horodatage(new Date(maintenant.getTime() + minutes * MINUTE));
  /** Date seule a N jours. */
  const j = (jours: number) => jourSeul(new Date(maintenant.getTime() + jours * JOUR));

  // ------------------------------------------------------- salle d'attente
  //
  // Un patient n'attend qu'a un seul endroit a la fois : la base le tient
  // par un index unique sur les passages ouverts d'un meme sejour. Chaque
  // personne de la salle d'attente a donc SON sejour externe.

  for (const p of SALLE_ATTENTE) {
    const patientId = poser('patient', {
      id: id(),
      mrn: p.mrn,
      given_name: p.prenom,
      family_name: p.nom,
      birth_date: p.naissance,
      gender: p.genre,
      city: p.ville,
      district: null,
      country: 'BJ',
      preferred_language: p.langue,
      organization_id: org,
      created_at: t(-p.attenteMinutes),
      updated_at: t(-p.attenteMinutes),
    });

    const parti = p.etat === 'parti';
    // Pour qui est reparti : l'heure du depart, comptee depuis son arrivee.
    const departLe = parti ? t(-(p.attenteMinutes - (p.partiApresMinutes ?? 0))) : null;
    const sejourId = poser('sejour', {
      id: id(),
      patient_id: patientId,
      organization_id: org,
      type: 'externe',
      statut: parti ? 'sorti' : 'en-cours',
      lit_id: null,
      motif: p.motif,
      mode_entree: 'domicile',
      mode_sortie: parti ? 'parti-sans-soins' : null,
      admis_le: t(-p.attenteMinutes),
      sorti_le: departLe,
      created_at: t(-p.attenteMinutes),
      updated_at: t(-p.attenteMinutes),
    });

    poser('passage', {
      id: id(),
      sejour_id: sejourId,
      poste_id: ctx.postes[p.poste],
      gravite: p.gravite,
      etat: p.etat,
      arrive_le: t(-p.attenteMinutes),
      pris_en_charge_le: null,
      // Un patient parti a une heure de depart, et c'est tout ce qu'on sait
      // de lui : personne ne l'a pris en charge.
      termine_le: departLe,
      acteur_id: null,
      created_at: t(-p.attenteMinutes),
    });
  }

  // L'enfant de la consultation de demonstration est EN COURS au poste de
  // consultation : l'ecran du flux et l'ecran de la consultation parlent du
  // meme patient au meme instant, ce qui est tout l'interet de les montrer
  // l'un apres l'autre.
  const sejourKoffi = poser('sejour', {
    id: id(),
    patient_id: ctx.patients.koffi,
    organization_id: org,
    type: 'externe',
    statut: 'en-cours',
    lit_id: null,
    motif: 'Fievre depuis trois jours',
    mode_entree: 'domicile',
    mode_sortie: null,
    admis_le: t(-35),
    sorti_le: null,
    created_at: t(-35),
    updated_at: t(-12),
  });
  poser('passage', {
    id: id(),
    sejour_id: sejourKoffi,
    poste_id: ctx.postes['CONS-1'],
    gravite: 'urgente',
    etat: 'en-cours',
    arrive_le: t(-35),
    pris_en_charge_le: t(-12),
    termine_le: null,
    acteur_id: dr,
    created_at: t(-35),
  });

  // --------------------------------------- consultation prenatale, il y a 2 jours
  //
  // Celle-ci est CLOSE, et c'est elle qui porte un dossier complet :
  // observations, diagnostic, examen demande, ordonnance validee. Elle
  // existe pour que les ecrans de dossier et d'ordonnance aient quelque
  // chose a montrer SANS toucher a la consultation pediatrique, qu'on
  // analyse en direct.
  //
  // Elle est tenue EN FON : c'est la langue declaree de la patiente, et
  // l'axe de la contribution. L'ecran doit pouvoir le montrer.

  const sejourAdjoa = poser('sejour', {
    id: id(),
    patient_id: ctx.patients.adjoa,
    organization_id: org,
    type: 'externe',
    statut: 'sorti',
    lit_id: null,
    motif: 'Consultation prenatale du troisieme trimestre',
    mode_entree: 'domicile',
    mode_sortie: 'domicile',
    admis_le: t(-2 * 1440),
    sorti_le: t(-2 * 1440 + 95),
    created_at: t(-2 * 1440),
    updated_at: t(-2 * 1440 + 95),
  });

  const consultAdjoa = poser('consultation', {
    id: id(),
    patient_id: ctx.patients.adjoa,
    practitioner_id: dr,
    status: 'signed',
    encounter_class: 'AMB',
    reason_text: 'Consultation prenatale du troisieme trimestre',
    started_at: t(-2 * 1440),
    ended_at: t(-2 * 1440 + 40),
    signed_at: t(-2 * 1440 + 55),
    language: 'fon',
    consent_recording: 1,
    consent_at: t(-2 * 1440),
    location: 'Centre de Sante de Cotonou',
    audio_duration_s: 1_140,
    sejour_id: sejourAdjoa,
    organization_id: org,
    created_at: t(-2 * 1440),
    updated_at: t(-2 * 1440 + 55),
  });

  const observations = [
    { label: 'Tension arterielle systolique', loinc: '8480-6', v: 118, u: 'mmHg', ucum: 'mm[Hg]' },
    { label: 'Tension arterielle diastolique', loinc: '8462-4', v: 72, u: 'mmHg', ucum: 'mm[Hg]' },
    { label: 'Poids', loinc: '29463-7', v: 62, u: 'kg', ucum: 'kg' },
    { label: 'Hauteur uterine', loinc: '11881-0', v: 30, u: 'cm', ucum: 'cm' },
    { label: 'Temperature', loinc: '8310-5', v: 36.9, u: 'degres C', ucum: 'Cel' },
  ];
  for (const o of observations) {
    poser('observation', {
      id: id(),
      patient_id: ctx.patients.adjoa,
      consultation_id: consultAdjoa,
      category: 'vital-signs',
      code_loinc: o.loinc,
      label: o.label,
      value_num: o.v,
      value_text: null,
      unit: o.u,
      ucum: o.ucum,
      interpretation: null,
      effective_at: t(-2 * 1440 + 15),
      // Relevees au brassard et notees par le praticien : ce ne sont pas
      // des valeurs extraites de la parole, et la colonne doit le dire.
      source: 'clinician',
      confidence: null,
    });
  }

  poser('diagnosis', {
    id: id(),
    consultation_id: consultAdjoa,
    patient_id: ctx.patients.adjoa,
    label: 'Surveillance de grossesse normale',
    icd10_code: 'Z34',
    snomed_code: '72892002',
    rank: 1,
    certainty: 'confirmed',
    confidence: null,
    rationale: 'Terme concordant, tension normale, pas de signe d alerte.',
    created_at: t(-2 * 1440 + 45),
  });

  // L'examen demande en consultation et la demande qui circule au plateau
  // sont DEUX objets distincts : l'un est la prescription telle qu'elle sort
  // de la rencontre, l'autre porte le circuit. Les relier ici est ce qui
  // permet, depuis un resultat, de remonter a la phrase qui l'a demande.
  const demandeEcho = poser('service_request', {
    id: id(),
    consultation_id: consultAdjoa,
    patient_id: ctx.patients.adjoa,
    label: 'Echographie obstetricale',
    loinc_code: '11525-3',
    category: 'imaging',
    priority: 'routine',
    reason: 'Troisieme trimestre : presentation et liquide amniotique.',
    status: 'active',
    created_at: t(-2 * 1440 + 50),
  });
  corriger('demande_examen', ctx.demandeEchographie, {
    service_request_id: demandeEcho,
    sejour_id: sejourAdjoa,
  });

  // ------------------------------------------------------------ ordonnance
  //
  // Validee par le medecin, horodatee et signee : une ordonnance en
  // brouillon n'existe pas juridiquement, et une demonstration qui en
  // montrerait une comme un document delivre serait fausse.

  const ordonnance = poser('prescription', {
    id: id(),
    consultation_id: consultAdjoa,
    patient_id: ctx.patients.adjoa,
    practitioner_id: dr,
    status: 'validated',
    origin: 'ai-proposed',
    notes: 'Traitement preventif intermittent du paludisme, troisieme dose.',
    safety_json: null,
    validated_by: dr,
    validated_at: t(-2 * 1440 + 55),
    validation_note: 'Posologie verifiee, grossesse au troisieme trimestre.',
    cancelled_reason: null,
    qr_payload: null,
    created_at: t(-2 * 1440 + 50),
    updated_at: t(-2 * 1440 + 55),
  });

  const lignesOrdonnance = [
    {
      seq: 1,
      // EN RUPTURE FRANCHE au rayon : aucun lot. L'ordonnance est valide,
      // la pharmacie ne peut pas la servir, et l'ecran doit distinguer
      // « rupture » de « stock a zero ». C'est la ligne qui fait la
      // demonstration de la dispensation partielle.
      drug_name: 'Sulfadoxine/pyrimethamine',
      atc_code: 'P01BD51',
      form: 'comprime',
      strength: '500/25 mg',
      dose: '3 comprimes en prise unique',
      frequency: 'dose unique supervisee',
      frequency_per_day: 1,
      duration_days: 1,
      quantity: '3 comprimes',
      instructions: 'A prendre devant le soignant.',
      essentielle: 1,
    },
    {
      seq: 2,
      drug_name: 'Amoxicilline',
      atc_code: 'J01CA04',
      form: 'comprime',
      strength: '500 mg',
      dose: '1 comprime',
      frequency: 'trois fois par jour',
      frequency_per_day: 3,
      duration_days: 7,
      quantity: '21 comprimes',
      instructions: 'Pendant les repas. Aller au bout des sept jours.',
      essentielle: 1,
    },
  ];
  for (const l of lignesOrdonnance) {
    poser('prescription_item', {
      id: id(),
      prescription_id: ordonnance,
      seq: l.seq,
      drug_name: l.drug_name,
      brand_name: null,
      atc_code: l.atc_code,
      form: l.form,
      strength: l.strength,
      dose: l.dose,
      route: 'oral',
      frequency: l.frequency,
      frequency_per_day: l.frequency_per_day,
      duration_days: l.duration_days,
      quantity: l.quantity,
      instructions: l.instructions,
      substitution_allowed: 1,
      is_essential_list: l.essentielle,
      ai_confidence: null,
      ai_rationale: null,
      edited_by_clinician: 1,
      created_at: t(-2 * 1440 + 50),
    });
  }

  // ---------------------------------------------------------- dispensation
  //
  // SERVIE SUR LE LOT QUI PERIME LE PREMIER, pas sur le plus gros. Le rayon
  // porte deux lots d'amoxicilline : 600 boites a longue peremption et 150
  // a trois semaines. Servir les 600 laisserait perimer les 150, et c'est
  // exactement le gaspillage qu'une pharmacie de centre de sante ne peut pas
  // se permettre. Le lot court doit sortir en premier.

  const amox = ctx.articles['Amoxicilline'];
  const lotCourt = [...amox.lots].sort((a, b) => (a.perimeLe < b.perimeLe ? -1 : 1))[0];
  const servi = 21;

  const dispensation = poser('dispensation', {
    id: id(),
    sejour_id: sejourAdjoa,
    patient_id: ctx.patients.adjoa,
    prescription_id: ordonnance,
    organization_id: org,
    acteur_id: dr,
    servi_le: t(-2 * 1440 + 75),
  });
  poser('dispensation_ligne', {
    id: id(),
    dispensation_id: dispensation,
    article_id: amox.id,
    lot_id: lotCourt.id,
    // Le numero de lot est COPIE, pas seulement reference : un rappel de
    // lot se fait des annees plus tard, et la ligne doit encore savoir ce
    // qu'elle a servi meme si la fiche du lot a disparu.
    numero_lot: lotCourt.numero,
    perime_le: lotCourt.perimeLe,
    quantite: servi,
    created_at: t(-2 * 1440 + 75),
  });
  poser('mouvement_stock', {
    id: id(),
    lot_id: lotCourt.id,
    article_id: amox.id,
    type: 'dispensation',
    // Signe negatif : une sortie. Un journal ou tout est positif ne
    // s'additionne plus.
    quantite: -servi,
    motif: 'Ordonnance du ' + j(-2),
    acteur_id: dr,
    survenu_le: t(-2 * 1440 + 75),
  });
  corriger('lot', lotCourt.id, { quantite: lotCourt.quantite - servi });

  // --------------------------------------------------------------- caisse
  //
  // Deux factures, parce que les deux situations se montrent :
  //   - celle d'Adjoa est SOLDEE : le cas ou la caisse ne dit rien ;
  //   - celle de Bernard ne l'est pas, et porte un acte programmable, donc
  //     l'avis bloque ce qui peut attendre — et seulement cela. Une facture
  //     impayee ne retarde jamais un acte vital, et c'est la regle qu'il
  //     faut voir a l'ecran.

  const factureAdjoa = poser('facture', {
    id: id(),
    sejour_id: sejourAdjoa,
    organization_id: org,
    part_tiers: 0,
    tiers_nom: null,
    close: 1,
    created_at: t(-2 * 1440 + 60),
    updated_at: t(-2 * 1440 + 80),
  });
  for (const l of [
    { libelle: 'Consultation prenatale', montant: TARIF.consultationExterne, q: 1, urgence: 'programmable' },
    { libelle: 'Amoxicilline 500 mg (21 comprimes)', montant: TARIF.amoxicilline, q: 1, urgence: 'programmable' },
  ]) {
    poser('facture_ligne', {
      id: id(),
      facture_id: factureAdjoa,
      libelle: l.libelle,
      montant: l.montant,
      quantite: l.q,
      urgence: l.urgence,
      acteur_id: dr,
      created_at: t(-2 * 1440 + 60),
    });
  }
  poser('paiement', {
    id: id(),
    facture_id: factureAdjoa,
    montant: TARIF.consultationExterne + TARIF.amoxicilline,
    moyen: 'especes',
    reference: null,
    acteur_id: dr,
    recu_le: t(-2 * 1440 + 80),
  });

  // Facture de l'hospitalisation en cours. Une mutuelle prend une part
  // ABSOLUE, pas un pourcentage : c'est ainsi que fonctionnent les
  // conventions locales, et un taux s'appliquerait a des actes qu'elle ne
  // couvre pas.
  const partTiers = 20_000;
  const factureBernard = poser('facture', {
    id: id(),
    sejour_id: ctx.sejourBernard,
    organization_id: org,
    part_tiers: partTiers,
    tiers_nom: 'Mutuelle des producteurs de l Oueme',
    close: 0,
    created_at: t(-1440),
    updated_at: t(-30),
  });
  const lignesBernard = [
    { libelle: 'Consultation d urgence', montant: TARIF.consultationUrgence, q: 1, urgence: 'urgente', quand: -1440 },
    { libelle: 'Journee d hospitalisation', montant: TARIF.journeeHospitalisation, q: 2, urgence: 'programmable', quand: -1440 },
    { libelle: 'Kaliemie', montant: TARIF.kaliemie, q: 1, urgence: 'urgente', quand: -180 },
    { libelle: 'Glycemie', montant: TARIF.glycemie, q: 1, urgence: 'urgente', quand: -180 },
    // L'acte PROGRAMMABLE : c'est lui, et lui seul, que l'impaye peut
    // retarder. Il est au programme du bloc aujourd'hui, donc l'avis
    // tombera au moment ou on regardera l'ecran.
    { libelle: 'Cure de hernie inguinale', montant: TARIF.cureHernie, q: 1, urgence: 'programmable', quand: -60 },
  ];
  for (const l of lignesBernard) {
    poser('facture_ligne', {
      id: id(),
      facture_id: factureBernard,
      libelle: l.libelle,
      montant: l.montant,
      quantite: l.q,
      urgence: l.urgence,
      acteur_id: dr,
      created_at: t(l.quand),
    });
  }
  // Deux versements partiels, dont un en mobile money avec sa reference :
  // c'est le moyen de paiement majoritaire, et l'absence de reference est
  // precisement ce qui rend un rapprochement impossible le soir.
  poser('paiement', {
    id: id(),
    facture_id: factureBernard,
    montant: 15_000,
    moyen: 'mobile',
    reference: 'MM-240917-884213',
    acteur_id: dr,
    recu_le: t(-1380),
  });
  poser('paiement', {
    id: id(),
    facture_id: factureBernard,
    montant: 5_000,
    moyen: 'especes',
    reference: null,
    acteur_id: dr,
    recu_le: t(-30),
  });

  // ------------------------------------------------------ plateau technique
  //
  // LA CHAINE COMPLETE D'UNE VALEUR CRITIQUE, en quatre temps : une valeur
  // d'abord rendue normale, sa correction, la conservation de l'ancienne
  // version, et l'acquittement nomme de la nouvelle. C'est l'enchainement
  // qu'on ne retrouve jamais dans les dossiers apres un accident, et celui
  // que l'application doit savoir produire toute seule.

  const premiereKaliemie = poser('resultat_examen', {
    id: id(),
    demande_id: ctx.demandeKaliemie,
    valeur_num: 4.2,
    valeur_texte: null,
    unite: 'mmol/l',
    interpretation: 'normal',
    a_transmettre: 0,
    rendu_par: 'Automate BIO-2',
    rendu_le: t(-150),
    remplace_par: null,
    motif_correction: null,
  });
  const kaliemieCorrigee = poser('resultat_examen', {
    id: id(),
    demande_id: ctx.demandeKaliemie,
    valeur_num: 6.8,
    valeur_texte: null,
    unite: 'mmol/l',
    // Au-dessus de la borne haute de l'etablissement (6,0 mmol/l) : la
    // valeur est critique, et l'etablissement a valide ce seuil. Sans
    // ligne de seuil, elle serait rendue « non interpretee » — voir la
    // goutte epaisse plus bas.
    interpretation: 'critique',
    a_transmettre: 0,
    rendu_par: 'Automate BIO-2',
    rendu_le: t(-120),
    remplace_par: null,
    motif_correction: null,
  });
  // L'ANCIENNE VERSION N'EST PAS EFFACEE : elle est marquee remplacee, avec
  // le motif. Un clinicien a pu prescrire sur la foi du 4,2 ; effacer la
  // ligne efface la raison de ce qu'il a fait.
  corriger('resultat_examen', premiereKaliemie, {
    remplace_par: kaliemieCorrigee,
    motif_correction: 'Inversion de tube avec le lit voisin, detectee au controle d identite.',
  });
  poser('acquittement_critique', {
    id: id(),
    resultat_id: kaliemieCorrigee,
    // Un destinataire NOMME. « Transmis » sans nom est exactement ce qu'on
    // retrouve dans les dossiers apres un accident : la case est cochee, et
    // personne ne se souvient d'avoir ete appele.
    transmis_a: ctx.praticienNom,
    transmis_par: 'Biologiste de garde',
    commentaire: 'Appelee au telephone, ECG demande dans la foulee.',
    transmis_le: t(-112),
  });
  corriger('demande_examen', ctx.demandeKaliemie, { etat: 'validee' });

  // Une glycemie dans les bornes. « Normal » ne veut pas dire « bon » : il
  // veut dire « pas critique ». Un diabetique desequilibre a 1,9 g/l n'a
  // rien de rassurant, et l'ecran ne doit surtout pas le presenter comme
  // tel. Le mot porte sur le SEUIL D ALERTE, pas sur la clinique.
  const demandeGlycemie = poser('demande_examen', {
    id: id(),
    patient_id: ctx.patients.bernard,
    sejour_id: ctx.sejourBernard,
    service_request_id: null,
    organization_id: org,
    domaine: 'laboratoire',
    examen: 'Glycemie',
    loinc_code: '2339-0',
    priorite: 'urgente',
    etat: 'validee',
    demandee_le: t(-190),
    prelevee_le: t(-175),
    preleve_par: 'Infirmier de garde',
    identite_verifiee: 1,
    created_at: t(-190),
  });
  poser('resultat_examen', {
    id: id(),
    demande_id: demandeGlycemie,
    valeur_num: 1.9,
    valeur_texte: null,
    unite: 'g/l',
    interpretation: 'normal',
    a_transmettre: 0,
    rendu_par: 'Automate BIO-2',
    rendu_le: t(-140),
    remplace_par: null,
    motif_correction: null,
  });

  // UNE VALEUR CRITIQUE QUI ATTEND ENCORE SA TRANSMISSION. C'est l'etat que
  // l'ecran doit crier : une anemie severe chez une femme au troisieme
  // trimestre, rendue il y a vingt minutes, que personne n'a encore
  // acquittee. Tout le reste de la demonstration peut etre calme ; pas
  // cette ligne-la.
  const demandeHb = poser('demande_examen', {
    id: id(),
    patient_id: ctx.patients.adjoa,
    sejour_id: sejourAdjoa,
    service_request_id: null,
    organization_id: org,
    domaine: 'laboratoire',
    examen: 'Hemoglobine',
    loinc_code: '718-7',
    priorite: 'urgente',
    etat: 'resultat-disponible',
    demandee_le: t(-95),
    prelevee_le: t(-80),
    preleve_par: 'Infirmier de garde',
    identite_verifiee: 1,
    created_at: t(-95),
  });
  poser('resultat_examen', {
    id: id(),
    demande_id: demandeHb,
    valeur_num: 5.4,
    valeur_texte: null,
    unite: 'g/dl',
    interpretation: 'critique',
    a_transmettre: 1,
    rendu_par: 'Automate HEM-1',
    rendu_le: t(-20),
    remplace_par: null,
    motif_correction: null,
  });

  // SANS SEUIL, PAS D'INTERPRETATION. La goutte epaisse se rend en
  // parasitemie, et le seuil d'alerte depend du contexte de transmission :
  // l'etablissement n'en a pas pose. L'application s'abstient donc, et le
  // dit. Recopier un seuil d'ailleurs engagerait un laboratoire qui ne l'a
  // jamais valide.
  const demandeGE = poser('demande_examen', {
    id: id(),
    patient_id: ctx.patients.koffi,
    sejour_id: sejourKoffi,
    service_request_id: null,
    organization_id: org,
    domaine: 'laboratoire',
    examen: 'Goutte epaisse',
    loinc_code: '32700-7',
    priorite: 'urgente',
    etat: 'resultat-disponible',
    demandee_le: t(-30),
    prelevee_le: t(-25),
    preleve_par: 'Technicien de laboratoire',
    identite_verifiee: 1,
    created_at: t(-30),
  });
  poser('resultat_examen', {
    id: id(),
    demande_id: demandeGE,
    valeur_num: 2_400,
    valeur_texte: 'Presence de trophozoites de Plasmodium falciparum.',
    unite: 'parasites/ul',
    interpretation: 'non-interprete',
    a_transmettre: 0,
    rendu_par: 'Technicien de laboratoire',
    rendu_le: t(-8),
    remplace_par: null,
    motif_correction: null,
  });

  // --------------------------------------------------------- bloc operatoire
  //
  // Le patient est ENTRE AU BLOC, et le temps « avant incision » n'est pas
  // complet : il manque la confirmation a voix haute par toute l'equipe et
  // l'imagerie. L'ecran doit nommer ces deux points, et refuser l'incision
  // tant qu'ils ne sont pas coches. Une checklist entierement cochee dans
  // un jeu de demonstration ne prouve rien — surtout pas qu'elle bloque.

  corriger('intervention', ctx.interventionHernie, {
    etat: 'patient-au-bloc',
    entree_le: t(-25),
    updated_at: t(-25),
  });
  for (const [temps, points] of Object.entries(CHECKLIST_FAITE)) {
    points.forEach((point, i) => {
      poser('checklist_bloc', {
        id: id(),
        intervention_id: ctx.interventionHernie,
        temps,
        point,
        coche_par: ctx.praticienNom,
        coche_le: t(-24 + i),
      });
    });
  }

  return ecritures;
}

/**
 * Compte les ecritures par table. Sert au recapitulatif affiche en fin de
 * `npm run seed` : une demonstration qu'on prepare la veille se verifie en
 * lisant ce recapitulatif, pas en ouvrant douze ecrans.
 */
export function recapitulatif(ecritures: Ecriture[]): Record<string, number> {
  const parTable: Record<string, number> = {};
  for (const e of ecritures) {
    if (e.op !== 'inserer') continue;
    parTable[e.table] = (parTable[e.table] ?? 0) + 1;
  }
  return parTable;
}
