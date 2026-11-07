# Déployer Griot

Griot est le service de transcription en fon : PyTorch, un modèle de base, un
adaptateur par langue, et — en option — un second modèle pour traduire vers le
français. Il tourne **à côté** de SmartHealth, jamais dedans.

L'application le rejoint par une URL. Elle n'a rien d'autre à savoir de lui.

---

## Ce qui ne marche pas, et pourquoi le dire d'abord

**Netlify Functions : impossible.** Le plafond est de **250 Mo décompressés** par
fonction — c'est une limite AWS Lambda, elle ne se relève pas. La seule roue
`torch` pèse **433 Mo compressée**, donc nettement plus une fois décompressée.
La dépendance dépasse le plafond à elle seule, avant tout modèle. Le délai
d'exécution — 10 s par défaut, 26 s au mieux — ne laisserait de toute façon pas
le temps de charger les poids.

**Vercel Functions : impossible en pratique.** Le plafond y est plus généreux
(500 Mo pour Python, jusqu'à 5 Go avec les *Large Functions* sur Fluid Compute),
donc le code pourrait tenir. Mais les **poids du modèle pèsent plusieurs
gigaoctets** et sont téléchargés à chaud, sur un système de fichiers éphémère.
Chaque démarrage à froid les retéléchargerait, puis les rechargerait en mémoire :
plusieurs minutes, là où le délai se compte en dizaines de secondes.

Le problème n'est donc pas la taille du code. C'est qu'**un modèle de cette
taille a besoin d'un processus qui reste en vie et d'un disque qui persiste**.

---

## Ce qui marche

### 1. Un conteneur, sur un hôte qui garde un disque

Le `Dockerfile` de ce dossier est fait pour ça. Il épingle PyTorch **CPU seul**
— l'index dédié évite d'embarquer CUDA, soit plusieurs gigaoctets inutiles ici —
et sort les poids de l'image, dans un volume.

```bash
docker build -t smarthealth-griot services/griot
docker run -d --name griot -p 8081:8081 \
  -e GRIOT_HOST=0.0.0.0 \
  -v griot-modeles:/modeles \
  smarthealth-griot
```

Le volume n'est pas un détail : sans lui, chaque redémarrage du conteneur
retélécharge plusieurs gigaoctets, et une consultation attend.

Le premier démarrage est long — le temps de récupérer les poids. Le contrôle de
santé laisse cinq minutes avant de considérer le conteneur malade, et attend que
le modèle soit **chargé**, pas seulement que le processus écoute. Un
orchestrateur qui basculerait le trafic trop tôt ferait échouer les premiers
extraits d'une consultation, au pire moment.

Hôtes adaptés : tout ce qui exécute une image avec un volume persistant.

### 2. Le poste de l'établissement

C'est le mode normal, et le seul qui ne fasse sortir aucun octet d'audio de
l'établissement. `npm run dev` lance Griot en même temps que l'application, et
lui transmet son adresse. Rien à configurer.

Voir le `README.md` de ce dossier pour l'installation de PyTorch selon la
machine.

---

## Pointer SmartHealth vers un Griot distant

Deux chemins, dans cet ordre de priorité :

1. **Administration → Réseau et serveurs.** Déclarez le serveur avec un libellé
   ou une URL contenant « griot ». C'est le chemin à préférer : la déclaration
   est tracée, et la politique réseau de l'établissement s'y applique.
2. **La variable `GRIOT_ENDPOINT`**, dans l'environnement du serveur
   SmartHealth. Elle sert de repli quand rien n'est déclaré en base.

```
GRIOT_ENDPOINT=https://griot.exemple.org
GRIOT_TOKEN=…        # si le service est derrière une authentification
```

> **Avant d'exposer Griot sur l'internet public**, souvenez-vous de ce qui y
> transite : la parole d'une consultation, donc une donnée identifiante. Un
> service joignable sans authentification est un service qui accepte l'audio de
> n'importe qui, et le renvoie transcrit. Mettez-le derrière une
> authentification, et de préférence sur un réseau privé.

L'application ne tombe pas en panne quand Griot est absent : elle l'annonce
— « Aucun serveur Griot déclaré » — et les autres moteurs de transcription
restent disponibles, dont celui qui tourne dans le navigateur.

---

## État de vérification

| Élément | État |
|---|---|
| Version `torch==2.6.0+cpu`, roue cp312 Linux | **vérifiée** présente sur l'index PyTorch |
| Taille de la roue `torch` | **mesurée** : 433 Mo compressée |
| Plafond Netlify Functions | **vérifié** : 250 Mo décompressés, limite AWS non relevable |
| Construction de l'image | **non vérifiée** — le moteur Docker n'était pas démarré sur le poste où ce fichier a été écrit |

La dernière ligne est à lever avant de s'appuyer dessus : lancez la
construction une fois, et corrigez ce qui résiste.
