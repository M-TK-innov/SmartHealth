# 02 — Serveur web

À choisir dès que **plusieurs appareils** doivent accéder aux mêmes dossiers : postes du cabinet,
tablettes en salle de consultation, téléphones en visite.

Un poste fait tourner le serveur et détient la base. Les autres s'y connectent par le navigateur.

## 1. Installer les dépendances

Depuis le dossier du projet :

```bash
npm install
```

Environ 800 Mo et quelques minutes. Si des avertissements `allow-scripts` apparaissent, ils sont
sans conséquence ici — ils ne concernent que la construction desktop.

## 2. Configurer l'établissement

```bash
cp .env.example .env.local
```

Ouvrez `.env.local` et renseignez au minimum :

```
FACILITY_NAME=Centre de Sante de Cotonou
FACILITY_ID=BJ-LIT-CSC-001
FACILITY_COUNTRY=BJ
```

Ces valeurs apparaissent sur les comptes rendus, les ordonnances et dans les exports vers les
systèmes tiers. Le fichier `.env.local` n'est **jamais versionné** : il contient vos secrets.

Variables utiles :

| Variable | Rôle |
|---|---|
| `FACILITY_NAME`, `FACILITY_ID`, `FACILITY_COUNTRY` | identité de la structure |
| `ANTHROPIC_API_KEY` | extraction par modèle de langage — sans elle, moteur local hors ligne |
| `PARLEDOCTEUR_DB` | emplacement de la base (défaut `./data/parledocteur.db`) |
| `FHIR_BASE_URL` | URL déclarée dans les exports FHIR (repli) |
| `FHIR_API_TOKEN` | jeton attendu sur l'API FHIR en mode « jeton de service » |
| `WHISPER_ENDPOINT` | serveur Whisper de l'établissement (repli, facultatif) |

Les **adresses** se règlent dans **Administration → Réseau et serveurs**
([guide 07](07-reseau-et-serveurs.md)), où elles sont confrontées aux restrictions sanitaires avant
enregistrement. Le fichier d'environnement garde les **secrets** : un secret modifiable depuis une
page web est un secret exposé.

## 3. Créer le premier compte

Rien à faire à cette étape : la base est vide, et l'application le voit. **Au premier accès, elle
ouvre l'écran de première installation** où vous renseignez votre structure et votre compte
responsable, avec le mot de passe de votre choix.

L'écran de confirmation qui suit récapitule vos identifiants et **les adresses réseau** auxquelles
les autres postes peuvent se connecter. Notez le mot de passe à ce moment : aucune réinitialisation
par e-mail n'existe.

> **Cet écran ne s'ouvre qu'une fois.** Dès qu'un compte existe — même suspendu — il se ferme
> définitivement. Une route créant un super-administrateur sans authentification ne doit jamais
> rester ouverte sur une installation en service.

### Ou en ligne de commande

Si vous préférez préparer le compte avant même de démarrer le serveur :

```bash
npm run create-admin -- --email admin@votre-structure.bj --nom "Prénom Nom"
```

Le mot de passe est alors **généré et affiché une seule fois**, à changer à la première connexion.

> Pour **essayer** l'application, utilisez plutôt `npm run seed -- --reset`, qui installe trois
> patients, une consultation et un compte par rôle. À ne jamais faire sur une base réelle : la
> commande **efface tout**.

## 4. Construire et démarrer

```bash
npm run build
```

```bash
npm start
```

Le serveur écoute sur le port **3000**. Sur le poste lui-même : <http://localhost:3000>.

### Depuis les autres appareils

Relevez l'adresse IP locale du poste serveur :

```bash
ipconfig
```

(sous Linux ou macOS : `ip addr` ou `ifconfig`)

Les autres appareils du même réseau ouvrent alors `http://192.168.x.x:3000`.

Déclarez cette adresse et l'interface d'écoute dans **Administration → Réseau et serveurs** : c'est
elle qui figure dans les ressources FHIR émises, et c'est l'interface d'écoute déclarée qui détermine
la sévérité des contrôles appliqués à la configuration.

> **Le microphone ne fonctionnera pas** sur cette adresse en HTTP : les navigateurs réservent
> l'accès au micro aux sites `https://` et à `localhost`. C'est une limite du navigateur, pas de
> l'application. Voir [05 — Mise en production](05-mise-en-production.md) pour le HTTPS.
>
> En attendant, la transcription reste saisissable à la main sur ces postes.

### Autoriser le port dans le pare-feu Windows

Au premier lancement, Windows demande si Node peut accéder au réseau : répondez **Réseaux privés**.
Si la fenêtre n'est pas apparue, en PowerShell **administrateur** :

```powershell
New-NetFirewallRule -DisplayName "ParleDocteur" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Private
```

## 5. Démarrage automatique

Pour que le serveur reparte après un redémarrage du poste, le plus simple sous Windows est une
tâche planifiée déclenchée « Au démarrage » lançant `npm start` dans le dossier du projet.

Sous Linux, un service systemd. Sous macOS, un `launchd`. Ces configurations dépendent trop de
votre parc pour être données ici sans risque d'erreur.

## Mode développement

```bash
npm run dev
```

Recharge à chaque modification du code. **À ne pas utiliser en production** : plus lent, et il
expose des informations de débogage.

## Vérifier que tout va bien

```bash
npm test
```

```bash
npm run typecheck
```

Les tests couvrent la politique de cache hors ligne et la détection automatique du locuteur.

---

Suite : [03 — Mobile et tablette](03-mobile-et-tablette.md) pour installer l'application sur les
appareils, [07 — Réseau et serveurs](07-reseau-et-serveurs.md) pour les adresses et les
restrictions, ou [05 — Mise en production](05-mise-en-production.md) avant tout usage réel.
