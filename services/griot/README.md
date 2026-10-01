# Service de transcription Griot

Transcription d'une consultation tenue en **fon**, à partir du modèle ouvert
[`bivariant/Griot-ASR-W-0.8-ALL`](https://huggingface.co/bivariant/Griot-ASR-W-0.8-ALL),
entraîné sur des langues africaines.

C'est le quatrième moteur de transcription de ParleDocteur, et le seul qui sache
écouter une consultation qui ne se tient pas dans une langue que Whisper couvre.

> **Le modèle de parole ne traduit pas.** L'adaptateur « fon » rend du **texte
> fon** — aucun modèle de reconnaissance vocale ne fait autre chose. La mise en
> français passe par un **second étage**, décrit plus bas, qui est un modèle de
> traduction distinct. Si vous ne retenez qu'une chose de ce fichier, que ce
> soit celle-là : ce sont deux modèles, deux qualités, deux risques.

## Un modèle à adaptateurs, pas un Whisper ordinaire

La particularité du dépôt : la langue se choisit **au chargement du modèle**, pas
au moment de la génération, et le tokenizer correspondant vit dans un
**sous-dossier**.

```python
model = AutoModelForSpeechSeq2Seq.from_pretrained(REPO, trust_remote_code=True, language="fon")
tokenizer = WhisperTokenizer.from_pretrained(REPO, subfolder="fon")
processor = WhisperProcessor(feature_extractor=feature_extractor, tokenizer=tokenizer)
```

Changer de langue veut donc dire **changer d'instance de modèle**. Le service tient
un cache d'adaptateurs, borné par `GRIOT_MAX_ADAPTERS`, parce que chacun est un
modèle complet en mémoire. L'extracteur acoustique, lui, est commun et chargé une
seule fois.

## Pourquoi un service séparé

Le modèle demande PyTorch et du code de modélisation propre à son dépôt
(`trust_remote_code=True`). Il ne peut donc pas tourner dans le navigateur comme
Whisper via transformers.js. Il est porté ici par un petit service HTTP qui parle
**exactement le même contrat** que `whisper.cpp` et `faster-whisper` :
l'application ne sait pas qu'elle change de moteur, elle change d'adresse.

```
Navigateur ──WAV 16 kHz──► /api/transcription ──multipart──► ce service ──► { text }
                              (Next.js)                       (Python)
```

## Installation

PyTorch d'abord — la roue dépend de la machine (CPU seul, CUDA, ROCm), suivez
[pytorch.org](https://pytorch.org/get-started/locally/). Puis :

```bash
pip install -r requirements.txt
```

## Lancement

**Vous n'avez normalement rien à lancer.** L'application démarre ce service avec
elle — `npm run dev`, `npm start`, `npm run desktop:dev` et l'exécutable installé
passent tous par `scripts/services.mjs`, qui :

- réutilise le service s'il écoute déjà, au lieu d'en lancer un second ;
- cherche l'interpréteur dans `services/griot/.venv` avant le Python du système ;
- vérifie les dépendances **sans les importer**, et renonce en le disant si l'une
  manque — charger PyTorch pour répondre à une question de présence coûterait
  plusieurs secondes à chaque démarrage ;
- n'attend pas le chargement du modèle : la fenêtre s'ouvre tout de suite, le
  moteur apparaît quand le service répond ;
- arrête le service en même temps que l'application, **arbre de processus
  compris** — un service survivant serait adopté au lancement suivant alors
  qu'il porte le code d'avant.

Rien de tout cela n'est bloquant : un poste sans Python ouvre ParleDocteur
normalement et garde ses trois autres moteurs. Le message dit ce qui manque et
comment l'installer.

### À la main

Pour lancer le service seul — avant une démonstration, pour payer le chargement
pendant l'installation de la salle plutôt que devant le public :

```bash
npm run services
```

Ou directement, ce que fait le superviseur :

```bash
python server.py
```

Le service écoute sur `127.0.0.1:8081`. Un adaptateur est chargé au **premier
appel qui le demande**, pas au démarrage : le premier extrait d'une langue est donc
lent, les suivants non. Pour payer ce coût au démarrage — indispensable avant une
démonstration publique :

```bash
GRIOT_PRELOAD=1 npm run services
```

Tant que le modèle charge, l'enregistreur le dit : il refuse de présenter le
moteur comme prêt et invite à réessayer, plutôt que de laisser le praticien
parler dans le vide.

| Variable | Défaut | Rôle |
|---|---|---|
| `GRIOT_MODEL` | `bivariant/Griot-ASR-W-0.8-ALL` | dépôt Hugging Face |
| `GRIOT_LANGUAGES` | `fon` | adaptateurs autorisés, séparés par des virgules |
| `GRIOT_MAX_ADAPTERS` | `2` | adaptateurs gardés en mémoire ; au-delà, éviction |
| `GRIOT_HOST` / `GRIOT_PORT` | `127.0.0.1` / `8081` | écoute |
| `GRIOT_TOKEN` | *(vide)* | jeton `Bearer` exigé sur chaque requête |
| `GRIOT_PRELOAD` | *(vide)* | `1` pour charger les adaptateurs au démarrage |

Les paramètres de génération recommandés pour ce modèle sont appliqués par défaut
et réglables : `GRIOT_NUM_BEAMS` (4), `GRIOT_REPETITION_PENALTY` (1.0),
`GRIOT_NO_REPEAT_NGRAM` (14), `GRIOT_MAX_NEW_TOKENS` (440),
`GRIOT_LENGTH_PENALTY` (1.2).

## Branchement dans ParleDocteur

Dans le `.env.local` de l'application :

```bash
GRIOT_ENDPOINT=http://127.0.0.1:8081/
GRIOT_TOKEN=
```

Le moteur « Griot — consultation en fon » apparaît alors dans le sélecteur de
l'enregistreur. L'établissement peut aussi déclarer l'adresse depuis
**Administration → Réseau et serveurs** : une destination dont le libellé ou l'URL
contient « griot » est reconnue comme telle.

> Griot et Whisper partagent la **catégorie réseau « transcription »**. Ce n'est
> pas un raccourci : les deux reçoivent la même chose — l'audio brut d'une
> consultation, où les noms sont prononcés à voix haute, donc une donnée
> identifiante. Leur appliquer des restrictions différentes n'aurait aucun sens.

## Second étage : la traduction vers le français

Le médecin lit le français. Une transcription en fon ne lui sert à rien s'il ne
parle pas la langue, et attendre l'extraction clinique pour voir du français
signifie valider à l'aveugle. Le service traduit donc le texte fon avant de le
rendre, **dans le même aller-retour** que la transcription : un extrait tombe
toutes les quelques secondes, doubler les appels doublerait la latence perçue.

```bash
TRADUCTION_MODELE=masakhane/m2m100_418M_fon_fr_rel_news npm run services
```

### Ce que la traduction n'efface jamais

La phrase en fon repart **avec** sa traduction, et l'application l'affiche sous
le français à l'écran de validation, puis la conserve dans le dossier
(`transcript_segment.source_text`).

Ce n'est pas un ornement. Une traduction automatique est une interprétation :
elle peut inverser une négation — « pas de fièvre » devenant « fièvre » —,
déplacer une posologie ou perdre une durée. **Rien en aval ne saurait le
repérer** : l'extraction clinique, le compte rendu et l'ordonnance hériteraient
de l'erreur en la tenant pour la parole du patient. Le seul garde-fou possible
est que le praticien ait la phrase prononcée sous les yeux au moment où il
valide.

Si la traduction échoue, l'extrait est rendu **en fon** plutôt que perdu : la
parole du patient est irremplaçable, la traduction ne l'est pas.

### Quel modèle

Aucun modèle fon → français léger n'est aujourd'hui à la fois évalué sur des
consultations et clairement licencié pour le soin. Le choix est donc **déclaré
par la structure**, pas imposé ici, et il engage le responsable de traitement.

| Modèle | Taille | Licence |
|---|---|---|
| [`masakhane/m2m100_418M_fon_fr_rel_news`](https://huggingface.co/masakhane/m2m100_418M_fon_fr_rel_news) | 418 M | **non déclarée** sur la fiche du modèle |
| [`facebook/nllb-200-distilled-600M`](https://huggingface.co/facebook/nllb-200-distilled-600M) | 600 M | CC-BY-NC-4.0 ; la fiche précise « not released for production deployment » |
| [`google/madlad400-3b-mt`](https://huggingface.co/google/madlad400-3b-mt) | 3 B | Apache 2.0 |

Le premier est le plus adapté — entraîné par des chercheurs africains sur ce
couple précis, et le plus léger — mais sa fiche ne déclare pas de licence, ce
qui ne donne formellement aucun droit. Le troisième est le seul dont la licence
soit franchement permissive, au prix de sept fois la taille. **Tranchez avant de
déployer** ; le service rappelle ce point dans son journal au démarrage.

Les trois familles ne se pilotent pas de la même façon, d'où les réglages :

| Variable | Défaut | Rôle |
|---|---|---|
| `TRADUCTION_MODELE` | *(vide)* | dépôt Hugging Face ; vide = pas de traduction |
| `TRADUCTION_CIBLE` | `fr` | langue de sortie |
| `TRADUCTION_SOURCE` | *(vide)* | langue d'entrée, si le tokenizer la demande |
| `TRADUCTION_JETON_CIBLE` | *(vide)* | jeton de langue imposé — NLLB : `fra_Latn` |
| `TRADUCTION_PREFIXE` | *(vide)* | préfixe collé au texte — MADLAD : `<2fr>` |
| `TRADUCTION_NUM_BEAMS` | `4` | faisceaux de recherche |
| `TRADUCTION_MAX_NEW_TOKENS` | `512` | longueur maximale produite |

Un jeton de langue absent du vocabulaire est **ignoré avec un avertissement**
plutôt qu'appliqué : `convert_tokens_to_ids` rend l'identifiant de l'inconnu
quand le jeton n'existe pas, et le prendre pour une consigne de langue
produirait une sortie silencieusement fausse.

## Langue, biaisage et mots-clés

La langue transmise par l'application **désigne l'adaptateur à charger**, pas une
option de décodage. Une langue non déclarée dans `GRIOT_LANGUAGES` retombe sur le
modèle de base plutôt que d'aller chercher un sous-dossier inexistant.

Conséquence côté application, et c'est important :

- l'amorce de décodage construite depuis le formulaire français **n'est envoyée
  que pour une consultation en français**. La souffler à un adaptateur fon le
  tirerait vers une langue qu'il n'est pas en train de transcrire ;
- la normalisation des mots-clés **ne s'applique qu'à une sortie française**.
  Passer du texte fon dans un lexique de DCI françaises ne corrigerait rien : cela
  abîmerait un texte correct.

## Contrat HTTP

```
POST /            multipart/form-data
  file              extrait WAV 16 kHz mono          (requis)
  language          adaptateur : fon… ; vide = modèle de base
  source_language   alias de language
  prompt            amorce de décodage               (optionnelle)
  initial_prompt    alias de prompt
→ 200 { "text": "...", "language": "fon", "adapter": "fon" }

GET /health     → état, adaptateurs chargés, paramètres de génération
GET /languages  → adaptateurs déclarés et chargés
```

## Limites, à lire avant d'annoncer quoi que ce soit

- **Aucune mesure de qualité n'a été faite par nous sur le fon**, ni pour la
  transcription ni pour la traduction. L'intégration est fonctionnelle et le
  trajet des données testé ; la performance des modèles sur des consultations
  réelles reste à évaluer, et c'est un travail d'annotation, pas de code.
- **Deux modèles, deux erreurs possibles qui se composent.** Une transcription
  approximative traduite approximativement donne un texte français fluide et
  faux — la pire des sorties, parce qu'elle ne réveille pas la méfiance. C'est
  la raison d'être de l'affichage de la source à la validation.
- La traduction est **désactivée tant qu'aucun modèle n'est déclaré** : le texte
  fon repart alors tel quel, et c'est l'extraction clinique qui produit le
  français, comme avant.
- `services/griot/` **n'est pas embarqué** dans l'installateur desktop : les poids
  du modèle pèsent plusieurs gigaoctets. Un poste isolé sans ce service garde les
  trois autres moteurs. L'application installée cherche tout de même le dossier à
  côté de son exécutable : un établissement qui l'y dépose obtient le lancement
  automatique sans rien configurer.
- Chaque adaptateur est un modèle complet en mémoire. Sur un poste modeste,
  gardez `GRIOT_MAX_ADAPTERS=1`.
- Le tableau `TERMES_LOCAUX` de `lib/transcription/clinical-lexicon.ts` est vide à
  dessein : les tournures locales doivent être saisies et relues par un soignant
  locuteur de la langue, pas devinées par le code.
