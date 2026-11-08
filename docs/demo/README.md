# Parcours en images de la plateforme

Dix-sept vues de SmartHealth, prises sur la démonstration, assemblées en une
boucle de 48 secondes.

| Fichier | Usage |
|---|---|
| `parcours-smarthealth.webp` | La version nette et légère. S'ouvre dans tout navigateur récent et dans la plupart des traitements de texte. |
| `parcours-smarthealth.gif` | Plus lourd et moins beau, mais il se colle dans un courriel, une diapositive ou un formulaire de dépôt qui refuse le reste. |
| `vue-01.png` à `vue-17.png` | Les vues une par une, légende incrustée. De quoi faire un vrai montage, des diapositives, ou illustrer une page. |

Pour reconstruire après de nouvelles captures :

```bash
node scripts/monter-parcours.mjs <dossier-des-vues> docs/demo
```

---

## Ce que ce n'est pas

**Ce n'est pas un enregistrement d'écran.** Aucun encodeur vidéo n'est
installé sur le poste, et la bibliothèque disponible sait écrire du WebP et du
GIF animés, pas du H.264. Ce sont donc des vues fixes qui défilent, pas une
souris qui bouge. Pour un vrai MP4, il faut un enregistreur d'écran, ou
`ffmpeg` installé puis les PNG de ce dossier assemblés.

**La résolution est de 799 x 602.** C'est la taille de la fenêtre de capture,
pas un choix. Les PNG sont à cette taille et ne gagneront rien à être agrandis.

---

## Ce que le parcours montre, et pourquoi dans cet ordre

Les quatre premières vues posent la plateforme : la démonstration, la
connexion, la promesse tenue par le tableau de bord, les dossiers. Les quatre
suivantes suivent une consultation réelle jusqu'à l'ordonnance validée.

Les vues 9 à 11 sortent du cabinet : les lits, la pharmacie, et le rapport
mensuel produit depuis les consultations plutôt que recopié à la main.

**La vue 12 est un refus, et elle est là exprès.** Un compte de médecin qui
demande une page d'administration se la voit refuser, avec le droit manquant
nommé et une phrase qui explique que le cloisonnement fait partie de la
protection des dossiers. C'est l'argument central du dossier de candidature :
un refus qui nomme son motif et son remède vaut mieux qu'une alerte qu'on
apprend à ignorer.

Les vues 13 et 14 montrent ce que la plateforme mesure d'elle-même et comment
elle refuse de garder un secret dans une page web. La 15 passe du côté du
patient. Les 16 et 17 sont l'enquête usagers et son dépouillement.

---

## Les données sont fictives, et le bandeau le dit

Les vues portent le bandeau de démonstration. Il n'a pas été retiré : une
capture de produit qui ressemble à de vrais dossiers de patients sans le dire
est exactement ce qu'il ne faut pas diffuser.

Deux vues font exception et montrent du réel : l'enquête usagers et son
dépouillement, qui portent les réponses effectivement reçues. Elles sont
anonymes par construction.
