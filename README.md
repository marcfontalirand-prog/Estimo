# Estimo v3

PWA d'estimation immobilière (Laforêt Le Cannet). Site statique : HTML/CSS/JS (modules ES), **aucune étape de build**, aucune dépendance de code externe. Le prix/m² de référence vient des ventes DVF autour de l'adresse (réseau requis, repli hors ligne sur la dernière valeur en cache). Publiée sur GitHub Pages : https://marcfontalirand-prog.github.io/Estimo/

## Structure
- `index.html`, `css/app.css`, `js/app.js` – interface (FR, mobile d'abord)
- `js/engine.js` – moteur d'estimation pur (testable sous Node)
- `js/dvf.js` – géocodage (API Adresse) + ventes DVF (JSON Etalab précalculés, repli API Cerema), filtres, médiane, exclusion IQR (logique pure testée)
- `data/dvf/<dep>/` – ventes DVF Etalab (geo-dvf) précalculées par commune + `index.json` (emprises) ; générées par `tools/build-dvf.py`
- `js/data.js` – **tables éditables** : coefficients, pondérations, valeur des stationnements
- `manifest.json`, `sw.js`, `offline.html`, `icons/`, `screenshots/` – PWA
- `tests/engine.test.mjs`, `tests/dvf.test.mjs` – tests : `node --test tests/*.test.mjs`

## Méthode d'estimation
1. Base = surface habitable × prix/m² de référence = **médiane DVF des ventes comparables** (modifiable manuellement).
2. Annexes pondérées : balcon 30 %, terrasse 40 %, jardin d'appartement 15 %, terrain de maison au-delà de l'emprise 4 % du prix/m².
3. Coefficients multiplicatifs : état, DPE, exposition, vue, piscine, étage/ascenseur/dernier étage, année de construction, charges de copropriété, pièces exiguës, coefficient manuel (0,70–1,30). Produit plafonné entre 0,60 et 1,40.
4. Stationnement ajouté en montant fixe.
5. Fourchette : ±6 % de base, +1,5 pt par donnée clé manquante, +3 pts si le prix/m² n'est pas marqué « vérifié » (plafond ±20 %).

## Prix/m² DVF
- Géocodage : `https://api-adresse.data.gouv.fr/search/` (CORS `*`).
- Source principale : **DVF Etalab, décembre 2025** (geo-dvf, ventes 2023-2025, département 06). Les fichiers geo-dvf n'ayant pas d'en-tête CORS, ils sont convertis en JSON compacts par commune (`python3 tools/build-dvf.py 06 2023 2024 2025`) et servis par le site ; l'app ne charge que l'index du département et les communes dont l'emprise touche le rayon.
- Repli (si la source principale échoue) : API DVF open data du Cerema `https://apidf-preprod.cerema.fr/dvf_opendata/geomutations/` (CORS `*`, sans clé). Les fichiers `files.data.gouv.fr/geo-dvf` ne renvoient **pas** d'en-tête CORS et ne sont donc pas utilisables depuis le navigateur.
- Requête par emprise (l'API limite à 0,02° × 0,02° : découpage en tuiles), `codtypbien` 121 (un appartement) ou 111 (une maison), années ≥ année courante − 3 (ou − 2).
- Filtres : même type, nature « Vente », date ≥ aujourd'hui − 3 ans, distance au centroïde de parcelle ≤ rayon (500 m par défaut, réglable), surface ±35 %, 300–60 000 €/m².
- Élargissement automatique si < 8 comparables : rayon 750 → 1 000 → 1 500 m, puis tolérance de surface ±60 %, puis sans filtre de surface.
- Exclusion des valeurs aberrantes par la règle 1,5 × IQR, puis médiane, Q1, Q3.
- Le prix est marqué « vérifié » (fourchette non élargie) s'il provient de ≥ 8 ventes DVF.
- Hors ligne : dernier résultat en cache (localStorage, 25 recherches, daté) pour le même point ou le plus proche (< 1,5 km). Le service worker ne met **jamais** en cache les appels API.
- Limites : DVF ne contient ni étage, ni état, ni DPE ; les adresses affichées des comparables sont obtenues par géocodage inverse du centroïde de parcelle (approximatives) ; données publiées avec ~6 mois de décalage ; l'API Cerema est hébergée sur un domaine « preprod » sans SLA.

**Important** : les coefficients par défaut sont des hypothèses de travail, pas des données officielles.

## Données
Tout est stocké localement (`localStorage`) : brouillon, historique (200 dernières estimations), cache DVF. Seules l'adresse saisie (API Adresse) et les coordonnées (API Cerema) sont envoyées à des services publics.

## Application Android (TWA)
Le package `io.github.marcfontalirand_prog.twa` continue de pointer vers la même URL de départ (`https://marcfontalirand-prog.github.io/Estimo/`).

Digital Asset Links : pour masquer la barre d'URL, le fichier `assetlinks.json` doit être servi à
`https://marcfontalirand-prog.github.io/.well-known/assetlinks.json`, donc dans le dépôt **racine** `marcfontalirand-prog/marcfontalirand-prog.github.io` (et non dans ce dépôt), avec :

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "io.github.marcfontalirand_prog.twa",
    "sha256_cert_fingerprints": ["E4:E1:38:A7:A7:84:31:CB:BE:28:D4:F2:F3:BE:E2:01:A3:B7:7B:38:C2:D6:4A:36:87:CA:B8:3F:5C:74:A4:72"]
  }
}]
```
Ne jamais versionner les mots de passe du keystore de signature.

## Mise à jour
Après toute modification de fichier mis en cache, incrémenter `VERSION` dans `sw.js`.
