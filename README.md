# ParleDocteur

**Scribe médical assisté par IA.** L'application écoute la consultation, en extrait les données
cliniques codées, rédige le compte rendu, enrichit le dossier médical du patient et prépare une
ordonnance numérique — que le médecin doit valider avant qu'elle n'existe.

Tout ce qui sort de l'application est interopérable : **HL7 FHIR R4**, **HL7 v2.5.1** et **DHIS2**.

**Une base de code, quatre supports** : navigateur, téléphone, tablette et poste de travail.

---

## Plateformes

| Support | Livraison | Fonctionnement |
|---|---|---|
| **Web** | serveur Next.js (`npm start`) | poste fixe du cabinet, accès navigateur |
| **Mobile** | PWA installable depuis le navigateur | icône, plein écran, barre d'onglets au pouce |
| **Tablette** | PWA installable | mise en page en colonnes, cibles tactiles 44 px |
| **Desktop** | installateur Windows (`.exe`) | serveur Next et base SQLite **embarqués**, aucun réseau requis |

L'interface s'adapte sans code dupliqué : navigation haute sur grand écran, barre d'onglets basse
sur téléphone, tableaux de données transformés en fiches empilées sous 768 px, barre d'étapes de
consultation à défilement horizontal. Les champs de saisie passent à 16 px sous 640 px pour éviter
le zoom automatique d'iOS en pleine consultation.

### PWA — mobile, tablette et navigateur

Installable depuis Chrome, Edge et Safari (« Ajouter à l'écran d'accueil »). Le service worker est
volontairement prudent pour une application médicale :

- ressources statiques mises en cache (noms à empreinte, donc immuables) ;
- navigations en **réseau d'abord**, avec repli sur une page hors-ligne dédiée ;
- **aucune page de dossier ni réponse d'API n'est jamais mise en cache** — un dossier médical périmé
  affiché comme actuel serait un risque clinique.

Ces deux invariants sont couverts par `npm test` (exécuté sur un environnement de
service worker simulé). Chacun a été vérifié en cassant volontairement le code : retirer le
garde-fou `/api/` ou mettre les navigations en cache fait échouer le test correspondant.

Un bandeau signale la perte de réseau pendant la consultation : la transcription continue d'être
capturée côté navigateur et repart vers le serveur au rétablissement.

### Desktop — Windows, macOS, Linux

L'application desktop n'est pas une fenêtre pointant vers un site : elle **embarque le serveur Next
et la base SQLite**. Un centre de santé sans connexion installe l'exécutable et travaille.

- serveur lancé sur un port libre, en local uniquement (`127.0.0.1`) ;
- base stockée dans le dossier de données utilisateur (`%APPDATA%\ParleDocteur\donnees`), donc
  préservée lors des mises à jour ;
- instance unique : deux serveurs sur la même base ne peuvent pas coexister ;
- liens externes ouverts dans le navigateur du système, jamais dans la fenêtre du dossier.

```bash
npm run desktop:build
```

L'installateur est produit dans `dist-desktop/`. `npm run desktop:dev` démarre le serveur, les
services auxiliaires et la fenêtre d'une seule commande ; `npm run desktop:dir` produit
l'application décompressée sans installateur.

> Le script de préparation **refuse de construire** si une base de données ou un fichier `.env`
> se trouve encore dans le paquet. Le traceur de fichiers de Next recopie sinon `data/*.db` dans la
> sortie : un installateur distribuerait alors de vrais dossiers médicaux.

---

## Comptes, rôles et contrôle d'accès

Cinq rôles, organisés en hiérarchie. Chacun ne valide que les niveaux situés sous lui — sans quoi
un administrateur d'établissement pourrait s'auto-promouvoir super-administrateur.

| Rôle | Périmètre des données | Ce qu'il fait | Validé par |
|---|---|---|---|
| **Médecin** | son établissement | consultations, dossiers, ordonnances | son établissement |
| **Établissement** | son établissement | valide ses médecins, suit l'activité, exporte | administrateur |
| **Ministère** | national, **agrégé** | indicateurs et surveillance, **aucun dossier nominatif** | administrateur |
| **Administrateur** | plateforme | organisations, comptes, politique d'accès, sessions | super-administrateur |
| **Super-administrateur** | plateforme | tout, y compris base de données et serveurs | — |

### Trois couches, dans cet ordre

1. **Le rôle** donne un jeu de droits par défaut. La matrice est modifiable depuis la console.
2. **La dérogation individuelle** accorde ou retire un droit à un compte précis. Motivée et tracée.
3. **Le cloisonnement** limite ensuite ce que le droit permet de voir. Ce n'est pas un droit
   attribuable : un médecin autorisé à lire les dossiers ne lit que ceux de son établissement.

Le contrôle est fait **côté serveur** dans chaque page (`requirePermission`) et chaque route
(`apiRequire`). Le middleware ne vérifie que la présence d'un cookie — il tourne sur le runtime
Edge, sans accès à la base, et ne peut donc rien valider. Masquer un lien dans la navigation est du
confort, jamais une sécurité.

### Vérifié sur l'application en marche

Codes HTTP réellement observés, un compte connecté par rôle :

| Ressource | médecin | établissement | ministère | admin | super-admin |
|---|---|---|---|---|---|
| Liste des patients | 200 | 200 | **403** | 403 | 200 |
| Journal d'audit | 403 | 200 | 403 | 200 | 200 |
| Matrice des droits | 403 | 403 | 403 | 403 | 200 |
| Base de données / serveurs | 403 | 403 | 403 | 403 | 200 |

Le ministère est bloqué sur les dossiers nominatifs par construction : son rôle ne détient pas
`patient:read`, et sa portée `national` refuse l'accès même si on le lui accordait par erreur.

Le cloisonnement inter-établissements a été éprouvé avec deux structures : Parakou voit **0**
patient de Cotonou en liste, et reçoit un **403** sur l'accès direct à un dossier de Cotonou.

### Sécurité des comptes

- mots de passe hachés en **scrypt** (sel par compte, comparaison en temps constant) ;
- **sessions révocables** : seule l'empreinte du jeton est stockée, jamais le jeton ;
- verrouillage temporaire après N tentatives, N et la durée étant configurables ;
- messages de connexion volontairement identiques (compte inconnu / mot de passe faux) pour ne pas
  permettre d'énumérer les comptes ;
- un compte administratif **ne peut pas signer** : la signature et la prescription exigent une fiche
  praticien, que seuls les comptes médecin possèdent.

### Console d'administration

`/admin`, filtrée par droits : vue d'ensemble, comptes (validation, refus motivé, suspension,
réinitialisation de mot de passe), organisations, matrice des droits et dérogations, politique
d'accès, sessions actives, base de données (intégrité, compactage, sauvegarde) et serveurs
(ressources, intégrations). Les intégrations affichent la **présence** d'une clé, jamais sa valeur.

### Premier compte d'une installation

Sur une base vierge, l'application ouvre l'**écran de première installation** : structure, compte
responsable, puis une confirmation qui récapitule les identifiants et les **adresses réseau**
auxquelles l'application répond. Cet écran se ferme définitivement dès qu'un compte existe.

En ligne de commande :

```bash
npm run create-admin -- --email admin@hopital.bj --nom "Prenom Nom"
```

Le mot de passe est généré et affiché une seule fois ; il doit être changé à la première connexion.
Tous les autres comptes se créent ensuite depuis la console.

En développement, `npm run seed -- --reset` installe un compte par rôle avec un mot de passe commun
affiché en fin de script — à ne jamais utiliser en production.

---

## Le principe

```
   Consultation parlée
          │
          ▼
   Transcription horodatée (Web Speech API, ou saisie manuelle)
          │
          ▼
   Extraction clinique structurée  ──►  IA (Claude) ou moteur local hors-ligne
          │                              codage CIM-10 / LOINC / SNOMED CT / ATC
          ▼
   ┌──────────────────────────┐
   │  ÉCRAN DE REVUE MÉDECIN  │  ← rien n'est enregistré sans coche explicite
   └──────────────────────────┘
          │
          ├──► Dossier médical enrichi  (constantes, diagnostics, allergies,
          │                              antécédents, traitements, examens)
          ├──► Compte rendu SOAP        (Markdown éditable, puis signé)
          └──► Ordonnance BROUILLON     (contrôle de sécurité, puis validation)
                      │
                      ▼
          Export FHIR R4 / HL7 v2 / DHIS2
```

Deux règles structurent tout le code :

1. **L'IA propose, le médecin dispose.** Aucune donnée n'entre dans le dossier sans une sélection
   explicite. Aucune ordonnance n'a de valeur avant `validated_by` + `validated_at`.
2. **Toute donnée est traçable.** Chaque élément extrait porte la citation verbatim (`quote`) de la
   phrase qui le justifie et un indice de confiance. Le médecin peut remonter à la source.

---

## Installation

Guides détaillés par plateforme dans **[docs/installation/](docs/installation/)** :
prérequis, serveur web, mobile et tablette, application desktop, mise en production, dépannage.

## Démarrage

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run seed -- --reset
```

```bash
npm run dev
```

Ouvrez <http://localhost:3000>. Le jeu de démonstration contient un praticien, trois patients aux
profils cliniques contrastés et une consultation pédiatrique prête à analyser.

Cette commande démarre aussi les **services auxiliaires** que l'application sait piloter — à ce
jour le service de transcription en fon (`services/griot/`), qui demande PyTorch et tourne donc
dans un processus Python séparé. Un poste qui ne l'a pas installé démarre normalement : le message
dit ce qui manque, et les trois autres moteurs de transcription fonctionnent. Même chose dans
l'exécutable desktop, qui lance ses services lui-même.

### Clé IA (facultative)

Renseignez `ANTHROPIC_API_KEY` dans `.env.local` pour l'extraction par modèle de langage.
**Sans clé, l'application fonctionne quand même** : elle bascule automatiquement sur le moteur
local déterministe (`lib/ai/local.ts`), 100 % hors-ligne, à couverture plus étroite mais jamais
inventive. Le bandeau de l'écran de revue indique toujours quel moteur a produit l'analyse.

---

## Ce que fait l'application

### Écoute et transcription

Le geste tient en **un bouton** : on appuie, on parle, on appuie pour arrêter. Le consentement du
patient est un préalable bloquant. En l'absence de micro, la transcription se saisit ou se colle à
la main — le reste de la chaîne est identique.

**Quatre moteurs de transcription**, interchangeables sans toucher au reste de l'application :

| Moteur | Fonctionnement | Confidentialité |
|---|---|---|
| Navigateur (défaut) | Web Speech API, immédiat, aucun téléchargement. Chrome/Edge. | L'audio transite par l'éditeur du navigateur |
| **Whisper sur l'appareil** | Modèle open source (OpenAI, MIT) exécuté dans le navigateur via transformers.js. ~85 Mo au premier lancement, puis en cache. | **L'audio ne quitte jamais l'appareil** |
| Whisper serveur | POST vers un `whisper.cpp` ou `faster-whisper` de l'établissement (`WHISPER_ENDPOINT`). | L'audio reste sur le réseau interne |
| **Griot — fon** | Modèle ouvert à **adaptateurs de langue**, servi par la structure (`GRIOT_ENDPOINT`). Seul moteur qui sache transcrire une consultation tenue en **fon**, avec traduction vers le français en second étage. | L'audio reste sur le réseau interne |

Griot n'est pas un Whisper ordinaire : la langue se choisit **au chargement du modèle**
(`language="fon"`) et le tokenizer vit dans un sous-dossier du dépôt. Changer de langue veut dire
changer d'instance, d'où un cache d'adaptateurs borné côté service. Il demande PyTorch et du code de
modélisation propre à son dépôt : il ne tourne donc pas dans le navigateur, il est porté par un petit
service Python (`services/griot/`) qui parle exactement le même contrat HTTP que whisper.cpp.
L'application ne sait pas qu'elle change de moteur, elle change d'adresse. Les deux partagent la
catégorie réseau « transcription », parce qu'ils reçoivent la même chose — de l'audio brut de
consultation, donc une donnée identifiante.

> **Le modèle de parole ne traduit pas.** L'adaptateur « fon » rend du texte fon — aucun modèle de
> reconnaissance vocale ne fait autre chose.

#### Du fon au français, avant la validation

Le médecin lit le français : une transcription en fon ne lui sert à rien s'il ne parle pas la langue.
Un **second étage** du même service traduit donc le texte fon avant de le rendre, avec un modèle de
traduction distinct (`TRADUCTION_MODELE`), dans le même aller-retour que la transcription.

**La phrase en fon ne disparaît jamais.** Elle s'affiche sous le français à l'écran de validation et
reste dans le dossier. Ce n'est pas un ornement : une traduction automatique est une interprétation,
elle peut inverser une négation — « pas de fièvre » devenant « fièvre » —, déplacer une posologie ou
perdre une durée. Rien en aval ne saurait le repérer ; l'extraction, le compte rendu et l'ordonnance
hériteraient de l'erreur en la tenant pour la parole du patient. Le seul garde-fou possible est que
le praticien ait sous les yeux ce qui a été prononcé. Si la traduction échoue, l'extrait est rendu en
fon plutôt que perdu.

Aucun modèle fon → français léger n'est aujourd'hui à la fois évalué sur des consultations et
clairement licencié pour le soin : le choix est **déclaré par la structure** et engage le responsable
de traitement. Le tableau des modèles vérifiés, avec leur licence, est dans
[`services/griot/README.md`](services/griot/README.md).

**Ni la transcription ni la traduction du fon n'ont été mesurées par nous.** Le trajet des données
est intégré et testé ; évaluer ces modèles sur des consultations réelles est un travail d'annotation
qui reste à faire, et qui demande des locuteurs. Deux modèles en série composent leurs erreurs : une
transcription approximative traduite approximativement donne un texte français fluide et faux, la
pire des sorties parce qu'elle ne réveille pas la méfiance.

Whisper ne transcrit pas en flux continu : l'audio est découpé aux silences, chaque tour de parole
devient un bloc. Ce découpage donne aussi l'unité de base de la détection de locuteur.

### Détection automatique du locuteur

L'application propose qui parle — médecin, patient ou accompagnant — en combinant deux signaux :

1. **Linguistique** : qui interroge, qui prescrit, qui dit « docteur », qui se plaint à la première
   personne. En consultation les rôles conversationnels sont très marqués ; c'est le signal le plus
   fiable et il ne coûte rien.
2. **Acoustique** : la hauteur médiane de la voix (F0, par autocorrélation). Elle ne dit pas *qui*
   parle mais *quand on change de personne*, et rattrape les tours neutres (« D'accord. ») qu'aucun
   mot ne permet de classer.

> **Ce n'est pas de la diarisation par biométrie vocale.** Une vraie diarisation compare des
> empreintes vocales et demande un modèle dédié. Ici c'est une proposition assortie d'une confiance.
> Une étiquette peu sûre est signalée à l'écran, et **un tour sans indice reste « indéterminé »
> plutôt que d'être attribué au hasard** : dans un dossier médical, une phrase mise dans la mauvaise
> bouche est pire qu'une phrase non attribuée.

Le praticien corrige d'un clic sur l'étiquette. **Sa décision fait autorité** : elle passe en source
`manual` et aucune ré-attribution ultérieure ne la touche. Le mode « je bascule moi-même » reste
disponible quand la détection se trompe trop (plusieurs accompagnants, voix proches).

#### Mesure, recalculée à la demande

```bash
npm run mesure
```

Sur la consultation pédiatrique de démonstration (**20 tours annotés**, `corpus/`) :

| | |
|---|---|
| correctement attribués | 16 |
| laissés indéterminés | 3 |
| **confusions médecin / non-médecin** | **0** |
| confusions patient / accompagnant | 1 |

Les deux dernières lignes ne sont pas du même ordre, et les confondre ferait perdre l'essentiel.
Prendre le patient pour le médecin **change la nature de l'énoncé** : une plainte devient une
observation clinique, entre au dossier, et rien ne la signale. Prendre le patient pour sa mère garde
l'énoncé du côté de celui qui consulte. La première est un **invariant tenu à zéro par un test** ; la
seconde est un compte suivi, figé dans le corpus pour qu'une dégradation se voie.

La confusion qui subsiste est le tour « Non, jamais eu de problème avec les médicaments » : c'est la
mère qui répond, et aucun indice du texte ne désigne l'un plutôt que l'autre.

> **Ces chiffres ne mesurent pas une performance.** Un seul dialogue, écrit puis annoté à la main,
> aucun locuteur réel, aucune hauteur de voix — le signal acoustique n'est donc pas éprouvé ici. Ils
> montrent la **forme** du résultat : le système perd du rappel plutôt que de la précision. Une
> mesure de performance demande des enregistrements cliniques annotés par des soignants.

Le corpus est la **même source** que le jeu de démonstration (`npm run seed`) : deux copies auraient
divergé à la première correction, et la mesure aurait alors porté sur autre chose que ce qu'on
montre.

### Reconnaissance des mots-clés cliniques

Un moteur vocal n'a jamais entendu « artéméther-luméfantrine » aussi souvent que « arrête me ter ».
Deux leviers, l'un avant et l'autre après :

- **biaisage** — l'application souffle au moteur les termes attendus (`initial_prompt`), construits
  depuis ses propres terminologies. Le formulaire est la seule source : ajouter une molécule la rend
  reconnaissable à la dictée, sans double saisie. Les termes sont triés par poids parce que le modèle
  tronque l'amorce — ce qui doit survivre, c'est le paludisme, pas l'hypertension ;
- **normalisation** — au retour, un quasi-manque est ramené au terme canonique
  (`lib/transcription/keywords.ts`).

Les deux ne s'appliquent qu'à une **sortie française**. Souffler une amorce en français médical à un
adaptateur fon le tirerait vers une langue qu'il n'est pas en train de transcrire, et passer du texte
fon dans un lexique de DCI françaises abîmerait un texte correct au lieu de le corriger.

La règle est celle de l'attribution du locuteur : **en cas d'ambiguïté, on ne corrige pas.** Trois
verrous cumulatifs — une tolérance qui dépend de la longueur, un plafond relatif, et l'exigence que
le meilleur candidat soit *strictement* meilleur que le suivant. Entre deux molécules voisines, le
système s'abstient : une molécule corrigée vers la mauvaise voisine est plausible et passera la
relecture, alors qu'une molécule mal orthographiée saute aux yeux. Un fragment portant un chiffre
n'est jamais touché — c'est une posologie. Les corrections appliquées sont rendues avec le texte,
jamais silencieuses.

Le mot employé par le locuteur est respecté : « doliprane » est reconnu, donc protégé de toute
correction, mais **pas** réécrit en « Paracetamol ». La transcription reste fidèle à ce qui a été dit ;
c'est l'extraction qui fait l'équivalence.

### Extraction clinique

Produit une structure complète (`lib/ai/schema.ts`) : identité, motif, histoire de la maladie,
symptômes **y compris niés**, constantes, allergies, traitements en cours, antécédents, examen
physique, hypothèses diagnostiques hiérarchisées, examens à demander, projet d'ordonnance, conseils,
signes de gravité, suivi, orientation, alerte de santé publique, et — important — la liste
explicite de **ce que l'IA n'a pas pu déterminer**.

Le codage est complété de façon déterministe après coup (`lib/ai/enrich.ts`) : un modèle peut
oublier un code LOINC, les terminologies embarquées ne se trompent pas de correspondance.

### Enrichissement du dossier médical

L'écran de revue présente chaque élément avec sa citation source, son code et sa confiance.
Le médecin décoche ce qu'il refuse, puis enregistre. L'écriture est atomique et journalisée :

| Extrait | Devient | Ressource FHIR |
|---|---|---|
| Constantes | `observation` | Observation (LOINC + UCUM) |
| Diagnostics | `diagnosis` | Condition (encounter-diagnosis, CIM-10) |
| Diagnostic confirmé | `problem` | Condition (problem-list-item) |
| Antécédents | `problem` | Condition |
| Allergies | `allergy` | AllergyIntolerance |
| Traitements de fond | `medication_statement` | MedicationStatement |
| Examens demandés | `service_request` | ServiceRequest |

La fiche patient n'est jamais écrasée : seuls les champs **vides** sont proposés au remplissage,
et chacun est décochable.

### Ordonnance numérique

Créée en statut `draft`, sans aucune valeur légale. Le médecin corrige chaque ligne (DCI, dosage,
forme, posologie, durée, voie, instructions) avec autocomplétion sur le formulaire embarqué.

Le contrôle de sécurité (`lib/safety.ts`) porte sur :

- **allergies** documentées — même principe actif *et* allergie croisée de classe ATC ;
- **interactions** entre lignes prescrites et avec le traitement de fond au dossier ;
- **redondance** thérapeutique de classe ;
- **terrain** : grossesse, insuffisance rénale, insuffisance hépatique, âge pédiatrique ;
- **posologie** : durée et fréquence manquantes, dose maximale, poids absent chez l'enfant ;
- **formulaire** : molécule hors liste des médicaments essentiels ou inconnue.

Une **contre-indication bloque la validation** tant que le médecin n'a pas saisi une justification
écrite — laquelle est archivée dans le journal d'audit. Une ordonnance non validée ne peut être ni
imprimée, ni transmise à une pharmacie, ni exportée en `MedicationRequest` actif.

### Compte rendu et signature

Note SOAP en Markdown, éditable puis signée. La signature fige la consultation. Une ordonnance
encore en brouillon bloque la signature : on n'archive pas une consultation dont la prescription
n'a pas été tranchée.

---

## Interopérabilité

### HL7 FHIR R4 (4.0.1)

Chaque consultation produit un **Bundle de type `document`**, auto-portant, ouvert par une
`Composition` : Patient, Practitioner, Encounter, Condition, Observation, AllergyIntolerance,
MedicationStatement, MedicationRequest, ServiceRequest. Importable tel quel dans HAPI FHIR,
OpenMRS, Google/AWS Healthcare API ou tout serveur conforme. Un Bundle `transaction` est également
disponible pour un POST direct.

Une API FHIR de lecture est exposée :

```
GET /api/fhir/metadata                      → CapabilityStatement
GET /api/fhir/Patient?name=kossou
GET /api/fhir/Patient/{id}
GET /api/fhir/Encounter?patient={id}
GET /api/fhir/Condition?patient={id}
GET /api/fhir/Observation?patient={id}
GET /api/fhir/MedicationRequest?patient={id}
```

Elle sert le dossier médical, et elle est donc **fermée par défaut** : une session authentifiée
disposant de `export:read`, ou un jeton de service (`FHIR_API_TOKEN`) pour un système tiers. Le mode
se choisit dans **Administration → Réseau et serveurs**, et l'ouvrir sans authentification demande
une dérogation écrite. Chaque accès accepté est inscrit au journal. Seul le `CapabilityStatement`
reste libre : c'est par lui qu'un système tiers découvre qu'une authentification est attendue.

### HL7 v2.5.1

Pour les systèmes hospitaliers déjà installés, qui ne parlent pas encore FHIR :

| Message | Usage |
|---|---|
| `ADT^A04` | enregistrement du patient |
| `ORU^R01` | observations et compte rendu |
| `RDE^O11` | ordonnance **validée** vers la pharmacie |
| `ORM^O01` | demandes d'examens au laboratoire |

### DHIS2

Événement Tracker **pseudonymisé** (sexe, tranche d'âge, district, diagnostics codés, constantes)
et rapport agrégé mensuel, pour les programmes nationaux : paludisme, tuberculose, VIH, nutrition,
maladies non transmissibles.

### Terminologies embarquées

CIM-10 (OMS), LOINC, SNOMED CT, ATC (OMS), UCUM. Elles sont dans le code, pas en base : elles sont
ainsi versionnées avec la logique de sécurité qui les utilise et ne peuvent pas dériver.

---

## Conception pour le terrain africain

- **Hors-ligne d'abord.** SQLite local via `node:sqlite`, aucune dépendance native à compiler,
  aucun serveur externe requis. Le moteur d'extraction local prend le relais dès que le réseau
  tombe ; la transcription est mise en file d'attente côté client et repart au rétablissement.
- **Souveraineté des données.** Rien ne quitte la machine sauf appel IA explicite ou export
  déclenché par le praticien, vers une destination configurée par l'établissement — jamais vers
  une adresse fournie dans une requête.
- **Épidémiologie locale.** Le sous-ensemble CIM-10 et le formulaire couvrent le paludisme (CTA,
  TPIg, artésunate), la typhoïde, la tuberculose, le VIH, les parasitoses, la malnutrition,
  la déshydratation, en plus des maladies non transmissibles.
- **Réalités de saisie.** Tension dictée en cmHg (« 13/8 ») convertie en mmHg, dates de naissance
  estimées marquées comme telles, identifiants d'assurance (ARCH, CNAM, CMU), langue préférée du
  patient, nombres en toutes lettres (« pendant trois jours »).
- **Multilingue.** Consultation en français, anglais, fon, yoruba, wolof, bambara, lingala,
  kiswahili, arabe ou portugais ; sortie clinique normalisée en français médical.

---

## Architecture

```
app/
  page.tsx                     tableau de bord
  patients/                    fichier patients + dossier médical
  consultations/[id]/          poste de travail (5 étapes)
  ordonnance/[id]/             ordonnance imprimable (validée uniquement)
  interop/  audit/             consoles interopérabilité et journal
  api/
    consultations/[id]/analyze|commit|sign|transcript
    prescriptions/[id]/validate
    export/[id]                8 formats
    fhir/                      façade REST FHIR
lib/
  db.ts schema.ts repo.ts      dossier médical (SQLite)
  transcription/               contrat + moteurs (navigateur, Whisper local, Whisper serveur)
  audio/pitch.ts               estimation F0 par autocorrélation
  ai/speakers.ts               attribution du locuteur (linguistique + acoustique)
  ai/    schema · prompts · extract · local · enrich
  safety.ts                    contrôle de sécurité des ordonnances
  report.ts                    compte rendu SOAP
  fhir/  hl7/  interop/        projections interopérables
  terminology/                 CIM-10, LOINC, SNOMED, formulaire ATC
components/
  Recorder · consultation/Workspace · ReviewPanel · PrescriptionPanel
  Nav (haute / onglets bas) · Pwa (service worker, installation, état réseau)
  Recorder (grand bouton, moteurs, détection de locuteur)
electron/
  main.js      serveur embarqué, fenêtre, menu, isolation du contexte
  preload.js   pont minimal : un marqueur de plateforme, rien d'autre
scripts/
  gen-icons.mjs       encodeur PNG et ICO sans dépendance
  prepare-desktop.mjs build standalone + purge des données de santé
```

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de développement **et services auxiliaires** |
| `npm run build` / `npm start` | production web, services auxiliaires compris |
| `npm run services` | les services auxiliaires seuls (avant une démonstration) |
| `npm run dev:next` / `npm run start:next` | serveur web seul, sans les services |
| `npm run typecheck` | vérification TypeScript |
| `npm test` | 140 tests : invariant d'attribution, restrictions réseau, services, traduction, rôles |
| `npm run mesure` | recalcule les mesures d'attribution sur corpus annoté |
| `npm run seed -- --reset` | réinitialise la base de démonstration (un compte par rôle) |
| `npm run create-admin` | crée le premier super-administrateur (production) |
| `npm run icons` | régénère les icônes PNG et ICO (aucune dépendance graphique) |
| `npm run desktop:dev` | serveur, services et fenêtre Electron, d'une seule commande |
| `npm run desktop:prepare` | build `standalone` + assemblage, avec purge des données |
| `npm run desktop:build` | installateur Windows dans `dist-desktop/` |

---

## Avant un usage clinique réel

Cette version est complète fonctionnellement mais délibérément dépourvue de trois briques qui
relèvent du déploiement, pas du produit :

1. **Fédération d'identité et second facteur.** L'authentification interne (comptes, rôles,
   sessions révocables, verrouillage) est en place, mais reste locale à la plateforme. À brancher sur
   l'annuaire de l'établissement (OIDC, carte professionnelle de santé) et à compléter par un second
   facteur pour les comptes d'administration. L'API FHIR est désormais authentifiée — session ou
   jeton de service, réglable dans **Administration → Réseau et serveurs** — mais le jeton de service
   est un secret partagé : **SMART on FHIR / OAuth2 reste à mettre en place** pour une fédération
   réelle, avec des jetons à durée limitée et une portée par patient.
2. **Chiffrement au repos.** La base SQLite est en clair. Chiffrer le volume, ou passer sur
   SQLCipher / un SGBD chiffré. Les sauvegardes produites depuis la console le sont aussi.
3. **Conformité.** Le journal d'audit existe et trace toute écriture, validation, signature et
   export ; la durée de conservation, l'exercice des droits du patient et la déclaration auprès de
   l'autorité de protection des données compétente (APDP au Bénin, RGPD à l'international) restent
   à instruire par l'établissement. La console **Réseau et serveurs** refuse les configurations
   d'adresses et de flux qui exposeraient des données de santé, et exige une dérogation écrite là où
   la décision revient au responsable de traitement — ce qui empêche les erreurs de configuration
   qu'on sait nommer, sans valoir attestation de conformité.

**ParleDocteur est un outil d'aide à la documentation clinique.** Il ne pose pas de diagnostic et
ne prescrit pas. La responsabilité médicale demeure entièrement celle du praticien.
