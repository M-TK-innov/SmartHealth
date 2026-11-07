# Enquête usagers : formulaire, collecte, dépouillement

Le règlement du prix demande que la proposition parte d'une expérience
d'usager. Une expérience personnelle en est une ; quelques dizaines de
réponses en sont une autre, et elles se citent.

Ce document dit où vivent les trois morceaux, et ce qu'il faut poser pour
que la chaîne fonctionne.

---

## Les trois morceaux

| Morceau | Où | Rôle |
|---|---|---|
| Le questionnaire | `https://m-tk-innov.github.io/SmartHealth/` | Page statique, branche `gh-pages`. Se remplit au téléphone, ou s'imprime. |
| La collecte | `POST /api/enquete` | Valide et enregistre. Route publique, verrouillée. |
| Le dépouillement | `/enquete/resultats` | Comptages, textes libres, export CSV. Ouvert. |

La branche `gh-pages` est **délibérément séparée** de `main`. Activer Pages
sur `main` publierait aussi ce dossier de candidature et la note de
stratégie, dans un dépôt déjà public.

---

## Ce qu'il faut poser sur le serveur

Une variable, dans l'environnement du serveur et nulle part ailleurs.
Laissée vide, la collecte est fermée : la route répond 503, et le formulaire
publié s'en aperçoit au chargement et propose l'impression. C'est l'état
normal d'une installation de soin, qui n'a aucune raison de recevoir ces
réponses.

```
SMARTHEALTH_ENQUETE_BASE=postgresql://…   # base Postgres distante
```

Sur Vercel : Settings, Environment Variables, en Production.

---

## Pourquoi une base séparée

L'enquête n'est pas un acte de soin. Elle n'a rien à faire dans la base qui
porte les dossiers médicaux : ni le même contenu, ni la même durée de
conservation, ni les mêmes personnes autorisées à la lire. Une base distincte
rend le cloisonnement visible plutôt que promis.

C'est aussi la seule option praticable : la plateforme tourne sur un fichier
local, présent sur le poste de l'établissement, et le questionnaire est rempli
depuis n'importe quel téléphone.

La table contient une question, une option, un horodatage. Rien d'autre.

---

## Ce que la table ne contient pas

Ni nom, ni téléphone, ni numéro de dossier, ni adresse réseau, ni empreinte
de navigateur. Le questionnaire annonce « anonyme » : enregistrer à côté une
adresse qui identifie la ligne ferait de cette phrase un mensonge.

La contrepartie est assumée et elle doit être dite : **sans identifiant, on
ne peut pas limiter par personne.** Un répondant peut répondre deux fois, et
le dépouillement ne saura pas le voir. Ce qui existe est un plafond de débit
(300 réponses par heure, toutes origines confondues), qui protège d'un envoi
massif, pas d'un répondant qui recommence.

---

## Quatre verrous sur une route publique

Le formulaire est servi par un domaine que nous ne contrôlons pas. Ce qui
entre en base n'est donc pas ce que le formulaire propose, mais ce que le
serveur accepte.

1. **L'origine** de l'appel doit figurer dans une liste courte. Cela écarte
   les pages tierces, pas les envois automatisés : un en-tête `Origin` se
   pose à la main dans n'importe quel client qui n'est pas un navigateur.
2. **La taille** du corps est plafonnée avant toute analyse.
3. **La validation** (`lib/enquete/questionnaire.ts`) n'accepte que les
   options du questionnaire. Une clé inconnue fait échouer la réponse
   entière plutôt que d'être ignorée ; un texte libre trop long est refusé,
   pas tronqué.
4. **La base elle-même**, dont les contraintes `CHECK` refusent toute valeur
   hors liste. Si la route était un jour modifiée à la légère, ce verrou-là
   tiendrait encore.

---

## Lire les résultats

`/enquete/resultats`, sans clé : la page est ouverte, et son export CSV avec
elle.

Elle a d'abord été fermée, puis ouverte sur demande, pour montrer les chiffres
sans avoir à transmettre quoi que ce soit. L'ouverture tient à une seule
chose : **la table ne porte aucune donnée nominative**, donc il n'y a aucune
identité à exposer. Elle cesserait d'être tenable le jour où cette table
porterait autre chose.

Ce qu'elle coûte, en revanche, doit être su. Les réponses libres viennent d'un
formulaire ouvert à tous et s'affichent sans relecture préalable. React échappe
ce qu'il affiche, donc rien de ce qui est saisi ne s'exécute ; mais une phrase
déplacée, elle, s'affiche. La page prévient son lecteur que ces réponses
engagent celui qui les a écrites, et le remède est de retirer la ligne de la
base, pas d'espérer. La page porte aussi `noindex`, en balise et en en-tête :
ouverte ne veut pas dire faite pour être trouvée par un moteur.

La page affiche, par question, les décomptes **et la base sur laquelle le
pourcentage est calculé**. Chaque question a sa propre base : une personne
qui répond aux six questions usager et à aucune question agent compte dans
les six premières, et dans aucune des cinq suivantes. Rapporter tout au
nombre de formulaires donnerait des chiffres faux, et toujours à la baisse.

Sous trente réponses, un bandeau le dit. Un pourcentage calculé sur neuf
personnes se présente comme une mesure sans en être une, et le jury le verra
avant nous.

L'export CSV échappe deux fois : pour le format, et pour le tableur. Une
cellule qui commence par `=`, `+`, `-` ou `@` est lue comme une formule à
l'ouverture, et le contenu vient ici d'un formulaire public.

---

## Ce que cette enquête ne dira pas

Les réponses sont déclaratives, et l'échantillon n'est pas représentatif : il
décrit les usagers d'un centre, un jour donné, qui ont accepté de répondre.
Ces limites sont écrites sur le questionnaire lui-même, et elles doivent être
reprises telles quelles dans le dossier. Une enquête qui arrive avec ses
propres réserves se discute ; une enquête qui se présente comme une mesure se
fait démolir sur la première question.
