# 05 — Mise en production

Ce guide sépare ce qui **doit** être fait avant de recevoir un vrai patient de ce qui peut attendre.

---

## Avant tout usage réel

### 1. Supprimer les comptes de démonstration

`npm run seed` installe des comptes dont le mot de passe est **écrit en clair dans le dépôt**
(`scripts/seed.mjs`). Quiconque a lu le code peut se connecter.

Sur une base de production, n'exécutez jamais `seed`. Partez d'une base vide :

```bash
npm run create-admin -- --email admin@votre-structure.bj --nom "Prénom Nom"
```

Si vous avez démarré avec le jeu de démonstration, connectez-vous en super-administrateur,
**suspendez** chaque compte de démonstration depuis `/admin/comptes`, puis créez les vrais comptes.

### 2. Mettre le serveur en HTTPS

Deux raisons, et la première suffit :

- **Sans HTTPS, pas de microphone.** Les navigateurs réservent l'accès au micro aux sites `https://`
  et à `localhost`. Sur `http://192.168.x.x:3000`, la dictée ne fonctionnera pas.
- Sans HTTPS, mots de passe et dossiers médicaux circulent en clair sur le réseau.

La méthode dépend de votre contexte :

| Contexte | Approche |
|---|---|
| Serveur accessible depuis Internet | Reverse proxy (Caddy, nginx) + Let's Encrypt |
| Réseau local seulement | Certificat interne, ou Caddy avec une autorité locale |
| Poste unique | **Application desktop** — tout est en `localhost`, la question ne se pose plus |

Caddy est le plus court chemin : un `Caddyfile` de deux lignes obtient et renouvelle le certificat.

```
parledocteur.votre-structure.bj {
    reverse_proxy localhost:3000
}
```

Pensez ensuite à `FHIR_BASE_URL=https://...` dans `.env.local`.

### 3. Restreindre l'API FHIR

Par défaut `FHIR_CORS_ORIGIN=*` : **toute origine peut interroger l'API FHIR**. Acceptable en
développement, pas en production.

```
FHIR_CORS_ORIGIN=https://le-systeme-autorise.bj
```

La console `/admin/systeme` signale ce réglage en rouge tant qu'il vaut `*` en production.

> **Cette API n'a pas encore d'authentification propre.** Elle est destinée aux systèmes tiers et
> devrait être protégée par SMART on FHIR / OAuth2. En attendant, ne l'exposez pas hors du réseau
> de la structure.

### 4. Organiser les sauvegardes

La base contient l'intégralité des dossiers. Console `/admin/systeme` → **Sauvegarder maintenant**
écrit une copie cohérente dans `sauvegardes/`, sans arrêter le serveur.

Ce n'est **pas une sauvegarde** tant que le fichier reste sur la même machine. Copiez-le sur un
support **chiffré** et **hors du poste**. Une sauvegarde de dossiers médicaux qui traîne sur une
clé USB non chiffrée est une fuite de données en attente.

Rythme raisonnable : une sauvegarde quotidienne, conservée 30 jours, plus une copie hors site
hebdomadaire.

### 5. Ajuster la politique d'accès

Console `/admin/acces` : longueur minimale des mots de passe, durée de session, verrouillage après
N tentatives, inscription libre ouverte ou fermée.

Les valeurs par défaut (10 caractères, session de 12 h, verrouillage après 5 tentatives) sont un
point de départ défendable. **Fermez l'inscription libre** si tous les comptes doivent être créés
par un administrateur.

---

## Ce qui n'est pas fait et qui vous incombe

Je préfère l'écrire ici plutôt que de le laisser découvrir :

### Chiffrement de la base au repos

**La base SQLite est en clair sur le disque.** Quiconque accède au fichier lit tous les dossiers.

Réponses possibles, par ordre de simplicité : chiffrer le volume (BitLocker sous Windows, LUKS sous
Linux, FileVault sous macOS) — c'est le plus rapide et cela couvre le vol du poste. Ou passer sur
SQLCipher, ce qui demande un travail de développement.

**Chiffrez au minimum le disque du poste serveur.**

### Conformité réglementaire

Le journal d'audit existe et trace toute écriture, validation, signature et export. Mais :

- la **durée de conservation** des données doit être définie et appliquée ;
- les **droits du patient** (accès, rectification, effacement) n'ont pas d'interface dédiée ;
- la **déclaration** auprès de l'autorité compétente — APDP au Bénin, CNIL ou équivalent
  ailleurs — relève de la structure ;
- l'**hébergement de données de santé** est réglementé dans plusieurs pays (HDS en France) et peut
  interdire un hébergement non certifié.

Ce sont des obligations de la structure, pas du logiciel.

### Authentification de l'API FHIR

Voir plus haut. À brancher sur SMART on FHIR / OAuth2 avant toute exposition hors réseau interne.

---

## Mettre à jour l'application

```bash
git pull
```

```bash
npm install
```

```bash
npm run build
```

Puis redémarrez le serveur.

**Les migrations de base sont automatiques et additives** : les colonnes manquantes sont ajoutées au
démarrage, rien n'est jamais supprimé ni renommé. Une base ancienne s'ouvre sans manipulation.

Sauvegardez tout de même avant toute mise à jour.

---

## Vérifier une installation

```bash
npm test
```

```bash
npm run typecheck
```

Puis, connecté en super-administrateur, passez sur `/admin/systeme` : intégrité de la base,
espace disque, mémoire, et l'état des intégrations configurées. Les clés y sont affichées comme
**présentes ou absentes**, jamais en valeur.
