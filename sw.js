// Service worker: يخزّن غلاف التطبيق فقط (الشاشة الافتتاحية وصفحة عدم الاتصال).
// لا يخزّن أي بيانات من الشيت ولا من لوحة Apps Script.
const CACHE = 'hse-shell-v2';
const SHELL = ['./', './index.html', './offline.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // لا نلمس طلبات جوجل
  e.respondWith(
    fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./offline.html') : Response.error())))
  );
});
