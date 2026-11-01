#!/usr/bin/env python3
"""Précalcule data/loyers/<dep>.json depuis la « Carte des loyers » (ANIL / Ministère du Logement, data.gouv.fr).
Édition 2025 : loyers d'annonce non meublés, charges comprises, prédits pour un bien de référence au 3e trimestre 2025.
Usage : python3 tools/build-loyers.py 06"""
import csv, io, json, sys, urllib.request
DEP = sys.argv[1] if len(sys.argv) > 1 else '06'
B = 'https://static.data.gouv.fr/resources/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/'
FILES = {'app': '20251211-145010/pred-app-mef-dhup.csv', 'app12': '20251211-144934/pred-app12-mef-dhup.csv',
         'app3': '20251211-144951/pred-app3-mef-dhup.csv', 'mai': '20251211-145039/pred-mai-mef-dhup.csv'}
# Encadrement du niveau des loyers (art. 140 loi ELAN) : aucune commune des Alpes-Maritimes n'y est soumise
# (territoires concernés : Paris, Lille, Plaine Commune, Est Ensemble, Lyon-Villeurbanne, Montpellier, Bordeaux, Pays basque, Grenoble-Alpes Métropole).
ENCADREMENT = {}
f = lambda s: round(float(s.replace(',', '.')), 2)
out = {'source': 'Carte des loyers — ANIL / Ministère du Logement (data.gouv.fr)', 'annee': 2025,
       'reference': 'Loyers d’annonce non meublés, charges comprises, 3e trimestre 2025', 'departement': DEP,
       'encadrement_note': 'Aucune commune des Alpes-Maritimes n’est soumise à l’encadrement du niveau des loyers (loi ELAN, art. 140).',
       'cols': ['loyer_m2', 'bas_m2', 'haut_m2', 'type_prediction', 'nb_obs_commune'], 'communes': {}}
for k, p in FILES.items():
    raw = urllib.request.urlopen(B + p).read().decode('latin-1')
    for r in csv.DictReader(io.StringIO(raw), delimiter=';'):
        if r['DEP'] != DEP: continue
        c = out['communes'].setdefault(r['INSEE_C'], {'nom': r['LIBGEO'], 'encadrement': ENCADREMENT.get(r['INSEE_C'], False)})
        c[k] = [f(r['loypredm2']), f(r['lwr.IPm2']), f(r['upr.IPm2']), r['TYPPRED'], int(r['nbobs_com'])]
import os; os.makedirs('data/loyers', exist_ok=True)
json.dump(out, open(f'data/loyers/{DEP}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(out['communes']), 'communes')
