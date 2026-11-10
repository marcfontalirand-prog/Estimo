// Estimo V2 — changer VERSION à chaque déploiement.
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
const VERSION = 'estimo-v2.4.0';
const SHELL = ['./', './index.html', './manifest.json', './icons/logo.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './data/dvf/06/index.json', './data/loyers/06.json'];
const CDN = ['https://cdn.tailwindcss.com/3.4.16', 'https://unpkg.com/react@18.3.1/umd/react.production.min.js', 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js', 'https://unpkg.com/@babel/standalone@7.26.4/babel.min.js'];
self.addEventListener('install', (e) => e.waitUntil((async () => {
  const c = await caches.open(VERSION);
  await c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
  await Promise.all(CDN.map((u) => fetch(u, { mode: 'cors' }).then((r) => { if (!r.ok) throw 0; return r; }).then((r) => c.put(u, r)).catch(() => {})));
  await self.skipWaiting();
})()));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // API externes (géocodage, Cerema) : réseau uniquement.
  if (/api-adresse\.data\.gouv\.fr|cerema\.fr/.test(url.host)) return;
  // Navigation : réseau d'abord, repli sur l'application en cache.
  if (req.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname) && url.origin === location.origin) { e.respondWith(fetch(req, { cache: 'no-store' }).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put('./index.html', cp)); return r; }).catch(() => caches.match('./index.html'))); return; }
  // Données DVF : réseau d'abord, mise en cache pour consultation hors ligne des communes déjà analysées.
  if (url.pathname.includes('/data/')) { e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); return r; }).catch(() => caches.match(req))); return; }
  // Le reste (icônes, CDN) : cache d'abord.
  e.respondWith(caches.match(req).then((m) => m || fetch(req).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); return r; })));
});
