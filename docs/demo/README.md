# Parcours vidéo de la plateforme

`parcours-smarthealth.webm` — 7 chapitres, 61 vues, 3 min 51 s, 1280x720.

Un acteur par chapitre, et pour chacun **uniquement les interfaces qui lui sont
destinées**. Le film ne montre jamais quelqu'un se cogner à une porte fermée :
il montre sept postes de travail.

| Chapitre | Compte | Vues |
|---|---|---|
| Médecin | `a.sossou@example.bj` | 15 |
| Infirmier / Accueil | `accueil@csc.bj` | 9 |
| Établissement | `direction@csc.bj` | 12 |
| Ministère | `ministere@sante.bj` | 5 |
| Administrateur plateforme | `admin@smarthealth.local` | 5 |
| Super-administrateur | `super@smarthealth.local` | 4 |
| Patient | téléphone + code personnel | 11 |

Mot de passe commun des comptes d'essai : voir `/demo` dans l'application.

---

## Refaire le film

```bash
npm install playwright && npx playwright install chromium
```

```bash
npm run build && node node_modules/next/dist/bin/next start -p 3210
```

```bash
node scripts/enregistrer-parcours.mjs http://localhost:3210 docs/demo
```

**Contre un serveur de production, jamais en développement.** En développement
chaque page se compile à la première visite : le film montre alors des secondes
d'écran vide, et le disque sature.

Playwright n'est pas une dépendance du projet. Il pèse plus lourd que tout le
reste et ne sert qu'ici, donc il s'installe à côté.

---

## Ce que ce n'est pas

**Ce n'est pas un enregistrement d'écran.** Playwright filme la page et rien
d'autre : pas de bureau, pas de notifications, pas de barre des tâches. Et le
parcours étant un script, il se rejoue à l'identique après chaque changement
d'interface.

**Le format est WebM (VP8).** Pas de MP4 : aucun encodeur H.264 n'est installé
sur le poste de production, et celui que Playwright embarque ne sait écrire que
du VP8. Le WebM s'ouvre dans tout navigateur récent. Pour un MP4, il faut
`ffmpeg` installé, puis une conversion du fichier produit ici.

---

## Les listes de vues ne sont pas écrites au jugé

Elles viennent de `audit-acces.mjs`, qui interroge le serveur compte par compte
et page par page, dans un vrai navigateur.

**Pourquoi un navigateur et pas `curl`.** Les pages gardées appellent
`requirePermission` dans un composant serveur, mais Next rend en flux : la
coquille part avec un code 200 avant que la redirection ne soit décidée, et
celle-ci voyage ensuite dans le flux. Un client sans JavaScript voit donc 200
partout et conclut, à tort, que tout est ouvert.

Le script d'enregistrement vérifie chaque arrivée. Si une vue devient
inaccessible parce que la matrice des droits a changé, la prise s'arrête et le
dit, au lieu de livrer un film où un acteur se heurte à un refus sans que
personne ne le remarque au montage.

---

## Les données sont fictives, et le bandeau le dit

Les vues portent le bandeau de démonstration. Il n'a pas été retiré : une
capture de produit qui ressemble à de vrais dossiers de patients sans le dire
est exactement ce qu'il ne faut pas diffuser.
