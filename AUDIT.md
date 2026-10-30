# Audit d'Estimo v1 (état du dépôt au 30/10/2026)

Constat sans complaisance de la version précédente (`index.html`, `manifest.json`, `sw.js`, `icon-192.png`).

## Bloquant
- **`index.html` est tronqué** : le fichier s'arrête au milieu d'un `useEffect(() => {` (ligne ~205). Le script Babel ne compile pas : **l'application publiée affiche une page vide**.
- **Aucun moteur d'estimation** : malgré le nom, l'app est un carnet de fiches client (client, bien, technique, financier, médias). Aucun calcul de prix, aucune fourchette, aucun prix/m².
- **« Comparaison DVF » factice** : un état `dvfResult` est déclaré mais aucune source DVF n'est interrogée.

## Hors ligne / PWA
- Dépendances CDN (Tailwind CDN, React UMD, Babel standalone, `lucide@latest`) : **rien ne fonctionne hors ligne**, le SW ne les met pas en cache.
- `lucide@latest` non figé : une mise à jour peut casser l'app à tout moment.
- Babel compilé dans le navigateur : lent sur mobile, déconseillé en production ; Tailwind CDN explicitement « non destiné à la production ».
- `sw.js` : stratégie réseau seul avec repli cache sur 2 fichiers ; pas de page hors ligne, pas de cache des icônes, `skipWaiting` avant la fin du precache.
- `manifest.json` incomplet : pas d'`id`, `scope`, `description`, `lang`, `categories`, d'icône 512, d'icône maskable ni de captures → PWA Builder / Play Store le signalent.
- `icon-192.png` pèse **1,2 Mo** pour 192 px (image non redimensionnée).

## Logique et données
- Champs numériques stockés en chaînes, aucune validation (surface négative, chambres > pièces, etc.).
- Médias (photos) prévus dans `localStorage` (≈ 5 Mo max) : saturation garantie, sans gestion d'erreur.
- Données personnelles clients (nom, téléphone, e-mail) stockées en clair sans mention RGPD ni export/suppression.
- Identifiants `Date.now()` et dates en `toLocaleDateString` (chaîne non triable).
- Pas de tests, pas de README, pas de séparation logique / interface.

## Angles morts
- Pas de prix de référence par secteur, pas de traçabilité des sources, pas d'indication d'incertitude.
- Pas d'impression / export de l'avis de valeur.
- Pas d'historique des estimations.

## Réponse apportée par la v2
Moteur séparé et testé (`js/engine.js`), tables de prix éditables et marquées « non vérifiées » (`js/data.js`), validation, fourchette dépendant des données manquantes, historique, impression PDF, PWA complète 100 % hors ligne sans dépendance externe.

## v3 (30/10/2026)
- Le tableau de prix/m² par commune codé en dur est remplacé par la médiane des ventes DVF à proximité (API Cerema, CORS vérifié), avec élargissement automatique, exclusion IQR, liste et carte des comparables, saisie manuelle et cache hors ligne.
- Interface refondue (mobile d'abord, thème clair/sombre, sections numérotées, carte de résultat avec fourchette visuelle).
- `sw.js` v3 : ressources statiques en réseau d'abord, API jamais interceptées ni mises en cache.
- Risque restant : dépendance à `apidf-preprod.cerema.fr` (pas de SLA) ; en cas de panne, saisie manuelle ou cache.
