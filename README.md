# Estimo V2

PWA mobile-first d'estimation immobilière sur site, sans publicité, fonctionnant hors ligne.

- `index.html` : application complète (fichier unique, React 18 + Tailwind + Babel via CDN). **Générée** par `node tools/build-html.mjs` à partir de `src/app.template.html` en y injectant `js/dvf.js` et `js/loyers.js` (modules testés). Ne jamais éditer `index.html` à la main.
- `manifest.json`, `sw.js`, `icons/` : PWA installable, prête pour PWABuilder.
- Dossiers clients stockés dans `localStorage` (`estimo.v2.dossiers`), photos compressées à 800 px de large (JPEG). **Sauvegarde / restauration** par fichier JSON depuis l'accueil (fusion sans perte : en cas de doublon, la version la plus récente est conservée).
- `ErrorBoundary` : une erreur de rendu affiche un écran de secours avec rechargement et export des dossiers, au lieu d'un écran blanc.
- 6 onglets : Client, Bien, Technique, Financier, Location, Médias (navigation par glissement).
- Comparatif DVF à 300 m : `data/dvf/06/` (DVF Etalab geo-dvf, `tools/build-dvf.py`), repli API Cerema ; médiane après exclusion IQR.
- Estimation locative : `data/loyers/06.json` (Carte des loyers ANIL / Ministère du Logement, édition 2025, `tools/build-loyers.py`), loyer vide, meublé (hypothèse +15 %), rendement brut, mention de l'encadrement des loyers.
- Fiche d'estimation texte (partage / copie), export VCard.

## Tests

```bash
node --test tests/*.mjs      # ou : npm test
```

`package.json` déclare `"type": "module"` : sans lui, Node lit `js/*.js` comme du CommonJS et les tests échouent.

## Mise à jour des données DVF

```bash
mkdir -p /tmp/dvf
curl -sSL -o /tmp/dvf/2023.csv.gz https://files.data.gouv.fr/geo-dvf/latest/csv/2023/departements/06.csv.gz
curl -sSL -o /tmp/dvf/2024.csv.gz https://files.data.gouv.fr/geo-dvf/latest/csv/2024/departements/06.csv.gz
curl -sSL -o /tmp/dvf/2025.csv.gz https://files.data.gouv.fr/geo-dvf/latest/csv/2025/departements/06.csv.gz
python3 tools/build-dvf.py 06 2023 2024 2025
node tools/build-html.mjs
```

`tools/build-dvf.py` réécrit automatiquement `DATA_CUTOFF` dans `js/dvf.js` (date de la vente la plus récente), affichée dans l'interface et dans la fiche. Un test échoue si `index.json` et `DATA_CUTOFF` divergent. Geo-dvf publie deux éditions par an ; vérifier la présence du dossier de l'année en cours avant de conclure que les données sont à jour.
