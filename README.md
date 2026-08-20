# ParleDocteur

**Scribe médical assisté par IA.** L'application écoute la consultation, en extrait les données
cliniques codées, rédige le compte rendu, enrichit le dossier médical du patient et prépare une
ordonnance numérique — que le médecin doit valider avant qu'elle n'existe.

Tout ce qui sort de l'application est interopérable : **HL7 FHIR R4**, **HL7 v2.5.1** et **DHIS2**.

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

### Clé IA (facultative)

Renseignez `ANTHROPIC_API_KEY` dans `.env.local` pour l'extraction par modèle de langage.
**Sans clé, l'application fonctionne quand même** : elle bascule automatiquement sur le moteur
local déterministe (`lib/ai/local.ts`), 100 % hors-ligne, à couverture plus étroite mais jamais
inventive. Le bandeau de l'écran de revue indique toujours quel moteur a produit l'analyse.

---

## Ce que fait l'application

### Écoute et transcription

Reconnaissance vocale du navigateur (Chrome/Edge), français par défaut, six langues proposées.
Le navigateur ne sait pas séparer les locuteurs : le praticien bascule l'étiquette
Patient / Médecin d'un clic ou avec la barre d'espace. Le consentement du patient est un préalable
bloquant à l'enregistrement. En l'absence de micro, la transcription se saisit ou se colle à la main
— le reste de la chaîne est identique.

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
  db.ts schema.sql repo.ts     dossier médical (SQLite)
  ai/    schema · prompts · extract · local · enrich
  safety.ts                    contrôle de sécurité des ordonnances
  report.ts                    compte rendu SOAP
  fhir/  hl7/  interop/        projections interopérables
  terminology/                 CIM-10, LOINC, SNOMED, formulaire ATC
components/
  Recorder · consultation/Workspace · ReviewPanel · PrescriptionPanel
```

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` / `npm start` | production |
| `npm run typecheck` | vérification TypeScript |
| `npm run seed -- --reset` | réinitialise la base de démonstration |

---

## Avant un usage clinique réel

Cette version est complète fonctionnellement mais délibérément dépourvue de trois briques qui
relèvent du déploiement, pas du produit :

1. **Authentification.** `lib/api.ts` résout le praticien via un en-tête ou le premier du fichier.
   À brancher sur l'annuaire de l'établissement (OIDC, carte professionnelle de santé) et à protéger
   par SMART on FHIR / OAuth2 côté API.
2. **Chiffrement au repos.** La base SQLite est en clair. Chiffrer le volume, ou passer sur
   SQLCipher / un SGBD chiffré.
3. **Conformité.** Le journal d'audit existe et trace toute écriture, validation, signature et
   export ; la durée de conservation, l'exercice des droits du patient et la déclaration auprès de
   l'autorité de protection des données compétente (APDP au Bénin, RGPD à l'international) restent
   à instruire par l'établissement.

**ParleDocteur est un outil d'aide à la documentation clinique.** Il ne pose pas de diagnostic et
ne prescrit pas. La responsabilité médicale demeure entièrement celle du praticien.
