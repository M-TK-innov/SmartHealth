"""
Service de transcription Griot pour ParleDocteur.

Griot n'est pas un Whisper ordinaire : le depot porte un modele de base et un
ADAPTATEUR PAR LANGUE. La langue se choisit au chargement du modele
(`language="fon"`), pas au moment de la generation, et le tokenizer correspondant
vit dans un sous-dossier du depot. Changer de langue veut donc dire changer
d'instance — d'ou le cache d'adaptateurs ci-dessous.

Le service ne tourne pas dans le navigateur (PyTorch + code de modelisation
propre au depot). Il est expose derriere le meme contrat HTTP que whisper.cpp,
pour que l'application n'ait rien a savoir de la difference.

    POST /  (multipart)
        file             extrait WAV 16 kHz mono
        language         adaptateur a employer : fon, ... ; vide = modele de base
        prompt           termes attendus (applique seulement si le modele l'accepte)
    -> 200 {"text": "...", "language": "fon", "adapter": "fon"}

    GET /health
    GET /languages   adaptateurs charges et adaptateurs declares

DEUX ETAGES, DISTINCTS : l'adaptateur « fon » rend du TEXTE FON — un modele de
reconnaissance vocale ne traduit pas. Un second etage, optionnel, traduit ce
texte vers le francais avec un modele de traduction separe (voir TRADUCTION_*),
pour que le medecin valide dans une langue qu'il lit.

    POST /traduire  (form)  text, source_language, target_language
    -> 200 {"text": "...", "source": "...", "model": "..."}

Les deux etages vivent dans le meme processus a dessein : un poste de
dispensaire n'a pas la memoire pour deux runtimes PyTorch, et les deux modeles
recoivent la meme donnee — la parole d'une consultation, donc une donnee
identifiante.

CE QUE LA TRADUCTION NE FAIT PAS : elle n'efface pas la source. Le texte fon
part avec la traduction, et l'application l'affiche au medecin a cote du
francais. Une negation ou une posologie mal traduite ne se rattrape nulle part
en aval : le seul garde-fou est que le praticien puisse voir ce qui a ete dit.

Lancement :
    pip install -r requirements.txt
    python server.py

L'ecoute est sur 127.0.0.1 par defaut. L'audio d'une consultation contient les
noms prononces a voix haute : cette adresse ne s'ouvre au reseau de la structure
que par decision explicite (GRIOT_HOST), et jamais au-dela.
"""

from __future__ import annotations

import io
import logging
import os
import threading

import librosa
import soundfile as sf
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

REPO = os.environ.get("GRIOT_MODEL", "bivariant/Griot-ASR-W-0.8-ALL")
HOST = os.environ.get("GRIOT_HOST", "127.0.0.1")
PORT = int(os.environ.get("GRIOT_PORT", "8081"))
TOKEN = os.environ.get("GRIOT_TOKEN", "").strip()
# Adaptateurs autorises. Chacun est un modele complet en memoire : on ne les
# charge pas tous « au cas ou ». La liste se regle par l'environnement.
LANGUES = [x.strip() for x in os.environ.get("GRIOT_LANGUAGES", "fon").split(",") if x.strip()]
# Garde-fou memoire : au-dela, un adaptateur charge est evince.
MAX_ADAPTATEURS = int(os.environ.get("GRIOT_MAX_ADAPTERS", "2"))
TARGET_SR = 16000

# Parametres de generation. Ce sont ceux recommandes pour ce modele ; ils sont
# ici en constantes pour qu'un exploitant puisse les ajuster sans toucher au code.
GENERATION = {
    "num_beams": int(os.environ.get("GRIOT_NUM_BEAMS", "4")),
    "repetition_penalty": float(os.environ.get("GRIOT_REPETITION_PENALTY", "1.0")),
    "no_repeat_ngram_size": int(os.environ.get("GRIOT_NO_REPEAT_NGRAM", "14")),
    "max_new_tokens": int(os.environ.get("GRIOT_MAX_NEW_TOKENS", "440")),
    "length_penalty": float(os.environ.get("GRIOT_LENGTH_PENALTY", "1.2")),
}

# --- Traduction (second etage, optionnel) --------------------------------------
#
# Aucun modele fon -> francais leger n'est a la fois verifie et clairement
# licencie pour un usage clinique. Le choix est donc DECLARE par la structure,
# pas impose par ce fichier, et les familles de modeles ne se pilotent pas de la
# meme facon : m2m100 veut un `forced_bos_token_id`, NLLB un code de langue
# complet, MADLAD un prefixe dans le texte. D'ou ces reglages plutot qu'un
# `if famille ==` qui casserait au premier modele suivant.
#
#   masakhane/m2m100_418M_fon_fr_rel_news  418 M  licence NON DECLAREE
#   facebook/nllb-200-distilled-600M       600 M  CC-BY-NC-4.0, « not released
#                                                 for production deployment »
#   google/madlad400-3b-mt                 3 B    Apache 2.0
#
# Vide = pas de traduction : le texte fon repart tel quel.
TRADUCTION_MODELE = os.environ.get("TRADUCTION_MODELE", "").strip()
TRADUCTION_CIBLE = os.environ.get("TRADUCTION_CIBLE", "fr").strip()
TRADUCTION_SOURCE = os.environ.get("TRADUCTION_SOURCE", "").strip()
# Jeton de langue cible impose (NLLB : « fra_Latn »). Vide = deduit du modele.
TRADUCTION_JETON_CIBLE = os.environ.get("TRADUCTION_JETON_CIBLE", "").strip()
# Prefixe colle devant le texte (MADLAD : « <2fr> »).
TRADUCTION_PREFIXE = os.environ.get("TRADUCTION_PREFIXE", "").strip()
TRADUCTION_GENERATION = {
    "num_beams": int(os.environ.get("TRADUCTION_NUM_BEAMS", "4")),
    "max_new_tokens": int(os.environ.get("TRADUCTION_MAX_NEW_TOKENS", "512")),
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s %(message)s")
log = logging.getLogger("griot")

app = FastAPI(title="Griot ASR — ParleDocteur", docs_url=None, redoc_url=None)

_verrou = threading.Lock()
_feature_extractor = None
_adaptateurs: dict[str, tuple] = {}
_ordre: list[str] = []

_verrou_traduction = threading.Lock()
_traducteur = None


def extracteur():
    """Le front-end acoustique est commun a tous les adaptateurs : un seul suffit."""
    global _feature_extractor
    if _feature_extractor is None:
        from transformers import WhisperFeatureExtractor

        _feature_extractor = WhisperFeatureExtractor.from_pretrained(REPO)
    return _feature_extractor


def adaptateur(langue: str):
    """
    Modele et processeur pour une langue donnee.

    `langue` vide designe le modele de base, sans adaptateur. Le chargement est
    paresseux et memorise : le premier extrait d'une langue paie le
    telechargement, les suivants non.
    """
    cle = (langue or "").strip().lower() or "base"

    with _verrou:
        if cle in _adaptateurs:
            _ordre.remove(cle)
            _ordre.append(cle)
            return _adaptateurs[cle]

        from transformers import AutoModelForSpeechSeq2Seq, WhisperProcessor, WhisperTokenizer

        log.info("chargement de l adaptateur « %s » depuis %s ...", cle, REPO)
        if cle == "base":
            modele = AutoModelForSpeechSeq2Seq.from_pretrained(REPO, trust_remote_code=True)
            tokenizer = WhisperTokenizer.from_pretrained(REPO)
        else:
            # La langue se pose au CHARGEMENT, et le tokenizer vit dans un
            # sous-dossier du depot : c'est la particularite de ce modele.
            modele = AutoModelForSpeechSeq2Seq.from_pretrained(
                REPO, trust_remote_code=True, language=cle
            )
            tokenizer = WhisperTokenizer.from_pretrained(REPO, subfolder=cle)

        processeur = WhisperProcessor(feature_extractor=extracteur(), tokenizer=tokenizer)
        modele.eval()

        import torch

        if torch.cuda.is_available():
            modele.to("cuda")

        _adaptateurs[cle] = (modele, processeur)
        _ordre.append(cle)

        while len(_ordre) > MAX_ADAPTATEURS:
            evince = _ordre.pop(0)
            _adaptateurs.pop(evince, None)
            log.info("adaptateur « %s » evince pour tenir dans la memoire", evince)

        log.info("adaptateur « %s » pret", cle)
        return _adaptateurs[cle]


def traducteur():
    """
    Modele de traduction, charge au premier besoin.

    Renvoie None si aucun modele n'est declare : la traduction est un etage
    facultatif, et son absence laisse passer le texte source inchange.
    """
    global _traducteur
    if not TRADUCTION_MODELE:
        return None
    with _verrou_traduction:
        if _traducteur is None:
            from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

            log.info("chargement du modele de traduction %s ...", TRADUCTION_MODELE)
            tokenizer = AutoTokenizer.from_pretrained(TRADUCTION_MODELE)
            modele = AutoModelForSeq2SeqLM.from_pretrained(TRADUCTION_MODELE)
            modele.eval()

            import torch

            if torch.cuda.is_available():
                modele.to("cuda")
            _traducteur = (modele, tokenizer)
            log.info("modele de traduction pret")
        return _traducteur


def _jeton_cible(tokenizer, cible: str):
    """
    Jeton qui force la langue de sortie.

    Les familles ne s'accordent pas : m2m100 expose `get_lang_id("fr")`, NLLB
    attend un jeton « fra_Latn » dans le vocabulaire, MADLAD ne veut rien ici
    mais un prefixe dans le texte. On essaie dans cet ordre, et l'absence de
    reponse n'est pas une erreur — certains modeles n'ont qu'une seule cible.
    """
    if TRADUCTION_JETON_CIBLE:
        jeton = tokenizer.convert_tokens_to_ids(TRADUCTION_JETON_CIBLE)
        # convert_tokens_to_ids rend l'id de l'inconnu quand le jeton est absent :
        # le prendre pour un jeton de langue produirait une sortie silencieusement
        # fausse, ce qui est pire que pas de forcage du tout.
        if jeton is not None and jeton != tokenizer.unk_token_id:
            return jeton
        log.warning("jeton de langue « %s » absent du vocabulaire — ignore", TRADUCTION_JETON_CIBLE)
        return None
    obtenir = getattr(tokenizer, "get_lang_id", None)
    if callable(obtenir):
        try:
            return obtenir(cible)
        except Exception:
            return None
    return None


def traduire_texte(texte: str, source: str = "", cible: str = "") -> str:
    """Texte -> texte. Rend la chaine vide telle quelle, sans charger le modele."""
    texte = (texte or "").strip()
    if not texte:
        return ""
    charge = traducteur()
    if charge is None:
        return texte

    import torch

    modele, tokenizer = charge
    cible = (cible or TRADUCTION_CIBLE).strip()
    source = (source or TRADUCTION_SOURCE).strip()

    # Langue d'entree, quand le tokenizer sait ce que c'est.
    if source and hasattr(tokenizer, "src_lang"):
        try:
            tokenizer.src_lang = source
        except Exception:
            log.debug("langue source « %s » refusee par le tokenizer", source)

    entree = f"{TRADUCTION_PREFIXE} {texte}".strip() if TRADUCTION_PREFIXE else texte
    jetons = tokenizer(entree, return_tensors="pt", truncation=True, max_length=512)
    jetons = {k: v.to(modele.device) for k, v in jetons.items()}

    options = dict(TRADUCTION_GENERATION)
    jeton = _jeton_cible(tokenizer, cible)
    if jeton is not None:
        options["forced_bos_token_id"] = jeton

    with torch.no_grad():
        sortie = modele.generate(**jetons, **options)
    rendu = tokenizer.batch_decode(sortie, skip_special_tokens=True)
    return (rendu[0] if rendu else "").strip()


def lire_audio(donnees: bytes):
    """WAV -> mono float32 a 16 kHz, le seul format que le modele accepte."""
    with sf.SoundFile(io.BytesIO(donnees)) as f:
        brut = f.read(dtype="float32", always_2d=True)
        sr = f.samplerate
    mono = brut.mean(axis=1)
    if sr != TARGET_SR:
        mono = librosa.resample(mono, orig_sr=sr, target_sr=TARGET_SR)
    return mono


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": REPO,
        "loaded": sorted(_adaptateurs.keys()),
        "generation": GENERATION,
        "translation": {
            "model": TRADUCTION_MODELE or None,
            "target": TRADUCTION_CIBLE,
            # Charge ou non : un modele declare mais pas encore en memoire fera
            # attendre le premier extrait. L'application s'en sert pour le dire.
            "loaded": _traducteur is not None,
        },
    }


@app.get("/languages")
def languages():
    return {"declared": LANGUES, "loaded": sorted(_adaptateurs.keys()), "base": True}


@app.post("/traduire")
async def traduire(
    request: Request,
    text: str = Form(""),
    source_language: str = Form(""),
    target_language: str = Form(""),
):
    """
    Traduction seule, pour un texte deja transcrit ou saisi a la main.

    La transcription passe plutot par `translate=1` sur `POST /` : un aller-retour
    par extrait au lieu de deux, ce qui compte quand un extrait tombe toutes les
    quelques secondes.
    """
    if TOKEN:
        if request.headers.get("authorization", "") != f"Bearer {TOKEN}":
            raise HTTPException(status_code=401, detail="Jeton absent ou invalide.")
    if not TRADUCTION_MODELE:
        raise HTTPException(
            status_code=501,
            detail="Aucun modele de traduction declare (TRADUCTION_MODELE).",
        )
    try:
        rendu = traduire_texte(text, source_language, target_language)
    except Exception as e:
        log.exception("echec de traduction")
        raise HTTPException(status_code=500, detail=str(e)) from e
    return JSONResponse({"text": rendu, "source": (text or "").strip(), "model": TRADUCTION_MODELE})


@app.post("/")
async def transcrire(
    request: Request,
    file: UploadFile = File(...),
    language: str = Form(""),
    source_language: str = Form(""),
    prompt: str = Form(""),
    initial_prompt: str = Form(""),
    translate: str = Form(""),
    target_language: str = Form(""),
):
    if TOKEN:
        if request.headers.get("authorization", "") != f"Bearer {TOKEN}":
            raise HTTPException(status_code=401, detail="Jeton absent ou invalide.")

    donnees = await file.read()
    if not donnees:
        raise HTTPException(status_code=400, detail="Extrait audio vide.")

    demandee = (source_language or language or "").strip().lower()
    # Une langue non declaree retombe sur le modele de base plutot que de
    # tenter un sous-dossier qui n'existe pas dans le depot.
    cle = demandee if demandee in LANGUES else "base"
    if demandee and cle == "base":
        log.info("adaptateur « %s » non declare : repli sur le modele de base", demandee)

    try:
        audio = lire_audio(donnees)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Audio illisible : {e}") from e

    if audio.size == 0:
        return JSONResponse({"text": "", "language": cle, "adapter": cle})

    import torch

    modele, processeur = adaptateur(cle)
    entrees = processeur(audio, sampling_rate=TARGET_SR, return_tensors="pt")
    features = entrees["input_features"].to(modele.device)

    options = dict(GENERATION)
    amorce = (prompt or initial_prompt or "").strip()
    if amorce:
        # Amorce de decodage, quand le tokenizer sait en fabriquer une. Sur un
        # adaptateur non francophone, l'appelant n'en envoie pas.
        try:
            options["prompt_ids"] = processeur.tokenizer.get_prompt_ids(
                amorce[:800], return_tensors="pt"
            ).to(modele.device)
        except Exception as e:
            log.debug("amorce non prise en charge : %s", e)

    try:
        with torch.no_grad():
            sortie = modele.generate(features, return_dict_in_generate=True, **options)
    except (TypeError, ValueError) as e:
        # Un argument refuse ne doit pas faire perdre l'extrait : on retente nu.
        log.warning("generation guidee refusee (%s), nouvel essai sans options", e)
        with torch.no_grad():
            sortie = modele.generate(features, return_dict_in_generate=True)
    except Exception as e:
        log.exception("echec de transcription")
        raise HTTPException(status_code=500, detail=str(e)) from e

    # `batch_decode` prend un LOT de sequences. Lui passer `sequences[0]`, qui
    # est une sequence unique, ferait decoder jeton par jeton et ne rendrait
    # que le premier. On decode le lot, puis on prend le premier element.
    textes = processeur.batch_decode(sortie.sequences, skip_special_tokens=True)
    texte = (textes[0] if textes else "").strip()

    reponse = {"text": texte, "language": cle, "adapter": cle}

    # Second etage. Il ne remplace jamais `text` : la source part avec la
    # traduction, parce que c'est elle qui a ete prononcee et que le medecin
    # doit pouvoir la relire. Un echec de traduction rend l'extrait transcrit
    # plutot que rien — perdre la parole du patient serait le pire des deux.
    if translate.strip() == "1" and TRADUCTION_MODELE and texte:
        try:
            reponse["translation"] = traduire_texte(texte, cle, target_language)
            reponse["translation_model"] = TRADUCTION_MODELE
        except Exception as e:
            log.exception("echec de traduction de l extrait")
            reponse["translation_error"] = str(e)

    return JSONResponse(reponse)


if __name__ == "__main__":
    import uvicorn

    if HOST not in ("127.0.0.1", "localhost"):
        log.warning(
            "ecoute sur %s : ce service recoit de l'audio de consultation. "
            "Verifiez qu'il reste sur le reseau de la structure.",
            HOST,
        )
    if TRADUCTION_MODELE:
        log.info(
            "traduction active : %s -> %s. Verifiez que la licence de ce modele "
            "couvre votre usage : aucun modele fon-francais leger n est aujourd hui "
            "a la fois evalue et clairement licencie pour le soin.",
            TRADUCTION_MODELE,
            TRADUCTION_CIBLE,
        )
    if os.environ.get("GRIOT_PRELOAD", "").strip() == "1":
        for langue in LANGUES[:MAX_ADAPTATEURS]:
            adaptateur(langue)
        traducteur()
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
