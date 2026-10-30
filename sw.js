// Estimo v3 — changer VERSION à chaque déploiement pour forcer la mise à jour des clients.
const VERSION = 'estimo-v3.0.0';
const PRECACHE = ['./', './index.html', './offline.html', './manifest.json', './css/app.css', './js/app.js', './js/engine.js', './js/data.js', './js/dvf.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // API (géocodage BAN, DVF Cerema) : jamais mises en cache par le service worker — réseau uniquement.
  // Le repli hors ligne des prix DVF est géré par l'application (localStorage, dernières valeurs datées).
  if (new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); return r; })
      .catch(async () => (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./index.html')) || caches.match('./offline.html')));
    return;
  }
  // Ressources statiques : réseau d'abord (fraîcheur), repli cache hors ligne.
  e.respondWith(fetch(req).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); } return r; })
    .catch(() => caches.match(req)));
});
