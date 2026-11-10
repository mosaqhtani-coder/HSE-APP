// خدمة الكاش v1.16: نخزّن هيكل التطبيق فقط. طلبات الخادم (script.google.com) ما تمر من هنا أبداً.
// الاستراتيجية: الملفات المرقّمة (?v=) من الكاش مباشرة (ثابتة لكل نسخة)، صفحة index.html من الشبكة بمهلة قصيرة
// وبعدها الكاش، وباقي الملفات (أيقونات/manifest) من الكاش مع تحديث بالخلفية.
var CACHE = 'ptw-app-v1.16';
var VER = '?v=1.16';
var SHELL = ['./', 'index.html', 'styles.css' + VER, 'app.js' + VER, 'config.js' + VER, 'manifest.webmanifest'];
var NAV_TIMEOUT = 2500;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});

function put(req, res) {
  if (res && res.ok && res.type !== 'opaque') { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
  return res;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // صفحة التطبيق: الشبكة أولًا بمهلة قصيرة، وإلا الكاش (فتح فوري حتى مع شبكة ضعيفة)
  if (req.mode === 'navigate' || url.pathname.slice(-1) === '/' || /\/index\.html$/.test(url.pathname)) {
    e.respondWith(new Promise(function (resolve) {
      var done = false;
      function fromCache() { return caches.match('index.html').then(function (m) { return m || caches.match('./'); }); }
      var t = setTimeout(function () { fromCache().then(function (m) { if (m && !done) { done = true; resolve(m); } }); }, NAV_TIMEOUT);
      fetch(new Request(req, { cache: 'no-cache' })).then(function (res) {
        clearTimeout(t); put(new Request('index.html'), res.clone());
        if (!done) { done = true; resolve(res); }
      }).catch(function () {
        clearTimeout(t);
        fromCache().then(function (m) { if (!done) { done = true; resolve(m || Response.error()); } });
      });
    }));
    return;
  }

  // ملفات مرقّمة بالنسخة: من الكاش مباشرة (الرقم يتغيّر مع كل إصدار فما فيه خطر قديم)
  if (url.search.indexOf('v=') > -1) {
    e.respondWith(caches.match(req).then(function (m) {
      return m || fetch(req).then(function (res) { return put(req, res); });
    }));
    return;
  }

  // الباقي: من الكاش فورًا ونحدّثه بالخلفية
  e.respondWith(caches.match(req).then(function (m) {
    var net = fetch(new Request(req, { cache: 'no-cache' })).then(function (res) { return put(req, res); }).catch(function () { return m; });
    return m || net;
  }));
});
