# 07 — Réseau, serveurs et restrictions sanitaires

Cette page décrit la console **Administration → Réseau et serveurs**, où se règlent les adresses de
connexion de l'application et de la base, les serveurs internes et externes, et les restrictions qui
encadrent le tout.

Elle s'applique à **toutes les plateformes** : serveur web, application desktop, tablettes et
téléphones passent tous par le même serveur, donc par la même configuration.

Droit requis : `server:manage` — super-administrateur, ou compte auquel ce droit a été accordé.

---

## Le principe

Une page de configuration qui se contente d'afficher des avertissements en rouge ne protège rien :
on enregistre quand même, et le rouge devient du décor. Ici, **la vérification a lieu avant
l'écriture**. Une configuration qui exposerait des données de santé n'est pas enregistrée du tout.

Trois niveaux, et la différence entre eux est ce qui fait tenir l'ensemble :

| Niveau | Effet | Exemples |
|---|---|---|
| **Bloquant** | Enregistrement refusé, sans recours | données identifiantes en HTTP, secret dans l'adresse, base sur un partage réseau |
| **À lever** | Refusé **tant qu'aucune dérogation écrite** n'a été signée | transfert hors du territoire, API FHIR ouverte |
| **Alerte** | Enregistré, constat affiché | base non chiffrée, sauvegardes sur le même disque |

Le niveau « à lever » reprend ce que l'application fait déjà pour les contre-indications
médicamenteuses : **le logiciel ne décide pas à la place du responsable**, mais il exige une
justification écrite et la conserve au journal, avec le nom du signataire.

> Les références citées dans chaque constat (RGPD, HIPAA, PGSSI-S, code du numérique béninois,
> ISO 27799…) **fondent la règle, elles ne valent pas attestation de conformité**. Un logiciel ne
> certifie pas un traitement de données de santé. Il empêche les erreurs de configuration qu'on sait
> nommer, et laisse au responsable de traitement ce qui relève de sa décision.

---

## 1. Adresse de l'application

| Champ | À quoi il sert |
|---|---|
| **Adresse publique** | Ce que l'application utilise pour se désigner elle-même : liens des ressources FHIR émises, adresses communiquées aux postes |
| **Interface d'écoute** | `127.0.0.1` (ce poste seul) ou `0.0.0.0` (tout le réseau). C'est elle qui détermine la sévérité des contrôles |
| **Port** | Le port déclaré. La page affiche en regard le port **réellement écouté** |
| **Accès à l'API FHIR** | Session authentifiée, jeton de service, ou ouverte |
| **Origines autorisées** | Origines admises sur l'API FHIR, séparées par des virgules |
| **Servie en HTTPS** | Directement ou via un proxy TLS |

### Pourquoi déclarer l'adresse publique

Derrière un proxy TLS, le serveur ne voit que `http://127.0.0.1:3000`. Une ressource FHIR qui
référence ses voisines par cette adresse produit un Bundle **inexploitable dès qu'il sort du
serveur** : les liens pointent vers une machine que le destinataire ne joindra jamais. Le serveur ne
peut pas deviner son adresse publique — il faut la lui dire.

### L'accès à l'API FHIR

C'est le réglage le plus important de la page. `/api/fhir` sert des ressources `Patient`,
`Condition`, `Observation` et `MedicationRequest` : **c'est le dossier médical**, dans un format que
tout système sait lire.

| Mode | Qui peut lire | Usage |
|---|---|---|
| **Session authentifiée** *(défaut)* | un compte connecté disposant de `export:read` | usage interne, consultation depuis l'application |
| **Jeton de service** | un appelant présentant `FHIR_API_TOKEN` | intégration d'un SIH tiers, serveur à serveur |
| **Ouverte** | tout le monde | maquettes uniquement — **soumis à dérogation** |

Chaque accès accepté est inscrit au journal d'audit : un dossier consulté par une machine laisse la
même trace qu'un dossier consulté par une personne.

> **Changement de comportement.** Avant cette version, l'API FHIR répondait à tout appelant capable
> d'atteindre le serveur. Elle est désormais fermée par défaut. Si un système tiers l'interrogeait,
> basculez sur « Jeton de service » et définissez `FHIR_API_TOKEN` côté serveur.

Le `CapabilityStatement` (`/api/fhir/metadata`) reste accessible sans authentification : il décrit ce
que le serveur sait faire, pas ce qu'il contient. C'est par lui qu'un système tiers découvre qu'une
authentification est attendue.

### Les origines autorisées

Laisser la liste **vide** est le réglage le plus sûr, et il n'empêche aucun appel de serveur à
serveur — le CORS ne concerne que les navigateurs.

`*` combiné à une écoute réseau est **bloquant**.

---

## 2. Adresse de la base de données

La base est un fichier SQLite embarqué : pas de serveur de base à joindre, pas de mot de passe
réseau. Son emplacement effectif est fixé au démarrage par `PARLEDOCTEUR_DB` ; le champ de la console
enregistre l'emplacement de référence de la structure et sert aux contrôles.

**Un chemin `\\serveur\partage` est refusé.** SQLite verrouille ses fichiers par des primitives que
SMB et NFS n'honorent pas de manière fiable : deux écritures simultanées corrompent la base. Ce n'est
pas une question de performance, c'est la perte du dossier médical. Partagez l'application par le
réseau, pas le fichier.

Le **chiffrement du support** est déclaratif : l'application ne peut pas le vérifier, et ne prétend
pas le faire. Activez BitLocker, LUKS ou FileVault, **puis** cochez la case. Cocher sans avoir activé
le chiffrement ne protège rien.

---

## 3. Territoire et transferts

| Champ | Effet |
|---|---|
| **Pays de résidence des données** | Code ISO à deux lettres — `BJ`, `CI`, `SN`, `FR`… |
| **Autoriser les transferts externes** | Interrupteur général de tout flux sortant |

Décoché, **aucun flux contenant des données de santé ne sort du réseau de la structure**, quels que
soient les serveurs déclarés par ailleurs. C'est le réglage d'une installation de dispensaire hors
ligne, et c'est le défaut sur une installation neuve.

Un transfert hors du territoire de collecte est un traitement à part entière, soumis à une base
juridique propre : autorisation de l'autorité nationale de protection (au Bénin, l'APDP, au titre de
la loi n° 2017-20 portant code du numérique), clauses contractuelles types, ou décision d'adéquation
(RGPD, chapitre V).

---

## 4. Serveurs internes et externes

Chaque destination est déclarée avec :

- un **nom** et une **adresse** ;
- une **portée** — interne (réseau de la structure) ou externe (joignable depuis l'internet) ;
- un **usage** — FHIR, HL7 v2, DHIS2, Whisper, modèle de langage, dépôt de sauvegarde ;
- la **classe de données transmises** — aucune / agrégats / pseudonymisé / identifiant ;
- un **mode d'authentification** et le **nom de la variable** portant le secret ;
- le **pays d'hébergement** ;
- la **vérification du certificat TLS**.

### La portée n'est pas déclarative

C'est le verrou central : la portée est ce qui assouplit les autres contrôles. Un serveur déclaré
« interne » dont l'adresse est publique est **refusé** — sinon il suffirait de mentir sur une case
pour contourner l'autorisation de transfert et le contrôle du pays.

### Les secrets ne descendent jamais dans la base

Le champ attend le **nom** d'une variable d'environnement (`FHIR_EXPORT_TOKEN`), jamais sa valeur.
La console affiche seulement si la variable est **définie** sur ce serveur. Un secret modifiable
depuis une page web est un secret exposé ; il vit dans le fichier d'environnement.

Une valeur collée par erreur dans ce champ est rejetée : le format attendu est celui d'un identifiant.

### Classer les données transmises

En cas de doute, **déclarez au plus haut**. C'est ce champ qui déclenche les contrôles, et une
sous-déclaration les désactive silencieusement.

Trois cas méritent d'être connus :

- **L'audio brut d'une consultation est identifiant.** Les noms sont prononcés à voix haute. Un
  serveur Whisper reçoit donc des données identifiantes, même si aucun champ de formulaire n'est
  transmis.
- **La surveillance épidémiologique ne reçoit jamais de nominatif.** Un flux DHIS2 déclaré
  « identifiant » est bloqué : y verser des identités dépasse la finalité et crée un fichier
  nominatif national que personne n'a autorisé.
- **Un modèle de langage tiers alimenté en données identifiantes** fait du prestataire un
  sous-traitant au sens du règlement. C'est une restriction à lever, avec le contrat correspondant en
  justification — ou basculez sur le moteur d'extraction local hors ligne, qui ne sort rien du poste.

### Le mode mTLS demande un composant devant

ParleDocteur **n'embarque pas de certificat client**. Déclarer « certificat client (mTLS) » sans plus
produirait des requêtes sans identité — un flux cru authentifié qui ne l'est pas. La console le
signale.

Terminez le mTLS sur un proxy sortant (stunnel, nginx, Envoy) portant le certificat de la structure,
et pointez l'adresse déclarée ici vers ce proxy. À défaut, utilisez un jeton porteur.

### Tester un serveur

Le bouton **Tester** appelle l'adresse **enregistrée**, jamais une adresse saisie dans la requête, ne
suit aucune redirection, et ne renvoie que le code HTTP — pas le contenu de la réponse. Ces trois
précautions évitent de transformer la console en sonde de réseau interne.

Un `401` ou un `404` prouve qu'un serveur répond : c'est ce qu'on cherche à savoir. Seule l'absence
de réponse est un échec de joignabilité.

---

## 5. Lever une restriction

Une restriction ne se contourne pas : elle se **signe**.

1. Ouvrez le constat dans « Restrictions sanitaires » ;
2. cliquez **Accorder une dérogation** ;
3. rédigez la justification et la mesure compensatoire — **30 caractères minimum**, parce que « ok »
   ne documente rien ;
4. signez.

Seul un **super-administrateur** peut le faire. Ce n'est volontairement pas un droit attribuable par
la matrice des permissions : accepter un transfert hors territoire engage le responsable de
traitement de la structure. C'est la même logique que le cloisonnement par établissement, qui n'est
pas négociable par permission non plus.

La dérogation est enregistrée avec **votre nom, la date et votre texte**, et reste affichée sur le
constat. Elle porte sur **un code et une cible précise** : une dérogation accordée pour un serveur
n'en couvre jamais un autre.

Les manquements **bloquants** n'admettent aucune dérogation. Seule leur correction les lève.

---

## 6. Ce qui change au-delà de la page

La configuration n'est pas un document : elle commande réellement le comportement du serveur.

- **Transmission d'un export** — la destination vient des serveurs déclarés, et elle est
  **réévaluée à chaque envoi**. Une destination enregistrée cesse d'être utilisée si la configuration
  devient non conforme entre-temps : autorisation de transfert retirée, territoire modifié. Un flux de
  santé ne continue pas de partir parce qu'il avait été accepté un jour.
- **Relais Whisper** — même règle. Un serveur de transcription écarté par les restrictions n'est pas
  appelé, et l'interface le dit, plutôt que de laisser croire à une panne.
- **En-têtes CORS de l'API FHIR** — calculés par requête à partir de la configuration. Ils étaient
  figés à la construction : restreindre les origines imposait de reconstruire l'application.
- **Adresses des ressources FHIR émises** — construites sur l'adresse publique déclarée.

Les variables d'environnement historiques (`FHIR_EXPORT_ENDPOINT`, `DHIS2_BASE_URL`,
`WHISPER_ENDPOINT`) restent lues **en repli**, et sont importées comme serveurs déclarés au premier
accès à la page — au niveau de risque le plus élevé, à vous de requalifier à la baisse.

---

## Cas typiques

### Dispensaire, un seul poste, hors ligne

- Écoute `127.0.0.1`, API FHIR en session, origines vides ;
- transferts externes **interdits** ;
- Whisper local en `http://127.0.0.1:8080` — accepté, la boucle locale ne traverse aucun réseau ;
- sauvegardes sur une clé USB chiffrée, donc un autre volume.

Aucune restriction, rien à signer.

### Centre de santé, plusieurs postes et tablettes

- Écoute `0.0.0.0`, proxy TLS devant, adresse publique `https://…`, case HTTPS cochée ;
- sans TLS, la restriction `RESEAU_SANS_TLS` bloque — **et le microphone ne fonctionnerait pas non
  plus** sur les tablettes, les navigateurs le réservant à HTTPS et à `localhost` ;
- API FHIR en session, origines vides.

### Hôpital raccordé à un SIH et au ministère

- API FHIR en **jeton de service**, `FHIR_API_TOKEN` défini côté serveur ;
- serveur FHIR du SIH déclaré **interne**, adresse privée, TLS vérifié, données identifiantes ;
- DHIS2 déclaré **externe**, données **pseudonymisées**, transferts externes autorisés, pays `BJ` ;
- origines autorisées limitées au portail du SIH.

---

Retour au [sommaire des guides](README.md) · Voir aussi
[05 — Mise en production](05-mise-en-production.md) pour le HTTPS et les sauvegardes.
