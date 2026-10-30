# Estimo v2

PWA d'estimation immobilière (Laforêt Le Cannet). Site statique : HTML/CSS/JS (modules ES), **aucune étape de build**, aucune dépendance externe, fonctionne hors ligne. Publiée sur GitHub Pages : https://marcfontalirand-prog.github.io/Estimo/

## Structure
- `index.html`, `css/app.css`, `js/app.js` – interface (FR, mobile d'abord)
- `js/engine.js` – moteur d'estimation pur (testable sous Node)
- `js/data.js` – **tables éditables** : prix/m² par secteur, coefficients, pondérations, valeur des stationnements
- `manifest.json`, `sw.js`, `offline.html`, `icons/`, `screenshots/` – PWA
- `tests/engine.test.mjs` – tests : `node --test tests/engine.test.mjs`

## Méthode d'estimation
1. Base = surface habitable × prix/m² de référence du secteur (modifiable à chaque estimation).
2. Annexes pondérées : balcon 30 %, terrasse 40 %, jardin d'appartement 15 %, terrain de maison au-delà de l'emprise 4 % du prix/m².
3. Coefficients multiplicatifs : état, DPE, exposition, vue, piscine, étage/ascenseur/dernier étage, année de construction, charges de copropriété, pièces exiguës, coefficient manuel (0,70–1,30). Produit plafonné entre 0,60 et 1,40.
4. Stationnement ajouté en montant fixe.
5. Fourchette : ±6 % de base, +1,5 pt par donnée clé manquante, +3 pts si le prix/m² n'est pas marqué « vérifié » (plafond ±20 %).

**Important** : les prix/m² et coefficients par défaut sont des **hypothèses de départ non vérifiées**, pas des données officielles. Recalez-les (onglet « Prix/m² ») avec DVF (https://app.dvf.etalab.gouv.fr/), le baromètre des notaires et vos ventes récentes, puis cochez « Vérifié ».

## Données
Tout est stocké localement (`localStorage`) : brouillon, historique (200 dernières estimations), tables de prix. Rien n'est envoyé sur un serveur.

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
