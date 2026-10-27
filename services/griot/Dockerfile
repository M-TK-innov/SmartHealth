# Service de transcription Griot — SmartHealth
#
# POURQUOI UNE IMAGE ET NON UNE FONCTION SERVERLESS
#
# La roue PyTorch pese a elle seule plus de 400 Mo compressee, et davantage
# une fois decompressee ; les poids du modele pesent plusieurs gigaoctets.
# Les plafonds des plateformes de fonctions — 250 Mo decompresses chez
# Netlify, qui est une limite AWS et ne se releve pas — sont depasses par
# la seule dependance, avant tout modele.
#
# Et quand bien meme le code tiendrait : une fonction a systeme de fichiers
# ephemere retelecharge les poids a CHAQUE demarrage a froid, puis les
# recharge en memoire. Plusieurs minutes, la ou le delai d'execution se
# compte en dizaines de secondes.
#
# Ce service veut donc un hote qui garde un processus en vie et un disque :
# conteneur, machine virtuelle, ou le poste de l'etablissement lui-meme.
#
#   docker build -t smarthealth-griot services/griot
#   docker run --rm -p 8081:8081 \
#     -e GRIOT_HOST=0.0.0.0 \
#     -v griot-modeles:/modeles \
#     smarthealth-griot

FROM python:3.12-slim

# libsndfile : soundfile en depend pour lire le WAV que l'application envoie.
# ffmpeg : librosa s'en sert pour les formats que soundfile ne lit pas.
RUN apt-get update \
  && apt-get install --no-install-recommends -y libsndfile1 ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# PyTorch est epingle ICI et non dans requirements.txt, a dessein : le
# fichier de dependances laisse le choix de la roue parce qu'il sert aussi
# un poste avec carte graphique. Une image de serveur, elle, sait ce
# qu'elle vise — CPU seul — et l'index dedie evite d'embarquer CUDA, soit
# plusieurs gigaoctets dont ce service n'a aucun usage.
RUN pip install --no-cache-dir \
      --index-url https://download.pytorch.org/whl/cpu \
      torch==2.6.0

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py ./

# Les poids vivent sur un VOLUME, pas dans l'image. Sans cela, chaque
# redemarrage du conteneur les retelecharge — plusieurs gigaoctets, et une
# consultation qui attend.
ENV HF_HOME=/modeles \
    GRIOT_HOST=0.0.0.0 \
    GRIOT_PORT=8081
VOLUME ["/modeles"]

# Le modele se charge au demarrage plutot qu'a la premiere requete : mieux
# vaut un conteneur qui met deux minutes a devenir sain qu'un premier
# extrait de consultation qui expire.
ENV GRIOT_PRELOAD=1

EXPOSE 8081

# Le controle de sante attend que le modele soit charge, pas seulement que
# le processus ecoute : un orchestrateur qui bascule le trafic trop tot
# ferait echouer les premiers extraits.
HEALTHCHECK --interval=30s --timeout=10s --start-period=300s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8081/health', timeout=5).status == 200 else 1)"

CMD ["python", "server.py"]
