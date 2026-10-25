// يخزّن غلاف التطبيق فقط (HTML/CSS/JS/أيقونات). لا يخزّن طلبات جوجل ولا البيانات.
const CACHE = 'hse-app-v3';
const SHELL = ['./', './index.html', './style.css', './fonts.css', './fonts/plex-arabic-400.woff2', './fonts/plex-arabic-600.woff2', './fonts/plex-arabic-700.woff2', './fonts/plex-latin-400.woff2', './fonts/plex-latin-600.woff2', './fonts/plex-latin-700.woff2', './icons/favicon.svg', './icons/favicon-32.png', './app.js', './core.js', './config.js', './offline.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); return res; })
    .catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
