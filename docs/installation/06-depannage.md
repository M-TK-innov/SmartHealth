# 06 — Dépannage

Les pannes listées ici ont toutes été rencontrées pendant le développement. Ce ne sont pas des
hypothèses.

---

## Installation et démarrage

### `Cannot find module 'node:sqlite'`

Node est trop ancien. `node:sqlite` exige **Node 22.5 minimum**.

```bash
node -v
```

Voir [01 — Prérequis](01-prerequis.md).

### `next start` refuse de démarrer : port occupé

Un serveur tourne déjà. Sous Windows, identifiez-le puis terminez-le :

```bash
netstat -ano | findstr :3000
```

```bash
taskkill /PID <numéro> /F
```

### Les icônes manquent après un clone

Elles sont générées, donc hors du dépôt. Elles se recréent automatiquement au `npm run dev` ou
`npm run build`. Pour forcer :

```bash
npm run icons
```

---

## Connexion et comptes

### « Adresse e-mail ou mot de passe incorrect » alors que tout semble juste

Message volontairement identique pour un compte inconnu et un mot de passe faux — sinon on pourrait
énumérer les comptes existants. Vérifiez donc les deux.

Si vous avez utilisé `npm run seed`, le mot de passe commun est affiché en fin d'exécution du
script.

### « Compte temporairement verrouillé »

Trop de tentatives. Attendez le délai indiqué, ou faites lever le verrou par un administrateur
depuis `/admin/comptes` (**Réinitialiser le mot de passe**).

### « Votre compte est en attente de validation »

Normal après une inscription libre : un administrateur du niveau supérieur doit valider. Un médecin
est validé par son établissement, un établissement par un administrateur de la plateforme.

### Plus aucun accès administrateur

Créez un nouveau super-administrateur en ligne de commande :

```bash
npm run create-admin -- --email secours@votre-structure.bj --nom "Secours"
```

### « Votre compte n'est pas rattaché à une fiche praticien »

Vous êtes connecté avec un compte administratif. **C'est voulu** : signer un compte rendu et valider
une ordonnance sont des actes médicaux, réservés aux comptes médecin. Connectez-vous avec un compte
médecin.

---

## Microphone et transcription

### Le bouton d'enregistrement ne fait rien

Dans l'ordre :

1. **Le consentement du patient est-il coché ?** C'est un préalable bloquant.
2. **L'adresse est-elle en `https://` ou `localhost` ?** Sur `http://192.168.x.x`, les navigateurs
   refusent le micro. Voir [05 — Mise en production](05-mise-en-production.md).
3. **Le micro est-il autorisé ?** Icône de cadenas dans la barre d'adresse → Autorisations.

### « Ce navigateur ne prend pas en charge la reconnaissance vocale »

Safari et Firefox n'ont pas la reconnaissance intégrée. Ouvrez les **réglages de transcription** et
choisissez **Whisper sur l'appareil** — il fonctionne partout.

### Whisper reste bloqué sur « téléchargement du modèle »

~240 Mo à récupérer au premier usage. Depuis Internet si le serveur ne les sert pas — lancez `npm run modeles` sur le serveur, et les postes les prendront sur le réseau local. L'application desktop les embarque déjà.
Faites ce premier lancement en Wi-Fi, hors consultation. Une fois en cache, il fonctionne hors ligne.

Si le téléchargement échoue, basculez sur le moteur du navigateur ou saisissez la transcription à
la main.

### Les locuteurs sont mal attribués

L'étiquette proposée est une **estimation**, pas une identification biométrique. Touchez-la pour la
corriger — votre correction fait autorité et ne sera jamais écrasée.

Si l'erreur est fréquente (plusieurs accompagnants, voix proches), basculez sur **« je bascule
moi-même »** dans les réglages.

Bouton **Ré-attribuer** : relance la détection sur l'échange complet, avec plus de matière qu'au fil
de l'eau. Vos corrections manuelles sont préservées.

---

## Analyse et ordonnance

### « Moteur local hors-ligne » alors qu'une clé API est configurée

Soit `ANTHROPIC_API_KEY` est absente de `.env.local`, soit le serveur n'a pas été redémarré après
l'avoir ajoutée, soit l'appel a échoué (réseau). Le bandeau indique toujours le moteur réellement
utilisé — c'est voulu : vous devez savoir ce qui a produit l'analyse.

### Impossible de signer : « ordonnance encore en brouillon »

Une ordonnance non tranchée bloque la signature, délibérément. Validez-la ou annulez-la.

### Une contre-indication bloque la validation

Normal. Saisissez une justification écrite : elle est archivée dans le journal d'audit avec votre
identifiant. C'est le seul moyen de passer outre, et il laisse une trace.

---

## Construction de l'application desktop

### `EPERM` ou `EBUSY` pendant la construction

L'antivirus analyse les binaires Electron pendant qu'electron-builder les déplace.

Relancez — souvent cela suffit. Si le dossier `dist-desktop/` reste verrouillé, construisez
ailleurs :

```bash
npx electron-builder --win --publish never -c.directories.output=C:\Temp\pd-build
```

Un dossier verrouillé se libère au redémarrage du poste.

### `WebAssembly.Memory(): could not allocate memory`

Mémoire insuffisante pour la conversion d'icône. Fermez les autres applications. L'icône `.ico` est
normalement pré-générée par `npm run icons`, ce qui évite cette étape — vérifiez que
`electron/icon.ico` existe.

### L'application installée affiche « Le serveur local s'est arrêté (code 1) »

Le paquet ne contient pas ses dépendances. Reconstruisez :

```bash
npm run desktop:build
```

Vérifiez que `resources/app/node_modules/next/` existe dans `dist-desktop/win-unpacked/`.

### `ARRET : des donnees ou des secrets subsistent dans le paquet`

**Ce n'est pas un bug, c'est le garde-fou qui fonctionne.** Le script refuse de construire un
installateur contenant une base de données ou un `.env`. Il indique les fichiers en cause. Sans
cette vérification, l'installateur distribuerait de vrais dossiers médicaux.

---

## Où regarder ensuite

| Besoin | Endroit |
|---|---|
| État de la base, intégrité, sauvegardes | `/admin/systeme` |
| Ressources serveur, intégrations configurées | `/admin/systeme` |
| Qui a fait quoi, quand | `/audit` |
| Sessions ouvertes, fermeture forcée | `/admin/acces` |
| Droits effectifs d'un compte | `/compte` (le sien) ou `/admin/droits` |

Le journal d'audit trace toute écriture au dossier, validation d'ordonnance, signature et export.
C'est le premier endroit à consulter pour comprendre ce qui s'est passé.
