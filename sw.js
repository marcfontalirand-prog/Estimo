const VERSION = 'estimo-v2.0.0';
const PRECACHE = ['./', './index.html', './offline.html', './manifest.json', './css/app.css', './js/app.js', './js/engine.js', './js/data.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // Réseau d'abord pour les pages, repli cache puis page hors ligne.
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); return r; })
      .catch(async () => (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./index.html')) || caches.match('./offline.html')));
    return;
  }
  // Ressources statiques : cache d'abord, mise à jour en arrière-plan.
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
