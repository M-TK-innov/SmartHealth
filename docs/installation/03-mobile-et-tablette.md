# 03 — Mobile et tablette

ParleDocteur s'installe sur téléphone et tablette **sans passer par un magasin d'applications**.
C'est une PWA : le navigateur l'ajoute à l'écran d'accueil, avec son icône, en plein écran, et elle
se lance comme n'importe quelle application.

**Prérequis** : un serveur déjà en place ([02 — Serveur web](02-serveur-web.md)) et joignable depuis
l'appareil.

## Android — Chrome

1. Ouvrez l'adresse du serveur dans Chrome (`https://parledocteur.votre-structure.bj` ou
   `http://192.168.x.x:3000`).
2. Une invite « Installer ParleDocteur » apparaît en bas. Touchez **Installer**.
3. Si elle n'apparaît pas : menu **⋮** → **Ajouter à l'écran d'accueil**.

## iPhone et iPad — Safari

Safari n'affiche pas d'invite automatique, la manipulation est manuelle :

1. Ouvrez l'adresse du serveur **dans Safari** (Chrome sur iOS ne sait pas installer de PWA).
2. Touchez le bouton **Partager** (carré avec flèche vers le haut).
3. Faites défiler et touchez **Sur l'écran d'accueil**.
4. Confirmez avec **Ajouter**.

## Ordinateur — Chrome ou Edge

Une icône d'installation apparaît à droite de la barre d'adresse. Sinon : menu **⋮** →
**Installer ParleDocteur**.

## Ce que l'installation apporte

- **Plein écran**, sans barre d'adresse : plus de place pour le dossier, moins de risque de fermer
  l'onglet par erreur en pleine consultation.
- **Barre d'onglets en bas**, atteignable au pouce — le praticien tient l'appareil d'une main
  pendant qu'il examine de l'autre.
- **Raccourcis** : un appui long sur l'icône propose « Nouveau patient » et « Consultations à
  signer ».
- **Bandeau de perte de réseau** : la transcription continue d'être capturée dans l'appareil et
  repart vers le serveur au rétablissement.

## Ce que le mode hors ligne fait — et ne fait pas

C'est le point à comprendre avant de se fier à l'application en zone mal couverte.

| | Hors ligne |
|---|---|
| L'application s'ouvre | **oui** |
| La transcription en cours continue | **oui**, elle est mise en file et repart au retour du réseau |
| Consulter un dossier existant | **non** |
| Enregistrer dans le dossier, signer, valider une ordonnance | **non** |

**Aucune page de dossier ni réponse d'API n'est mise en cache**, et c'est délibéré : un dossier
médical périmé affiché comme s'il était à jour serait un risque pour le patient. L'application
préfère afficher une page « hors ligne » explicite plutôt qu'une version dépassée.

Une vraie autonomie hors ligne — consulter et modifier sans réseau, avec synchronisation ensuite —
n'est pas implémentée. Si votre usage l'exige, l'**application desktop** ([04](04-application-desktop.md))
répond mieux au besoin : elle embarque serveur et base, donc tout fonctionne sans réseau.

## Le microphone

Au premier enregistrement, l'appareil demande l'autorisation du micro. **Acceptez** : sans elle,
seule la saisie manuelle reste possible.

Si l'application est servie en **HTTP** (hors `localhost`), les navigateurs refusent purement et
simplement l'accès au micro. Un serveur en HTTPS est donc indispensable dès que les tablettes
enregistrent : voir [05 — Mise en production](05-mise-en-production.md).

## Choisir le moteur de transcription

Dans l'écran de consultation, sous le bouton d'enregistrement, ouvrez **« réglages de
transcription »** :

| Moteur | Quand le choisir | Confidentialité |
|---|---|---|
| **Navigateur** (défaut) | Chrome/Edge, immédiat, rien à télécharger | l'audio transite par l'éditeur du navigateur |
| **Whisper sur l'appareil** | iPhone/iPad, ou dès que la confidentialité prime | **l'audio ne quitte jamais l'appareil** |
| **Whisper serveur** | tablettes peu puissantes, serveur Whisper disponible | l'audio reste sur le réseau de la structure |

**Whisper sur l'appareil charge ~240 Mo au premier usage**, puis fonctionne hors ligne. Sur un serveur qui a reçu `npm run modeles`, ces données viennent du réseau local et non d'Internet. Faites
ce premier lancement en Wi-Fi, pas en données mobiles, et pas au milieu d'une consultation.

## Détection automatique du locuteur

L'application propose qui parle — médecin, patient, accompagnant — et affiche une étiquette à côté
de chaque tour de parole. Une étiquette **peu sûre est signalée** ; un tour sans indice reste
**« indéterminé »** plutôt que d'être attribué au hasard.

Touchez l'étiquette pour la corriger. **Votre correction fait autorité** : aucune ré-analyse ne la
modifiera.

Si la détection se trompe trop souvent — plusieurs accompagnants, voix proches — basculez sur
« je bascule moi-même » dans les réglages, et désignez le locuteur avant chaque prise de parole.

## Mettre à jour

L'application se met à jour toute seule au chargement suivant, dès que le serveur a été mis à jour.
Rien à réinstaller. Si un écran semble figé sur une ancienne version, fermez l'application et
rouvrez-la.

---

Suite : [05 — Mise en production](05-mise-en-production.md) pour le HTTPS, indispensable au micro.
