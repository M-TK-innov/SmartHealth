# 04 — Application desktop

L'application desktop n'est pas une fenêtre pointant vers un site : elle **embarque le serveur et
la base de données**. Un centre de santé sans connexion installe l'exécutable et travaille.

C'est l'installation à privilégier quand il n'y a **qu'un seul poste** et pas d'informaticien sur
place : rien à configurer, pas de Node.js à installer sur la machine cible, pas de réseau.

## Ce que fait l'application installée

- démarre son propre serveur sur un port libre, **en local uniquement** (`127.0.0.1`) — rien n'est
  exposé au réseau ;
- range la base dans `%APPDATA%\ParleDocteur\donnees`, donc **préservée lors des mises à jour** et
  séparée du dossier d'installation ;
- refuse de s'ouvrir deux fois : deux serveurs sur la même base se marcheraient dessus ;
- ouvre les liens externes dans le navigateur du système, jamais dans la fenêtre du dossier.

Menu **Aide → Emplacement des données** ouvre directement le dossier de la base — utile pour les
sauvegardes.

---

## Construire l'installateur Windows

À faire sur une machine de développement, **une seule fois**. L'exécutable produit s'installe
ensuite sur autant de postes que nécessaire.

### Avant de lancer

- **4 Go de disque libres** au minimum ;
- **1 Go de RAM libre** au minimum — fermez les autres applications ;
- Electron : `npm install` doit avoir téléchargé son binaire. Si `node_modules/electron/dist/` est
  vide (npm bloque les scripts d'installation par défaut) :

```bash
npm approve-scripts electron
```

```bash
node node_modules/electron/install.js
```

### Construire

```bash
npm run desktop:build
```

Compter **5 à 15 minutes**. Le résultat :

```
dist-desktop/ParleDocteur-0.2.0-installateur.exe
```

Environ **170 Mo** — le runtime Chromium et Node y sont inclus, c'est ce qui permet de ne rien
installer d'autre sur les postes cibles.

### Le garde-fou de confidentialité

Le script de préparation **refuse de construire** si une base de données ou un fichier `.env` se
trouve encore dans le paquet, et l'affiche explicitement :

```
ARRET : des donnees ou des secrets subsistent dans le paquet
```

Ce n'est pas une précaution théorique : le traceur de fichiers de Next.js recopie spontanément
`data/*.db` dans la sortie. Sans cette purge, **un installateur construit sur un poste de
production distribuerait de vrais dossiers médicaux**.

### Variantes

```bash
npm run desktop:dir
```

Produit l'application décompressée dans `dist-desktop/win-unpacked/`, sans installateur — plus
rapide pour vérifier.

```bash
npm run desktop:dev
```

Ouvre la fenêtre Electron sur le serveur de développement (`npm run dev` doit tourner en parallèle).

---

## Installer sur un poste

1. Copiez `ParleDocteur-0.2.0-installateur.exe` sur le poste (clé USB, partage réseau).
2. Double-cliquez. Windows SmartScreen affichera un avertissement : l'installateur **n'est pas
   signé numériquement**. Cliquez **Informations complémentaires** puis **Exécuter quand même**.
3. Choisissez le dossier d'installation. L'installation est **par utilisateur**, pas besoin de
   droits administrateur.
4. Raccourcis créés sur le Bureau et dans le menu Démarrer.

> **La signature de code** est le point à traiter avant une distribution large. Un certificat
> Authenticode (~300 €/an) supprime l'avertissement SmartScreen. Sans lui, chaque utilisateur doit
> passer outre un message qui, légitimement, l'inquiète.

## Premier lancement

L'application ouvre sa fenêtre et démarre son serveur — **quelques secondes** la première fois.

La base est vide : aucun compte n'existe. Créez le premier administrateur **avant** de distribuer
l'application, en pointant la variable d'environnement vers le dossier de données :

```bash
set PARLEDOCTEUR_DB=%APPDATA%\ParleDocteur\donnees\parledocteur.db
```

```bash
npm run create-admin -- --email admin@votre-structure.bj --nom "Prénom Nom"
```

> Une amélioration utile serait un écran de création du premier compte au premier démarrage. Elle
> n'est pas faite : aujourd'hui l'amorçage passe par cette commande.

---

## macOS et Linux

La configuration de packaging prévoit ces plateformes :

| Système | Format produit |
|---|---|
| macOS | `.dmg` |
| Linux | `.AppImage` et `.deb` |

**Ces cibles n'ont pas été construites ni testées.** electron-builder ne sait pas produire un `.dmg`
depuis Windows — il faut une machine macOS. Pour Linux, remplacez `--win` par `--linux` dans le
script `desktop:build` de `package.json`.

Attendez-vous à des ajustements : chemins, icônes, signature. Considérez ces cibles comme une base
de travail, pas comme du prêt-à-livrer.

---

## Mettre à jour un poste

Il n'y a pas de mise à jour automatique. Construisez un nouvel installateur et relancez-le sur le
poste : il remplace l'application.

**La base n'est pas touchée** : elle vit dans `%APPDATA%`, hors du dossier d'installation. Faites
tout de même une sauvegarde avant (console `/admin/systeme` → **Sauvegarder maintenant**).

---

Suite : [05 — Mise en production](05-mise-en-production.md) pour les sauvegardes et la sécurité.
