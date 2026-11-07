# Installer SmartHealth

SmartHealth s'installe de trois façons selon ce dont vous disposez. Les trois font tourner
exactement le même code : ce que vous choisissez, c'est **où vit le serveur**, pas ce que fait
l'application.

## Quelle installation choisir

| Votre situation | Installation | Guide |
|---|---|---|
| Un poste, pas d'informaticien, connexion aléatoire | **Application desktop** — tout est dans l'exécutable | [04](04-application-desktop.md) |
| Plusieurs postes ou tablettes dans la structure | **Serveur web** sur un poste, les autres s'y connectent | [02](02-serveur-web.md) |
| Vous voulez juste essayer | Serveur web en mode développement | [02](02-serveur-web.md) |

Une fois le serveur en place — desktop ou web — les téléphones et tablettes s'installent depuis
le navigateur, sans magasin d'applications : voir [03](03-mobile-et-tablette.md).

## Les guides

| | Contenu |
|---|---|
| [01 — Prérequis](01-prerequis.md) | Ce qu'il faut sur la machine avant de commencer |
| [02 — Serveur web](02-serveur-web.md) | Installation sur un poste, accès par le réseau |
| [03 — Mobile et tablette](03-mobile-et-tablette.md) | Installer l'application sur Android, iPhone, iPad |
| [04 — Application desktop](04-application-desktop.md) | Construire et installer le `.exe` (et macOS/Linux) |
| [05 — Mise en production](05-mise-en-production.md) | Sécurité, HTTPS, sauvegardes, mises à jour |
| [06 — Dépannage](06-depannage.md) | Les pannes rencontrées et comment les traiter |
| [07 — Réseau et serveurs](07-reseau-et-serveurs.md) | Adresses, serveurs internes et externes, restrictions sanitaires |

## En trois commandes, pour voir tout de suite

Depuis le dossier du projet, avec Node.js installé :

```bash
npm install
```

```bash
npm run seed -- --reset
```

```bash
npm run dev
```

Ouvrez <http://localhost:3000>. Le script `seed` affiche en fin d'exécution les comptes de
démonstration et leur mot de passe commun.

Sur une **base vierge** (sans `seed`), l'application ouvre d'elle-même l'**écran de première
installation** : vous y créez votre structure et votre compte responsable, et l'écran de
confirmation vous donne les adresses réseau à communiquer aux autres postes.

Les adresses de l'application et de la base, les serveurs internes et externes et les restrictions
qui les encadrent se règlent ensuite dans **Administration → Réseau et serveurs** :
voir [07](07-reseau-et-serveurs.md). Une installation neuve part fermée — API FHIR authentifiée,
aucun transfert externe autorisé.

> **Ces comptes de démonstration ne doivent jamais servir en production** : leur mot de passe est
> écrit en clair dans `scripts/seed.mjs`, donc dans le dépôt. Pour une vraie installation,
> voir [05 — Mise en production](05-mise-en-production.md).

## Ce que l'application fait tourner, et où

| | Serveur web | Application desktop |
|---|---|---|
| Serveur Next.js | sur le poste désigné | **embarqué dans l'exécutable** |
| Base SQLite | `data/smarthealth.db` | `%APPDATA%\SmartHealth\donnees` |
| Accès depuis d'autres appareils | oui, par le réseau local | non, poste unique |
| Node.js requis sur le poste | oui | **non** |
| Internet requis | non (sauf IA distante) | non (sauf IA distante) |

Une base installée sous l'ancien nom — `parledocteur.db`, `%APPDATA%\ParleDocteur` — continue d'être ouverte telle quelle. Voir [le guide serveur](02-serveur-web.md).

L'extraction clinique fonctionne **sans aucune connexion** grâce au moteur local embarqué. Une clé
API n'est nécessaire que pour l'extraction par modèle de langage, plus fine.
