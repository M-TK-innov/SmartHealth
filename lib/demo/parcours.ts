/**
 * Parcours guide de la demonstration.
 *
 * CE QUI JUSTIFIE CE FICHIER : une plateforme hospitaliere ne se decouvre
 * pas en cliquant au hasard. Les regles qui font sa valeur ne se voient
 * qu'en essayant de les enfreindre — on ne constate pas qu'un lit ne porte
 * qu'un patient en regardant un lit, mais en essayant d'y en mettre deux.
 *
 * Chaque etape dit donc QUOI faire et CE QU'ON DOIT VOIR. Sans la seconde
 * moitie, un visiteur qui rencontre un refus conclut que l'application
 * plante, la ou elle fait precisement son travail.
 */

export const MOT_DE_PASSE_DEMO = 'ParleDocteur2026!';

export interface CompteDemo {
  email: string;
  role: string;
  peut: string;
}

export const COMPTES: CompteDemo[] = [
  {
    email: 'a.sossou@example.bj',
    role: 'Medecin',
    peut: "Consulte, dicte, signe, prescrit. Appelle son patient suivant, voit le reste a charge et le stock, demande des examens et opere. N'encaisse pas, ne dispense pas, ne saisit pas de resultat.",
  },
  {
    email: 'direction@csc.bj',
    role: 'Etablissement',
    peut: "Tous les modules hospitaliers : lits, files, caisse, pharmacie, laboratoire, bloc. Valide les comptes de ses medecins. N'accede pas a la console plateforme.",
  },
  {
    email: 'ministere@sante.bj',
    role: 'Ministere',
    peut: "Indicateurs agreges et surveillance epidemiologique. Aucun dossier nominatif — plusieurs etapes consistent a verifier qu'il se voit refuser l'acces.",
  },
  {
    email: 'admin@parledocteur.local',
    role: 'Administrateur',
    peut: 'Organisations, comptes, politique de mots de passe, sessions, journal.',
  },
  {
    email: 'super@parledocteur.local',
    role: 'Super-administrateur',
    peut: 'Tout, y compris la base, les serveurs et la matrice des permissions elle-meme.',
  },
];

export interface Etape {
  quoi: string;
  attendu: string;
  ou?: string;
}

export interface GroupeParcours {
  titre: string;
  pourquoi: string;
  etapes: Etape[];
}

export const PARCOURS: GroupeParcours[] = [
  {
    titre: 'La consultation',
    pourquoi:
      "Le coeur du produit : l'application ecoute, structure, et le praticien valide. Rien n'entre au dossier sans lui.",
    etapes: [
      {
        quoi: "Ouvrir la consultation de demonstration et lire la transcription deja capturee.",
        attendu:
          "Chaque tour de parole est attribue — medecin, patient, accompagnant — avec le degre de certitude. Les tours indetermines sont nommes, pas devines.",
        ou: '/consultations',
      },
      {
        quoi: "Lancer l'analyse, puis relire le compte rendu propose.",
        attendu:
          "Les elements extraits renvoient a la phrase qui les justifie. Ce qui n'a pas ete dit n'est pas invente : les champs absents restent vides.",
      },
      {
        quoi: "Dicter quelques phrases au micro, puis s'arreter en pleine phrase.",
        attendu:
          "Le dernier tour de parole entre bien au dossier — il etait perdu auparavant. Les formules de sous-titrage que le modele produit sur du silence sont ecartees ; « Merci. » reste.",
      },
      {
        quoi: 'Corriger un mot mal transcrit dans le validateur, puis recommencer une dictee.',
        attendu:
          "La correction est retenue comme une lecon et appliquee sans redemarrage. Les lecons apprises sont consultables, et revocables une par une.",
        ou: '/corrections',
      },
      {
        quoi: "Valider l'ordonnance proposee.",
        attendu:
          "Les alertes de securite — allergie, interaction, posologie pediatrique — s'affichent avant la signature, pas apres.",
      },
    ],
  },
  {
    titre: "Le sejour : de l'entree a la sortie",
    pourquoi:
      "Un lit ne porte qu'un patient. L'invariant tient dans la base, pas seulement dans le code qui l'appelle.",
    etapes: [
      {
        quoi: "Regarder le tableau d'occupation, puis admettre un patient dans un lit libre.",
        attendu:
          "Les lits hors service sont retires du denominateur. Un lit qu'on vient de liberer repasse « a preparer », jamais « libre ».",
        ou: '/hopital',
      },
      {
        quoi: 'Essayer d admettre un second patient dans le lit qui vient d etre pris.',
        attendu:
          "Refus 409, avec le motif ET le remede : « Choisir un lit libre, ou sortir ou transferer son occupant avant. » L'agent d'accueil peut agir sans appeler l'informatique.",
      },
      {
        quoi: 'Ouvrir le dossier de sejour depuis la liste des patients presents.',
        attendu:
          "Le parcours lit par lit, les consultations rattachees au sejour — par le lien, pas par les dates — la file d'attente et la caisse, sur un seul ecran.",
      },
    ],
  },
  {
    titre: "Les files d'attente",
    pourquoi:
      "Une urgence vitale ne passe jamais derriere un cas moins grave, meme apres une tres longue attente du second.",
    etapes: [
      {
        quoi: 'Ouvrir la file du poste de triage.',
        attendu:
          "L'urgence vitale est en tete malgre son arrivee recente. Un cas « differable » qui attend depuis plus de 90 minutes porte la mention « remonte » et passe devant les standards — sans jamais depasser la vitale.",
        ou: '/hopital',
      },
      {
        quoi: "Appeler un patient, puis essayer de l'appeler une seconde fois.",
        attendu: 'Refus : il est deja pris en charge. Le bandeau dit quoi faire, et la file se resynchronise.',
      },
      {
        quoi: "Marquer un patient « parti » plutot que « termine ».",
        attendu:
          "Le compteur « partis sans etre vus » monte. C'est le seul indicateur qui compte des gens plutot que des actes, et le confondre avec « termine » le ferait disparaitre.",
      },
    ],
  },
  {
    titre: 'La caisse',
    pourquoi:
      "L'argent ne barre pas la route d'un soin urgent. Une facture impayee se recouvre, une prise en charge retardee ne se rattrape pas.",
    etapes: [
      {
        quoi: "Ouvrir la caisse d'un sejour avec un impaye, en ajoutant « ?urgence=vitale » a l'adresse.",
        attendu:
          "L'encadre est sobre et dit que l'acte est realise, la regularisation ensuite. Avec « ?urgence=programmable », le meme impaye devient bloquant.",
      },
      {
        quoi: 'Encaisser plus que le reste a charge.',
        attendu:
          "Refus, avec le montant exact a encaisser et la consigne de rendre la difference. La caisse ne decide pas seule qu'un patient vient de faire un don.",
      },
      {
        quoi: 'Se connecter en medecin et tenter un encaissement.',
        attendu:
          "403. Il voit le reste a charge — il doit pouvoir en parler — mais celui qui soigne n'est pas celui qui tient la caisse.",
      },
    ],
  },
  {
    titre: 'La pharmacie',
    pourquoi: 'Un lot perime ne sort pas. Jamais, pas meme s il ne reste que lui.',
    etapes: [
      {
        quoi: 'Regarder le rayon : une reference est en rupture, une autre entierement perimee.',
        attendu:
          "Les deux etats sont distingues, parce que le remede differe. « Bientot perime » est compte a part : c'est le seul chiffre sur lequel on peut encore agir.",
        ou: '/hopital/pharmacie',
      },
      {
        quoi: 'Dispenser la ceftriaxone, dont tous les lots sont perimes.',
        attendu:
          "Refus, avec la consigne de retirer les boites du rayon et de commander en urgence.",
      },
      {
        quoi: "Dispenser de l'amoxicilline a Bernard Houngbedji.",
        attendu:
          "Refus pour allergie, avec renvoi vers le prescripteur — et non vers une autre pharmacie ou il trouverait le produit.",
      },
      {
        quoi: "Demander plus d'unites qu'il n'en reste.",
        attendu:
          "Refus par defaut, en chiffrant ce qui manque. La dispensation partielle doit etre un choix explicite du pharmacien.",
      },
    ],
  },
  {
    titre: 'Laboratoire et imagerie',
    pourquoi:
      "Une valeur critique est acquittee, pas affichee. Tant que personne n'est nomme, elle n'a ete transmise a personne.",
    etapes: [
      {
        quoi: 'Ouvrir le plateau technique : une kaliemie critique attend en tete, en rouge.',
        attendu:
          "Le compteur « critiques non transmises » doit valoir zero, et ne vaut pas zero. C'est le chiffre a surveiller.",
        ou: '/hopital/plateau',
      },
      {
        quoi: "Acquitter en laissant le champ du nom vide.",
        attendu:
          "Refus. Un acquittement anonyme n'acquitte rien : c'est exactement ce qu'on retrouve dans les dossiers apres un accident, la case cochee et personne qui se souvienne d'avoir ete appele.",
      },
      {
        quoi: "Enregistrer un prelevement en annoncant une date de naissance erronee.",
        attendu:
          "Refus pour discordance d'identite, avec la consigne de ne pas prelever. Le nom seul ne suffit pas : deux homonymes dans un service ne sont pas une hypothese d'ecole.",
      },
      {
        quoi: "Corriger un resultat deja rendu, puis rouvrir la demande.",
        attendu:
          "Les deux versions coexistent ; l'ancienne est barree et marquee remplacee. Un clinicien a pu prescrire sur sa foi.",
      },
      {
        quoi: "Regarder un examen sans seuil configure — la goutte epaisse.",
        attendu:
          "Le resultat est rendu « non interprete », et l'ecran dit pourquoi. Il n'est jamais declare normal faute de seuil.",
      },
    ],
  },
  {
    titre: 'Le bloc operatoire',
    pourquoi:
      "On n'incise pas sans time out. La checklist de l'OMS existe parce qu'on a opere des gens du mauvais cote.",
    etapes: [
      {
        quoi: 'Ouvrir le programme du jour.',
        attendu:
          "Le cote est affiche en rouge et en majuscules a cote du geste. C'est la seule information de cette liste dont une erreur ne se rattrape pas.",
        ou: '/hopital/bloc',
      },
      {
        quoi: "Ouvrir la cure de hernie et essayer d'inciser sans rien cocher.",
        attendu:
          "Le bouton est inactif, et le serveur refuse de toute facon. Le refus nomme les points qui manquent, un par un.",
      },
      {
        quoi: "Cocher les cinq points « avant induction », puis enregistrer l'entree au bloc.",
        attendu:
          "Le bouton d'entree s'active a 5/5. « Inciser » reste bloque : cocher un temps ne complete pas les autres.",
      },
      {
        quoi: 'Completer le time out, puis inciser, puis tenter de sortir de salle.',
        attendu:
          "La sortie est refusee tant que les compresses ne sont pas comptees — et le refus le dit avec ces mots-la.",
      },
      {
        quoi: 'Programmer une intervention qui chevauche une autre dans la meme salle.',
        attendu:
          "Refus, avec le creneau et le geste qui occupent deja la salle. Un creneau qui commence a la fin du precedent passe, lui.",
      },
    ],
  },
  {
    titre: 'Interoperabilite et pilotage',
    pourquoi:
      "Le dossier doit pouvoir sortir de l'application : un systeme qui enferme les donnees est un systeme qu'on remplace en les perdant.",
    etapes: [
      {
        quoi: 'Exporter une consultation en FHIR R4, en HL7 v2 et en DHIS2.',
        attendu:
          "Trois formats depuis le meme dossier. Le CapabilityStatement declare la securite reellement offerte, pas une negociation que le serveur n'assure pas.",
        ou: '/interop',
      },
      {
        quoi: 'Se connecter en ministere et tenter d ouvrir un dossier patient.',
        attendu:
          "403. Le cloisonnement par organisation n'est pas une permission attribuable : c'est une regle de confidentialite.",
      },
      {
        quoi: 'Ouvrir le journal en administrateur.',
        attendu:
          "Chaque acces a un dossier y figure, horodate et nominatif, y compris les refus d'identite au prelevement.",
        ou: '/audit',
      },
    ],
  },
  {
    titre: 'Administration',
    pourquoi:
      "Les droits se reglent par la console, pas par le code — et une mise a jour ne defait pas ce qu'un administrateur a decide.",
    etapes: [
      {
        quoi: 'Ouvrir la matrice des permissions en super-administrateur et retirer un droit a un role.',
        attendu:
          "Le changement est trace. Il ne revient pas au redemarrage suivant, meme si une mise a jour ajoute de nouveaux droits.",
        ou: '/admin',
      },
      {
        quoi: "Consulter la verification des prerequis du poste.",
        attendu:
          "Trois niveaux : bloquant, limitant, remarque. Chaque constat nomme ce qu'il faut faire, pas seulement ce qui ne va pas.",
      },
    ],
  },
];
