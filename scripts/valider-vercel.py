"""Valide vercel.json contre le schema publie par Vercel.

Le schema pose additionalProperties: false au niveau superieur ET dans
chaque service. Une cle inconnue — un commentaire « // … », par exemple —
fait refuser le deploiement entier, pas seulement ignorer la ligne.
"""
import json
import re
import sys
import urllib.request

SCHEMA = 'https://openapi.vercel.sh/vercel.json'

with urllib.request.urlopen(SCHEMA, timeout=30) as r:
    schema = json.load(r)

with open('vercel.json', encoding='utf-8') as f:
    conf = json.load(f)

erreurs = []

# --- niveau superieur
permises = set(schema.get('properties', {})) | {'$schema'}
for cle in conf:
    if cle not in permises:
        erreurs.append(f'niveau superieur : « {cle} » n est pas une propriete connue')

# --- services
svc_schema = schema['properties']['services']
motif = re.compile(svc_schema['propertyNames']['pattern'])
cles_svc = set(svc_schema['additionalProperties'].get('properties', {}))

for nom, service in conf.get('services', {}).items():
    if not motif.match(nom):
        erreurs.append(f'service « {nom} » : le nom ne respecte pas {motif.pattern}')
    for cle in service:
        if cle not in cles_svc:
            erreurs.append(f'service « {nom} » : « {cle} » n est pas une propriete connue')

# --- coherence du routage : une rewrite ne peut viser qu un service declare
declares = set(conf.get('services', {}))
vises = set()
for r in conf.get('rewrites', []):
    d = r.get('destination')
    if isinstance(d, dict) and 'service' in d:
        vises.add(d['service'])
        if d['service'] not in declares:
            erreurs.append(f'rewrite vers « {d["service"]} », qui n est pas declare dans services')

# --- coherence des bindings
for nom, service in conf.get('services', {}).items():
    for b in service.get('bindings', []):
        manquants = [c for c in ('type', 'service', 'format', 'env') if c not in b]
        if manquants:
            erreurs.append(f'binding de « {nom} » : champs manquants {manquants}')
        if b.get('service') and b['service'] not in declares:
            erreurs.append(f'binding de « {nom} » vers « {b["service"]} », non declare')

print(f'services declares : {", ".join(sorted(declares)) or "(aucun)"}')
print(f'services publics  : {", ".join(sorted(vises)) or "(aucun)"}')
print(f'services internes : {", ".join(sorted(declares - vises)) or "(aucun)"}')

if erreurs:
    print()
    for e in erreurs:
        print('  REFUS :', e)
    sys.exit(1)

print('\nAucune propriete inconnue. Le fichier respecte le schema.')
