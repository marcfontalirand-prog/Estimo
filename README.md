# Estimo V2

PWA mobile-first d'estimation immobilière sur site, sans publicité, fonctionnant hors ligne.

- `index.html` : application complète (fichier unique, React 18 + Tailwind + Babel via CDN). **Générée** par `node tools/build-html.mjs` à partir de `src/app.template.html` en y injectant `js/dvf.js`, `js/loyers.js`, `js/ajust.js` et `js/snap.js` (modules testés). Ne jamais éditer `index.html` à la main.
- `manifest.json`, `sw.js`, `icons/` : PWA installable, prête pour PWABuilder.
- Dossiers clients stockés dans `localStorage` (`estimo.v2.dossiers`), photos compressées à 800 px de large (JPEG).
- **Sauvegarde automatique** : après chaque modification, un instantané silencieux de tous les dossiers est écrit dans IndexedDB (8 conservés, les 2 plus récents avec photos). Aucun fichier à télécharger, aucune action de l'utilisateur. L'écran **Paramètres** (⚙️ en haut de l'accueil) permet de revenir à une copie, d'exporter un fichier JSON et de le réimporter. Limite assumée : ces copies vivent dans l'appareil, seul un export manuel survit à un changement de téléphone.
- `navigator.storage.persist()` demandé au démarrage : sans lui, Safari peut purger le stockage d'une PWA non installée après une longue période sans ouverture.
- **Estimation ajustée** : `js/ajust.js` convertit les champs qualitatifs (étage, ascenseur, terrasse, vue, bruit, DPE, stationnement, points d'attention…) en coefficients explicites appliqués à la médiane DVF. Chaque ligne est plafonnée à ±8 %, le total à ±20 %, le positionnement libre de l'agent à ±10 points. Le détail est affiché dans l'application, dans la fiche remise au client et dans l'export texte.
- `ErrorBoundary` : une erreur de rendu affiche un écran de secours avec rechargement et export des dossiers, au lieu d'un écran blanc.
- 6 onglets : Client, Bien, Technique, Financier, Location, Médias (navigation par glissement).
- Interface : thème **Clair / Sombre / Auto** dans Paramètres › Affichage (le bouton lune de l'accueil reste un raccourci) ; paramètres rangés en trois sections (Données, Affichage, Application).
- Onglet Financier : charges et projet de vente, puis comparatif DVF, ajustements, et l'**avis de valeur en bas**. La fiche texte n'existe plus en carte dans cet onglet : elle est dans le bandeau de partage (Fiche, Contact, WhatsApp, Email, Copier).
- Médias : le bouton **Galerie** ouvre le sélecteur d'images natif (champ `accept="image/*"` **sans** `multiple`, qui fait retomber certains navigateurs Android sur le sélecteur de fichiers) ; la sélection multiple reste disponible sous « Ajouter plusieurs photos d'un coup ».
- Comparatif DVF à 300 m : `data/dvf/06/` (DVF Etalab geo-dvf, `tools/build-dvf.py`), repli API Cerema ; médiane après exclusion IQR.
- Estimation locative : `data/loyers/06.json` (Carte des loyers ANIL / Ministère du Logement, édition 2025, `tools/build-loyers.py`), loyer vide, meublé (hypothèse +15 %), rendement brut, mention de l'encadrement des loyers.
- Fiche d'estimation texte (partage / copie), export VCard.

## Méthode d'estimation

La médiane DVF décrit le marché d'un rayon de 300 m, toutes qualités confondues : elle contient donc déjà l'état moyen des biens vendus. Les coefficients de `js/ajust.js` ne remplacent pas cette réalité, ils mesurent un écart documenté par rapport au bien moyen du secteur — d'où des plafonds volontairement bas. La fourchette Q1–Q3 reçoit le même coefficient que la médiane, ce qui conserve la dispersion du marché. Toute estimation reste indicative et non contractuelle.

## Tests

```bash
node --test tests/*.mjs      # ou : npm test
```

`package.json` déclare `"type": "module"` : sans lui, Node lit `js/*.js` comme du CommonJS et les tests échouent.

Les tests couvrent le moteur DVF, les loyers, le moteur d'ajustement (21 cas), les instantanés, la fusion de sauvegardes et le contenu réel de la fiche remise au client.

### Contrôle de rendu (sans navigateur)

```bash
BABEL_PATH=/chemin/vers/babel.min.js node tools/smoke.mjs
```

Compile le JSX d'`index.html` et exécute réellement `Home`, `Parametres`, `AjustPanel` et `Editor` avec un React factice : attrape les erreurs de référence et les textes faux (c'est ce contrôle qui a révélé que `EstimoDVF.DATA_CUTOFF` n'était pas exposé, donc affiché « Invalid Date »). Ignoré proprement si Babel est absent.

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

## Avis de valeur

Depuis l'onglet **Financier**, en bas de la page (après le comparatif DVF et les ajustements), la carte
**Avis de valeur** propose deux sorties : **Aperçu** (relire à l'écran, sans imprimer) et **Partager**.

**Partager** ouvre une feuille de six sorties :

| Sortie | Ce qu'elle fait |
|---|---|
| Imprimante | Monte le document A4 dans la page, puis ouvre la fenêtre d'impression (« Enregistrer au format PDF »). |
| WhatsApp | Ouvre `wa.me` avec le résumé chiffré du dossier. Le message ne porte pas les 18 pages. |
| E-mail | Ouvre `mailto:` vers l'adresse du dossier (vide si absente), objet et corps pré-remplis. |
| Fichier .html | Télécharge `avis-de-valeur-<client>-<date>.html`, document autonome, à joindre soi-même. |
| Copier le résumé | Copie le même résumé dans le presse-papier. |
| Autres apps | Feuille de partage du système (`navigator.share`), avec le fichier quand le navigateur l'accepte (`canShare`), sinon le texte seul. |

Aucune sortie n'envoie quoi que ce soit d'elle-même : chacune ouvre une application, l'envoi reste un
geste de l'utilisateur, et rien ne part vers un serveur. La feuille est montée dans le `<body>`
(`createPortal`) : le carrousel des onglets est transformé, un `position:fixed` y serait piégé.

- Le document exige un comparatif DVF lancé et une surface : sans médiane, pas de document.
- Le profil (Paramètres › Profil) remplit le bloc agence et les mentions légales ; les champs qu'aucune
  donnée ne peut remplir (honoraires, délais de vente, secteur) restent balisés `à compléter` : jamais inventés.
- Le bandeau « document de test » reste actif (`AVIS_DEMO` dans `src/app.template.html`) tant que les
  mentions légales et les licences (ANIL, Cerema) ne sont pas tranchées ; la feuille de partage le rappelle.
- Réglages d'impression : marges « aucune », échelle 100 %, graphiques d'arrière-plan activés.
- Tests : `node --test tests/pdfdoc.test.mjs` (les cas Le Cannet 308 176 € / 86 sur 100 et
  Mougins 48 sur 100 sont rejoués à chaque exécution) et `tests/partage.test.mjs` (deux sorties sur la
  carte, six dans la feuille, aucun envoi automatique).
