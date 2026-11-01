# Estimo V2

PWA mobile-first d'estimation immobilière sur site, sans publicité, fonctionnant hors ligne.

- `index.html` : application complète (fichier unique, React 18 + Tailwind + Babel via CDN). **Générée** par `node tools/build-html.mjs` à partir de `src/app.template.html` en y injectant `js/dvf.js` et `js/loyers.js` (modules testés).
- `manifest.json`, `sw.js`, `icons/` : PWA installable, prête pour PWABuilder.
- Dossiers clients stockés dans `localStorage` (`estimo.v2.dossiers`), photos compressées à 800 px de large (JPEG).
- 5 onglets : Client, Bien, Technique, Financier, Médias (navigation par glissement).
- Comparatif DVF à 300 m : `data/dvf/06/` (DVF Etalab, décembre 2025, `tools/build-dvf.py`), repli API Cerema ; médiane après exclusion IQR.
- Estimation locative : `data/loyers/06.json` (Carte des loyers ANIL / Ministère du Logement, édition 2025, `tools/build-loyers.py`), loyer vide, meublé (hypothèse +15 %), rendement brut, mention de l'encadrement des loyers.
- Fiche d'estimation texte (partage / copie), export VCard.

Tests : `node --test tests/*.mjs`.
