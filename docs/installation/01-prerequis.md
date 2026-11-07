# 01 — Prérequis

## Node.js 22.5 ou plus récent — obligatoire

C'est la seule dépendance non négociable, et la version compte.

SmartHealth stocke le dossier médical dans SQLite via le module **`node:sqlite`, intégré à
Node.js**. Ce choix évite d'installer un serveur de base de données et, surtout, évite toute
compilation C++ : l'application s'installe sur un poste de dispensaire sans chaîne de build. Mais
`node:sqlite` n'existe qu'à partir de **Node 22.5**.

Vérifiez votre version :

```bash
node -v
```

Si la commande échoue ou affiche moins que `v22.5`, installez Node depuis <https://nodejs.org> en
choisissant la version **LTS**. Testé et validé sur **Node 24.18**.

> Sur une machine où Node est déjà installé en version ancienne, utilisez un gestionnaire de
> versions (`nvm` sous Linux/macOS, `nvm-windows` sous Windows) plutôt que d'écraser l'existant :
> d'autres logiciels peuvent en dépendre.

## Espace disque

| Élément | Taille |
|---|---|
| Dépendances (`node_modules`) | ~800 Mo |
| Application construite | ~200 Mo |
| Base de données | quelques Mo, croît avec les consultations |
| **Pour un serveur web** | **prévoir 2 Go** |
| Electron + outils de packaging (desktop seulement) | +700 Mo |
| **Pour construire l'application desktop** | **prévoir 4 Go libres** |

La construction du `.exe` échoue de façon peu explicite quand le disque est saturé. Voir
[06 — Dépannage](06-depannage.md).

## Mémoire vive

2 Go suffisent pour faire tourner le serveur. **Construire l'application desktop demande plus** :
la compression de l'installateur et la conversion des icônes échouent sous 1 Go de RAM libre, avec
un message `WebAssembly.Memory(): could not allocate memory`. Fermez les autres applications avant
un `npm run desktop:build`.

## Navigateur, pour la dictée

| Navigateur | Reconnaissance du navigateur | Whisper sur l'appareil | Installation PWA |
|---|---|---|---|
| Chrome, Edge (bureau) | oui | oui | oui |
| Chrome Android | oui | oui | oui |
| Safari iOS / iPadOS | **non** | oui | oui |
| Firefox | non | oui | partielle |

La reconnaissance intégrée au navigateur n'existe pas partout. **Whisper fonctionne sur tous les
navigateurs modernes** et c'est le moteur à privilégier dès que la confidentialité compte :
l'audio ne quitte jamais l'appareil. Voir [03 — Mobile et tablette](03-mobile-et-tablette.md).

En dernier recours, la transcription se saisit ou se colle à la main — le reste de la chaîne est
identique.

## Microphone

Le navigateur demande l'autorisation au premier enregistrement. Sur un site servi en **HTTP**, les
navigateurs refusent l'accès au micro **sauf sur `localhost`**. Dès que d'autres postes se
connectent par le réseau, il faut donc du HTTPS : voir
[05 — Mise en production](05-mise-en-production.md).

## Facultatif

### Clé API pour l'extraction par modèle de langage

Sans clé, l'application bascule sur son **moteur local déterministe**, entièrement hors ligne. Il
est plus étroit mais n'invente rien, et le bandeau de l'écran de revue indique toujours quel moteur
a produit l'analyse. Une clé `ANTHROPIC_API_KEY` améliore nettement la finesse de l'extraction et
du codage.

### Serveur Whisper de l'établissement

Si vous disposez d'un serveur avec `whisper.cpp` ou `faster-whisper`, renseignez `WHISPER_ENDPOINT`
pour que les postes lui envoient l'audio plutôt que de faire tourner le modèle dans le navigateur.
Utile sur des tablettes peu puissantes.

## Récupérer le code

```bash
git clone https://github.com/M-TK-innov/SmartHealth.git
```

Le dépôt est privé : il faut un accès au compte propriétaire. Sans Git, téléchargez l'archive ZIP
depuis l'interface GitHub et décompressez-la.

---

Suite : [02 — Serveur web](02-serveur-web.md) ou [04 — Application desktop](04-application-desktop.md).
