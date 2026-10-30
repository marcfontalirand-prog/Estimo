#!/usr/bin/env python3
"""Précalcule des JSON compacts DVF (Etalab geo-dvf) par commune.
Usage : python3 tools/build-dvf.py 06 2023 2024 2025  (lit /tmp/dvf/<année>.csv.gz,
téléchargés depuis https://files.data.gouv.fr/geo-dvf/latest/csv/<année>/departements/<dep>.csv.gz)
Ne garde que les ventes d'un seul logement (1 maison ou 1 appartement, dépendances admises, aucun local commercial)."""
import csv, gzip, json, os, sys
from collections import defaultdict
dep, years = sys.argv[1], sys.argv[2:]
out = os.path.join(os.path.dirname(__file__), '..', 'data', 'dvf', dep)
os.makedirs(out, exist_ok=True)
muts = defaultdict(list)
for y in years:
    with gzip.open(f'/tmp/dvf/{y}.csv.gz', 'rt', encoding='utf-8') as fh:
        for r in csv.DictReader(fh): muts[r['id_mutation']].append(r)
by_c = defaultdict(list); names = {}; maxd = ''
for mid, rows in muts.items():
    r0 = rows[0]
    if r0['nature_mutation'] not in ('Vente', "Vente en l'état futur d'achèvement"): continue
    locs = {}
    for r in rows:
        if r['code_type_local']: locs[(r['id_parcelle'], r['lot1_numero'], r['code_type_local'], r['surface_reelle_bati'])] = r
    lg = [r for r in locs.values() if r['code_type_local'] in ('1', '2')]
    if len(lg) != 1 or any(r['code_type_local'] == '4' for r in locs.values()): continue
    l = lg[0]
    try: prix = float(r0['valeur_fonciere']); surf = float(l['surface_reelle_bati']); lat = float(l['latitude']); lon = float(l['longitude'])
    except ValueError: continue
    if prix <= 0 or surf <= 0: continue
    terr = sum({r['id_parcelle']: float(r['surface_terrain'] or 0) for r in rows}.values())
    c = l['code_commune']; names[c] = l['nom_commune']; maxd = max(maxd, r0['date_mutation'])
    by_c[c].append([r0['date_mutation'], round(prix), round(surf), 'm' if l['code_type_local'] == '1' else 'a', round(lat, 5), round(lon, 5), round(terr), 1 if 'futur' in r0['nature_mutation'] else 0, l['id_parcelle']])
idx = {}
for c, rows in sorted(by_c.items()):
    rows.sort()
    json.dump({'commune': c, 'nom': names[c], 'cols': ['date', 'prix', 'surface', 'type', 'lat', 'lon', 'terrain', 'vefa', 'parcelle'], 'rows': rows}, open(f'{out}/{c}.json', 'w'), separators=(',', ':'), ensure_ascii=False)
    la = [r[4] for r in rows]; lo = [r[5] for r in rows]
    idx[c] = {'nom': names[c], 'n': len(rows), 'bbox': [min(lo), min(la), max(lo), max(la)]}
json.dump({'source': 'DVF Etalab, décembre 2025', 'departement': dep, 'annees': years, 'derniere_vente': maxd, 'communes': idx}, open(f'{out}/index.json', 'w'), separators=(',', ':'), ensure_ascii=False)
print(len(idx), sum(v['n'] for v in idx.values()), maxd)
