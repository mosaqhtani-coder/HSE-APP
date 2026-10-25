/* HSE ملاحظات — تطبيق ويب مستقل (PWA). قراءة فقط من Google Sheets عبر دخول جوجل. */
(function () {
'use strict';
var C = window.HSE_CONFIG, Core = window.Core, TZ = C.TZ_OFFSET_MIN;
var root = document.getElementById('app');
var IC = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  feed: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v2h6V3"/><path d="M9 12l2 2 4-4"/><path d="M9 17h6"/>',
  day: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M9 15l2 2 4-4"/>',
  zones: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.2L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 14.5 4.2l1.5-1.7"/><path d="M20 20v-4.5h-4.5"/>',
  menu: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  next: '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
  back: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>'
};
function ico(n) { return '<svg class="si" viewBox="0 0 24 24" aria-hidden="true">' + IC[n] + '</svg>'; }
var MON = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
var DOW = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];
var KIND = { act: 'تصرف غير آمن', condition: 'ظرف غير آمن', good: 'ممارسة جيدة', other: 'أخرى' };
var RISK = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة', other: 'أخرى' };
var PERIODS = [['all', 'الكل'], ['today', 'اليوم'], ['7', '٧ أيام'], ['30', '٣٠ يوم'], ['month', 'هذا الشهر']];
var S = {
  rows: [], dir: {}, people: [], byId: {}, quality: null, dirInfo: null,
  view: 'home', day: null, dfilter: 'all', tsort: 'n', period: 'all', f: { q: '', zone: '', kind: '', risk: '' }, tq: '', shown: 40, showInactive: true,
  token: null, exp: 0, signed: false, loading: false, error: '', syncedAt: 0, offline: !navigator.onLine, dirErr: false,
  emp: null, ey: null, em: null, ed: null, sheet: null, menu: false, lb: null, toast: ''
};
var tokenClient = null, pending = [], thumbCache = {}, lastNums = {};

/* ---------- أدوات ---------- */
function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function nf(n) { return Number(n || 0).toLocaleString('en-US'); }
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function loc(ts) { return new Date(ts + TZ * 60000); }
function fmtDay(ts) { var d = loc(ts); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
function fmtTime(ts) { var d = loc(ts); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
function fmtKey(k) { var p = k.split('-'); return (+p[2]) + ' ' + MON[+p[1] - 1] + ' ' + p[0]; }
function startOfDay(ts) { return Core.keyToUTC(Core.dayKey(ts, TZ)) - TZ * 60000; }
function hue(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
function av(p) { var h = hue(p.id); return '<div class="av" style="--c1:hsl(' + h + ' 52% 34%);--c2:hsl(' + ((h + 40) % 360) + ' 55% 24%)">' + esc((p.name.replace(/^ID /, '#').trim()[0]) || '؟') + '</div>'; }
function hz(o) { var b = Core.splitBilingual(o.hazard); return b.ar || b.en || o.hazard || '—'; }
function toast(m) { S.toast = m; render(); setTimeout(function () { S.toast = ''; render(); }, 2600); }

/* ---------- التخزين المحلي للنسخة الأخيرة (للعرض بدون إنترنت) ---------- */
function idb() { return new Promise(function (res, rej) { var r = indexedDB.open('hse-app', 1); r.onupgradeneeded = function () { r.result.createObjectStore('kv'); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
function kvGet(k) { return idb().then(function (db) { return new Promise(function (res) { var q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(null); }; }); }).catch(function () { return null; }); }
function kvSet(k, v) { return idb().then(function (db) { return new Promise(function (res) { var t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); }).catch(function () {}); }
function kvDel(k) { return idb().then(function (db) { return new Promise(function (res) { var t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = res; t.onerror = res; }); }).catch(function () {}); }
function flag(v) { try { if (v === undefined) return localStorage.getItem('hse_signed') === '1'; if (v) localStorage.setItem('hse_signed', '1'); else localStorage.removeItem('hse_signed'); } catch (e) { return false; } }

/* ---------- دخول جوجل ---------- */
function loadGsi() {
  return new Promise(function (res, rej) {
    if (window.google && google.accounts && google.accounts.oauth2) return res();
    var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = function () { res(); }; s.onerror = function () { rej(new Error('تعذر تحميل خدمة تسجيل الدخول من جوجل. تأكد من الإنترنت.')); };
    document.head.appendChild(s);
  });
}
function initClient() {
  if (tokenClient) return tokenClient;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: C.CLIENT_ID, scope: C.SCOPES,
    callback: function (r) {
      var ps = pending; pending = [];
      if (r && r.access_token) { S.token = r.access_token; S.exp = Date.now() + (Number(r.expires_in || 3600) - 90) * 1000; S.signed = true; flag(true); ps.forEach(function (p) { p.res(S.token); }); }
      else ps.forEach(function (p) { p.rej(new Error((r && (r.error_description || r.error)) || 'فشل تسجيل الدخول')); });
    },
    error_callback: function (e) { var ps = pending; pending = []; ps.forEach(function (p) { p.rej(new Error(e && e.type === 'popup_closed' ? 'أُغلقت نافذة الدخول' : 'تعذر الدخول (' + ((e && e.type) || 'خطأ') + ')')); }); }
  });
  return tokenClient;
}
function getToken(interactive) {
  if (S.token && Date.now() < S.exp) return Promise.resolve(S.token);
  return loadGsi().then(function () {
    initClient();
    return new Promise(function (res, rej) { pending.push({ res: res, rej: rej }); tokenClient.requestAccessToken({ prompt: interactive ? 'select_account' : '' }); });
  });
}
function api(url) {
  return getToken(false).then(function (t) {
    return fetch(url, { headers: { Authorization: 'Bearer ' + t } });
  }).then(function (r) {
    if (r.status === 401) { S.token = null; var e = new Error('انتهت الجلسة، سجّل الدخول من جديد'); e.code = 'AUTH'; throw e; }
    if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { var e = new Error((j.error && j.error.message) || ('خطأ ' + r.status)); e.code = r.status; throw e; });
    return r.json();
  });
}
function vals(id, tab, range) { return api('https://sheets.googleapis.com/v4/spreadsheets/' + id + '/values/' + encodeURIComponent("'" + tab + "'!" + range) + '?valueRenderOption=FORMATTED_VALUE'); }

/* ---------- تحميل البيانات ---------- */
function process(dv, rv) {
  var norm = Core.normalize(dv, { tzMin: TZ });
  var d = Core.parseDirectory(rv);
  Core.applyAliases(norm.rows, d.dir);
  S.rows = norm.rows; S.dir = d.dir; S.quality = norm.quality; S.dirInfo = { found: d.found, count: d.count };
  var by = {}, i, o, key;
  for (i = 0; i < S.rows.length; i++) { o = S.rows[i]; key = o.empId || ''; (by[key] = by[key] || []).push(o); }
  var people = [], seen = {};
  Object.keys(S.dir).forEach(function (k) { var e = S.dir[k]; if (e.id === k && !seen[k]) { seen[k] = 1; people.push({ id: k, name: e.name, ids: e.ids || [k], known: true }); } });
  Object.keys(by).forEach(function (k) { if (!seen[k]) { seen[k] = 1; people.push({ id: k || '—', name: k ? 'ID ' + k : 'بدون رقم وظيفي', ids: [k], known: false }); } });
  S.byId = {};
  people.forEach(function (p) {
    var rs = (by[p.id === '—' ? '' : p.id] || []).slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    p.rows = rs; S.byId[p.id] = p;
  });
  S.people = people;
}
function packForCache() { return { rows: S.rows, dir: S.dir, quality: S.quality, dirInfo: S.dirInfo, syncedAt: S.syncedAt }; }
function restore(c) {
  S.rows = c.rows; S.dir = c.dir; S.quality = c.quality; S.dirInfo = c.dirInfo; S.syncedAt = c.syncedAt;
  var by = {}; S.rows.forEach(function (o) { (by[o.empId || ''] = by[o.empId || ''] || []).push(o); });
  var people = [], seen = {};
  Object.keys(S.dir).forEach(function (k) { var e = S.dir[k]; if (e.id === k && !seen[k]) { seen[k] = 1; people.push({ id: k, name: e.name, ids: e.ids || [k], known: true }); } });
  Object.keys(by).forEach(function (k) { if (!seen[k]) { seen[k] = 1; people.push({ id: k || '—', name: k ? 'ID ' + k : 'بدون رقم وظيفي', ids: [k], known: false }); } });
  S.byId = {}; people.forEach(function (p) { p.rows = (by[p.id === '—' ? '' : p.id] || []).slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); S.byId[p.id] = p; });
  S.people = people;
}
function load() {
  if (S.loading) return Promise.resolve();
  S.loading = true; S.error = ''; render();
  return Promise.all([
    vals(C.DATA_SHEET_ID, C.DATA_TAB, 'A:Z'),
    vals(C.DIR_SHEET_ID, C.DIR_TAB, 'A:H').then(function (r) { S.dirErr = false; return r; }, function (e) { if (e.code === 'AUTH') throw e; S.dirErr = true; return { values: [] }; })
  ]).then(function (r) {
    process(r[0].values || [], r[1].values || []);
    S.syncedAt = Date.now(); S.offline = false; S.signed = true;
    return kvSet('cache', packForCache());
  }).catch(function (e) {
    S.error = e.code === 403 ? 'ما عندك صلاحية على الشيت. اطلب من صاحب الشيت يعطي حسابك صلاحية عرض.' : (e.message || 'تعذر التحميل');
    if (e.code === 'AUTH') S.signed = false;
  }).then(function () { S.loading = false; render(); });
}
function signIn() {
  S.error = '';
  return getToken(true).then(load).catch(function (e) { S.error = e.message; render(); });
}
function signOut() {
  var t = S.token; S.token = null; S.signed = false; flag(false); S.rows = []; S.people = []; S.byId = {}; S.menu = false; S.emp = null;
  kvDel('cache'); try { if (t && window.google) google.accounts.oauth2.revoke(t, function () {}); } catch (e) {}
  render();
}

/* ---------- الإحصاء ---------- */
function periodFrom() {
  var now = Date.now(), p = S.period, d0 = startOfDay(now);
  if (p === 'all') return null;
  if (p === 'today') return d0;
  if (p === '7') return d0 - 6 * 86400000;
  if (p === '30') return d0 - 29 * 86400000;
  if (p === 'month') { var k = Core.dayKey(now, TZ).slice(0, 7) + '-01'; return Core.keyToUTC(k) - TZ * 60000; }
  return null;
}
function inPeriod(rows) { var f = periodFrom(); if (f === null) return rows; return rows.filter(function (o) { return o.ts !== null && o.ts >= f; }); }
function tally(rows) {
  var t = { n: rows.length, act: 0, condition: 0, good: 0, other: 0, high: 0, medium: 0, low: 0 };
  rows.forEach(function (o) { t[o.catKind || 'other']++; if (o.risk === 'high') t.high++; else if (o.risk === 'medium') t.medium++; else if (o.risk === 'low') t.low++; });
  return t;
}
function countBy(rows, fn) { var m = {}; rows.forEach(function (o) { var k = fn(o); if (k) m[k] = (m[k] || 0) + 1; }); return m; }
function topList(m, n) { return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, n); }

/* ---------- واجهات صغيرة ---------- */
function chips() { return '<div class="chips">' + PERIODS.map(function (p) { return '<button class="chip' + (S.period === p[0] ? ' on' : '') + '" data-act="period" data-v="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div>'; }
function topbar(title, sub) {
  return '<div class="top"><h1>' + esc(title) + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</h1>' +
    '<button class="ic' + (S.loading ? ' spin' : '') + '" data-act="refresh" aria-label="تحديث">' + ico('refresh') + '</button><button class="ic" data-act="menu" aria-label="القائمة">' + ico('menu') + '</button></div>';
}
function syncSub() { return '<span class="dot' + (S.offline ? ' off' : '') + '"></span>' + (S.offline ? 'بدون اتصال · ' : '') + (S.syncedAt ? 'آخر تحديث ' + fmtTime(S.syncedAt) + ' · ' + fmtDay(S.syncedAt) : 'لم يتم التحديث'); }
function obsCard(o, showEmp) {
  var p = S.byId[o.empId || '—'];
  return '<button class="obs" data-act="obs" data-r="' + o.row + '"><div class="hd"><span>' + (o.ts ? fmtDay(o.ts) + ' · ' + fmtTime(o.ts) : 'بدون تاريخ') + '</span><span>' +
    '<span class="tag t-' + (o.catKind || 'other') + '">' + KIND[o.catKind || 'other'] + '</span>' + (o.risk ? '<span class="tag r-' + o.risk + '">' + RISK[o.risk] + '</span>' : '') + '</span></div>' +
    '<div class="ti">' + esc(hz(o)) + '</div>' + (showEmp && p ? '<p>' + esc(p.name) + (o.zone ? ' · ' + esc(o.zone) : '') + '</p>' : (o.zone ? '<p>' + esc(o.zone) + '</p>' : '')) + (o.desc ? '<p>' + esc(o.desc) + '</p>' : '') + '</button>';
}
/* ---------- التارقت اليومي والشهري (٢٠ ملاحظة في يوم العمل، سبت–خميس، الجمعة إجازة) ---------- */
function todayKey() { return Core.dayKey(Date.now(), TZ); }
function counts(p) {
  if (p._c && p._cn === p.rows.length) return p._c;
  var m = {}, d = {}; p.rows.forEach(function (o) { if (o.ts === null) return; var k = Core.dayKey(o.ts, TZ); d[k] = (d[k] || 0) + 1; var ym = k.slice(0, 7); m[ym] = (m[ym] || 0) + 1; });
  p._cn = p.rows.length; return (p._c = { m: m, d: d });
}
function tinfo(p, ym) { return Core.targetInfo(counts(p).m[ym] || 0, ym, todayKey()); }
function tclass(i) { return i.done >= i.target ? 'ok' : i.diff >= 0 ? 'ahead' : i.diff > -i.daily ? 'near' : 'behind'; }
function monthLabel(ym) { return MON[+ym.slice(5) - 1] + ' ' + ym.slice(0, 4); }
function targetLine(p) {
  var ym = todayKey().slice(0, 7), i = tinfo(p, ym), td = counts(p).d[todayKey()] || 0;
  return '<div class="tg ' + tclass(i) + '"><span>' + MON[+ym.slice(5) - 1] + ': <b class="num">' + nf(i.done) + '</b> / <span class="num">' + nf(i.target) + '</span></span><span class="rem">' + (i.remaining ? 'باقي <b class="num">' + nf(i.remaining) + '</b>' : 'اكتمل التارقت ✓') + '</span></div>' +
    '<div class="meter tgm ' + tclass(i) + '"><i style="width:' + Math.min(100, Math.max(2, i.pct)) + '%"></i></div>' +
    (Core.isWorkDay(todayKey()) ? '<small class="mut">اليوم <b class="num">' + td + '</b> / <span class="num">' + i.daily + '</span></small>' : '<small class="mut">اليوم إجازة</small>');
}
function peopleRows(arr, max, tg) {
  return arr.map(function (x, i) {
    var p = x.p; return '<button class="row2" data-act="emp" data-id="' + esc(p.id) + '"><span class="rk">' + (i + 1) + '</span>' + av(p) + '<div class="rw"><b>' + esc(p.name) + (p.known ? '' : ' *') + '</b><small class="num">' + esc(p.ids.join(' / ')) + '</small>' + (tg ? targetLine(p) : '<div class="meter"><i style="width:' + Math.max(3, Math.round(x.n / max * 100)) + '%"></i></div>') + '</div><div class="tot num" data-n="' + x.n + '">' + nf(x.n) + '</div></button>';
  }).join('');
}

/* ---------- الصفحات ---------- */
function vHome() {
  var rows = inPeriod(S.rows), t = tally(rows), now = Date.now(), d0 = startOfDay(now);
  var today = S.rows.filter(function (o) { return o.ts !== null && o.ts >= d0; }).length;
  var w7 = S.rows.filter(function (o) { return o.ts !== null && o.ts >= d0 - 6 * 86400000; }).length;
  var mk = Core.dayKey(now, TZ).slice(0, 7);
  var mo = S.rows.filter(function (o) { return o.ts !== null && Core.monthKey(o.ts, TZ) === mk; }).length;
  var unsafe = t.act + t.condition, share = t.n ? unsafe / t.n : 0, R = 34, Cc = 2 * Math.PI * R;
  var h = '<div class="hero"><svg class="ring" viewBox="0 0 84 84"><circle cx="42" cy="42" r="' + R + '" fill="none" stroke="#ffffff22" stroke-width="9"/><circle cx="42" cy="42" r="' + R + '" fill="none" stroke="#F5B700" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + (Cc * share).toFixed(1) + ' ' + Cc.toFixed(1) + '" transform="rotate(-90 42 42)"/><text x="42" y="47" text-anchor="middle" fill="#fff" font-size="15" font-weight="800">' + Math.round(share * 100) + '%</text></svg>' +
    '<div class="lbl" style="padding-inline-start:96px">إجمالي الملاحظات</div><div class="big num" data-n="' + t.n + '" style="padding-inline-start:96px">' + nf(t.n) + '</div>' +
    '<div class="row"><div><b class="num">' + nf(today) + '</b><span>اليوم</span></div><div><b class="num">' + nf(w7) + '</b><span>آخر ٧ أيام</span></div><div><b class="num">' + nf(mo) + '</b><span>هذا الشهر</span></div><div><b class="num">' + nf(Object.keys(countBy(rows, function (o) { return o.empId; })).length) + '</b><span>موظف نشط</span></div></div></div>';
  h += '<div class="kpis">' +
    '<div class="kpi" style="--c:var(--bad)"><div class="v num">' + nf(t.act) + '</div><div class="l">تصرف غير آمن</div></div>' +
    '<div class="kpi" style="--c:var(--warn)"><div class="v num">' + nf(t.condition) + '</div><div class="l">ظروف غير آمنة</div></div>' +
    '<div class="kpi" style="--c:var(--good)"><div class="v num">' + nf(t.good) + '</div><div class="l">ممارسات جيدة</div></div>' +
    '<div class="kpi" style="--c:var(--mid)"><div class="v num">' + nf(t.high) + '</div><div class="l">خطورة عالية</div></div></div>';
  // مخطط زمني
  var buckets = [], map = {}, labelA = '', labelB = '';
  if (S.period === 'all') {
    rows.forEach(function (o) { if (o.ts !== null) { var k = Core.monthKey(o.ts, TZ); map[k] = (map[k] || 0) + 1; } });
    var ks = Object.keys(map).sort();
    if (ks.length) { var cur = ks[0], end = ks[ks.length - 1]; while (cur <= end) { buckets.push(map[cur] || 0); var y = +cur.slice(0, 4), m = +cur.slice(5); m++; if (m > 12) { m = 1; y++; } cur = y + '-' + pad(m); } labelA = MON[+ks[0].slice(5) - 1] + ' ' + ks[0].slice(0, 4); labelB = MON[+end.slice(5) - 1] + ' ' + end.slice(0, 4); }
  } else {
    var from = periodFrom(), days = Math.round((d0 - from) / 86400000) + 1;
    for (var i = 0; i < days; i++) { var k2 = Core.dayKey(from + i * 86400000 + TZ * 60000 + 1, TZ); map[k2] = 0; buckets.push(k2); }
    rows.forEach(function (o) { if (o.ts !== null) { var k3 = Core.dayKey(o.ts, TZ); if (map[k3] !== undefined) map[k3]++; } });
    labelA = fmtKey(buckets[0]); labelB = fmtKey(buckets[buckets.length - 1]); buckets = buckets.map(function (k) { return map[k]; });
  }
  var mx = Math.max.apply(null, buckets.concat([1]));
  h += '<div class="wrap"><div class="card"><h3>' + (S.period === 'all' ? 'حسب الشهر' : 'حسب اليوم') + '</h3>' + (buckets.length ? '<div class="bars">' + buckets.map(function (v) { return '<i class="' + (v ? '' : 'z') + '" style="height:' + Math.max(2, Math.round(v / mx * 100)) + '%" title="' + v + '"></i>'; }).join('') + '</div><div class="axis"><span>' + labelA + '</span><span>' + labelB + '</span></div>' : '<div class="empty">لا توجد بيانات في هذه الفترة</div>') + '</div>';
  var tot = Math.max(1, t.high + t.medium + t.low);
  h += '<div class="card"><h3>درجة الخطورة</h3><div class="stack"><i style="width:' + t.high / tot * 100 + '%;background:var(--bad)"></i><i style="width:' + t.medium / tot * 100 + '%;background:var(--mid)"></i><i style="width:' + t.low / tot * 100 + '%;background:var(--good)"></i></div><div class="leg"><span><i class="sw" style="background:var(--bad)"></i>عالية <b class="num">' + nf(t.high) + '</b></span><span><i class="sw" style="background:var(--mid)"></i>متوسطة <b class="num">' + nf(t.medium) + '</b></span><span><i class="sw" style="background:var(--good)"></i>منخفضة <b class="num">' + nf(t.low) + '</b></span></div></div></div>';
  var tp = topList(countBy(rows, function (o) { return o.empId; }), 5).map(function (e) { return { p: S.byId[e[0]], n: e[1] }; }).filter(function (x) { return x.p; });
  h += '<div class="sec">أكثر الموظفين ملاحظات</div><div class="list">' + (tp.length ? peopleRows(tp, tp[0].n) : '<div class="empty">—</div>') + '</div>';
  var hz5 = topList(countBy(rows, function (o) { return hz(o); }), 6), hm = hz5.length ? hz5[0][1] : 1;
  h += '<div class="sec">أكثر أنواع الملاحظات</div><div class="wrap"><div class="card">' + hz5.map(function (x) { return '<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:13px"><span>' + esc(x[0]) + '</span><b class="num">' + nf(x[1]) + '</b></div><div class="meter"><i style="width:' + Math.round(x[1] / hm * 100) + '%"></i></div></div>'; }).join('') + '</div></div>';
  return topbar('لوحة السلامة', syncSub()) + chips() + h;
}
function teamRows() {
  var q = S.tq.trim().toLowerCase(), f = periodFrom();
  var arr = S.people.map(function (p) { var n = f === null ? p.rows.length : p.rows.filter(function (o) { return o.ts !== null && o.ts >= f; }).length; return { p: p, n: n }; })
    .filter(function (x) { return (S.showInactive || x.n > 0) && (!q || (x.p.name + ' ' + x.p.ids.join(' ')).toLowerCase().indexOf(q) >= 0); })
    .sort(function (a, b) { if (S.tsort === 'rem') { var ym = todayKey().slice(0, 7); return tinfo(b.p, ym).remaining - tinfo(a.p, ym).remaining || a.p.name.localeCompare(b.p.name, 'ar'); } return b.n - a.n || a.p.name.localeCompare(b.p.name, 'ar'); });
  return arr.length ? peopleRows(arr, Math.max(1, arr[0].n), true) : '<div class="empty">لا يوجد موظفين مطابقين</div>';
}
function vTeam() {
  return topbar('الموظفين', syncSub()) + chips() +
    '<div class="search">' + ico('search') + '<input id="tq" type="search" placeholder="ابحث بالاسم أو الرقم الوظيفي" value="' + esc(S.tq) + '" autocomplete="off"></div>' +
    '<div class="filters"><button class="chip' + (S.tsort === 'rem' ? ' on' : '') + '" data-act="tsort">الأكثر متبقي على التارقت</button><button class="chip' + (S.showInactive ? ' on' : '') + '" data-act="inactive">' + (S.showInactive ? 'إخفاء من لا ملاحظات له' : 'إظهار الجميع') + '</button></div><div class="list" id="lst">' + teamRows() + '</div>';
}

/* ---------- صفحة اليوم ---------- */
var DOWF = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
function dkey() { return S.day || todayKey(); }
function dowName(k) { return DOWF[new Date(Core.keyToUTC(k)).getUTCDay()]; }
function vDay() {
  var k = dkey(), tk = todayKey(), work = Core.isWorkDay(k), D = Core.DAILY_TARGET;
  var br = Core.dayBreakdown(S.rows, k, TZ), list = [];
  S.people.forEach(function (p) { var n = br.byEmp[p.id === '—' ? ''  : p.id] || 0; if (p.known || n > 0) list.push({ p: p, n: n }); });
  var total = br.rows.length, active = list.filter(function (x) { return x.n > 0; }).length, done = list.filter(function (x) { return x.n >= D; }).length, zero = list.filter(function (x) { return x.n === 0; }).length, low = list.filter(function (x) { return x.n > 0 && x.n < D; }).length;
  var f = S.dfilter;
  var shown = list.filter(function (x) { return f === 'all' || (f === 'done' && x.n >= D) || (f === 'low' && x.n > 0 && x.n < D) || (f === 'zero' && x.n === 0); }).sort(function (a, b) { return a.n - b.n || a.p.name.localeCompare(b.p.name, 'ar'); });
  if (f === 'all' || f === 'done') shown.reverse();
  var h = topbar('ملاحظات اليوم', syncSub()) +
    '<div class="daynav"><button class="ic dn" data-act="dday" data-v="1" aria-label="اليوم السابق">' + ico('back') + '</button><div class="dl"><b>' + dowName(k) + '</b><span class="num">' + fmtKey(k) + '</span>' + (k === tk ? '<em>اليوم</em>' : '') + '</div><button class="ic dn" data-act="dday" data-v="-1" aria-label="اليوم التالي"' + (k >= tk ? ' disabled' : '') + '>' + ico('next') + '</button></div>' +
    '<div class="daytools"><input type="date" id="dpick" value="' + k + '" max="' + tk + '"><button class="chip" data-act="dtoday">اليوم</button></div>' +
    (work ? '' : '<div class="offday">الجمعة إجازة — ما فيه تارقت يومي</div>') +
    '<div class="kpis"><div class="kpi" style="--c:var(--primary)"><div class="v num">' + nf(total) + '</div><div class="l">ملاحظات اليوم</div></div><div class="kpi" style="--c:var(--mid)"><div class="v num">' + nf(active) + '</div><div class="l">موظف رفع ملاحظات</div></div>' +
    (work ? '<div class="kpi" style="--c:var(--good)"><div class="v num">' + nf(done) + '</div><div class="l">حقق ' + D + ' فأكثر</div></div><div class="kpi" style="--c:var(--bad)"><div class="v num">' + nf(zero) + '</div><div class="l">ما رفع شي</div></div>' : '') + '</div>' +
    '<div class="chips" style="padding-top:2px">' + [['all', 'الكل (' + list.length + ')'], ['low', 'ناقص (' + low + ')'], ['done', 'مكتمل (' + done + ')'], ['zero', 'ما رفع (' + zero + ')']].map(function (c) { return '<button class="chip' + (f === c[0] ? ' on' : '') + '" data-act="dfilter" data-v="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>' +
    '<div class="list">' + (shown.length ? shown.map(function (x) {
      var p = x.p, pct = Math.min(100, Math.round(x.n / D * 100)), st = x.n >= D ? 'ok' : x.n > 0 ? 'near' : (work ? 'behind' : 'off');
      return '<button class="row2" data-act="empday" data-id="' + esc(p.id) + '" data-v="' + k + '">' + av(p) + '<div class="rw"><b>' + esc(p.name) + '</b><small class="num">' + esc(p.ids.join(' / ')) + '</small><div class="meter tgm ' + st + '"><i style="width:' + (x.n ? Math.max(4, pct) : 0) + '%"></i></div></div><div class="dcnt ' + st + '"><b class="num">' + x.n + '</b><span>من <span class="num">' + D + '</span></span></div></button>';
    }).join('') : '<div class="empty">لا يوجد موظفين في هذا التصنيف</div>') + '</div>' +
    '<div class="sec">ملاحظات ' + fmtKey(k) + ' (' + nf(total) + ')</div><div class="list">' + (total ? br.rows.sort(function (a, b) { return b.ts - a.ts; }).slice(0, S.shown).map(function (o) { return obsCard(o, true); }).join('') : '<div class="empty">لا توجد ملاحظات في هذا اليوم</div>') + '</div>' +
    (total > S.shown ? '<button class="btn ghost more" data-act="more">عرض المزيد</button>' : '');
  return h;
}
function feedRows() {
  var rows = inPeriod(S.rows), q = S.f.q.trim().toLowerCase();
  rows = rows.filter(function (o) {
    if (S.f.zone && o.zone !== S.f.zone) return false; if (S.f.kind && o.catKind !== S.f.kind) return false; if (S.f.risk && o.risk !== S.f.risk) return false;
    if (q) { var p = S.byId[o.empId || '—']; var hay = (o.row + ' ' + o.empId + ' ' + (p ? p.name : '') + ' ' + o.desc + ' ' + o.action + ' ' + o.hazard + ' ' + o.zone).toLowerCase(); if (hay.indexOf(q) < 0) return false; }
    return true;
  }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0) || b.row - a.row; });
  var shown = rows.slice(0, S.shown);
  return '<div class="mut" style="padding:0 16px 10px;font-size:12px">يعرض <b class="num">' + nf(shown.length) + '</b> من <b class="num">' + nf(rows.length) + '</b> ملاحظة</div><div class="list">' + (shown.length ? shown.map(function (o) { return obsCard(o, true); }).join('') : '<div class="empty">لا توجد ملاحظات</div>') + '</div>' + (rows.length > shown.length ? '<button class="btn ghost more" data-act="more">عرض المزيد</button>' : '');
}
function vFeed() {
  var zones = Object.keys(countBy(S.rows, function (o) { return o.zone; })).sort();
  function sel(id, cur, opts) { return '<select class="sel" id="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  return topbar('الملاحظات', syncSub()) + chips() +
    '<div class="search">' + ico('search') + '<input id="fq" type="search" placeholder="بحث: رقم السجل / وصف / موظف / منطقة" value="' + esc(S.f.q) + '" autocomplete="off"></div>' +
    '<div class="filters">' + sel('fz', S.f.zone, [['', 'كل المناطق']].concat(zones.map(function (z) { return [z, z]; }))) + sel('fk', S.f.kind, [['', 'كل الأنواع'], ['act', KIND.act], ['condition', KIND.condition], ['good', KIND.good]]) + sel('fr', S.f.risk, [['', 'كل الخطورة'], ['high', 'عالية'], ['medium', 'متوسطة'], ['low', 'منخفضة']]) + '</div><div id="lst">' + feedRows() + '</div>';
}
function vZones() {
  var rows = inPeriod(S.rows), m = {};
  rows.forEach(function (o) { var z = o.zone || 'بدون منطقة'; var e = m[z] = m[z] || { n: 0, act: 0, condition: 0, good: 0, other: 0, high: 0 }; e.n++; e[o.catKind || 'other']++; if (o.risk === 'high') e.high++; });
  var arr = Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1].n - a[1].n; }), mx = arr.length ? arr[0][1].n : 1;
  return topbar('المناطق', syncSub()) + chips() + '<div class="list">' + (arr.length ? arr.map(function (x) {
    var e = x[1]; return '<div class="row2" style="display:block"><div style="display:flex;justify-content:space-between"><b>' + esc(x[0]) + '</b><b class="num">' + nf(e.n) + '</b></div><div class="stack" style="margin:10px 0 6px;width:' + Math.max(8, Math.round(e.n / mx * 100)) + '%"><i style="width:' + e.act / e.n * 100 + '%;background:var(--bad)"></i><i style="width:' + e.condition / e.n * 100 + '%;background:var(--warn)"></i><i style="width:' + e.good / e.n * 100 + '%;background:var(--good)"></i><i style="width:' + e.other / e.n * 100 + '%;background:var(--acc2)"></i></div><small class="mut">تصرف ' + nf(e.act) + ' · ظرف ' + nf(e.condition) + ' · جيد ' + nf(e.good) + ' · خطورة عالية ' + nf(e.high) + '</small></div>';
  }).join('') : '<div class="empty">لا توجد بيانات</div>') + '</div>';
}

/* ---------- صحيفة الموظف ---------- */
function vEmp() {
  var p = S.byId[S.emp]; if (!p) return '';
  var rows = p.rows, dated = rows.filter(function (o) { return o.ts !== null; });
  var years = {}; dated.forEach(function (o) { var y = Core.dayKey(o.ts, TZ).slice(0, 4); years[y] = (years[y] || 0) + 1; });
  var ys = Object.keys(years).sort().reverse();
  if (!S.ey || !years[S.ey]) S.ey = ys[0] || null;
  var yRows = dated.filter(function (o) { return Core.dayKey(o.ts, TZ).slice(0, 4) === S.ey; });
  var days = {}; rows.forEach(function (o) { if (o.ts !== null) days[Core.dayKey(o.ts, TZ)] = 1; });
  var t = tally(rows), last = dated[0];
  var h = '<div class="page"><div class="ph"><button class="ic back" data-act="back" aria-label="رجوع">' + ico('back') + '</button><div class="who">' + av(p) + '<div><h2>' + esc(p.name) + '</h2><div class="ids"><span class="num">' + esc(p.ids.join(' / ')) + '</span>' + (p.known ? '' : ' · غير موجود في الدليل') + '</div></div></div>' +
    '<div class="sts"><div><b class="num">' + nf(rows.length) + '</b><span>الإجمالي</span></div><div><b class="num">' + nf(yRows.length) + '</b><span>' + (S.ey || '—') + '</span></div><div><b class="num">' + nf(Object.keys(days).length) + '</b><span>أيام نشاط</span></div><div><b class="num">' + nf(t.high) + '</b><span>خطورة عالية</span></div></div></div>';

  var tym = S.em ? S.ey + '-' + pad(S.em) : todayKey().slice(0, 7), ti = tinfo(p, tym), tdn = counts(p).d[todayKey()] || 0, isCur = tym === todayKey().slice(0, 7);
  var need = ti.remaining ? (ti.remainingDays > 0 ? Math.ceil(ti.remaining / ti.remainingDays) : ti.remaining) : 0;
  h += '<div class="wrap" style="margin-top:14px"><div class="card tgc ' + tclass(ti) + '"><h3>التارقت الشهري <small>' + monthLabel(tym) + '</small></h3>' +
    '<div class="tgbig"><div><span class="num big">' + nf(ti.remaining) + '</span><div class="mut">' + (ti.remaining ? 'ملاحظة باقية على التارقت' : (ti.over ? 'اكتمل التارقت وزيادة ' + nf(ti.over) : 'اكتمل التارقت')) + '</div></div><div class="pc num">' + ti.pct + '%</div></div>' +
    '<div class="meter tgm ' + tclass(ti) + '"><i style="width:' + Math.min(100, Math.max(2, ti.pct)) + '%"></i></div>' +
    '<div class="kvg"><div><b class="num">' + nf(ti.done) + '</b><span>المنجز</span></div><div><b class="num">' + nf(ti.target) + '</b><span>تارقت الشهر</span></div><div><b class="num">' + ti.workDays + '</b><span>أيام العمل</span></div>' +
    (isCur ? '<div><b class="num">' + nf(ti.expected) + '</b><span>المفروض لليوم</span></div><div><b class="num ' + (ti.diff >= 0 ? 'pos' : 'neg') + '">' + (ti.diff > 0 ? '+' : '') + nf(ti.diff) + '</b><span>' + (ti.diff >= 0 ? 'متقدم' : 'متأخر') + '</span></div><div><b class="num">' + tdn + ' / ' + ti.daily + '</b><span>اليوم</span></div>' : '<div><b class="num">' + nf(ti.expected) + '</b><span>المفروض</span></div><div><b class="num ' + (ti.diff >= 0 ? 'pos' : 'neg') + '">' + (ti.diff > 0 ? '+' : '') + nf(ti.diff) + '</b><span>' + (ti.diff >= 0 ? 'زيادة' : 'عجز') + '</span></div>') + '</div>' +
    (isCur && ti.remaining && ti.remainingDays > 0 ? '<p class="mut" style="margin:10px 0 0;font-size:13px">يحتاج <b class="num">' + need + '</b> ملاحظة يوميًا في <b class="num">' + ti.remainingDays + '</b> يوم عمل متبقي (بدون اليوم).</p>' : '') +
    '<p class="mut" style="margin:6px 0 0;font-size:12px">التارقت = ' + ti.daily + ' × أيام العمل (سبت–خميس). يتغيّر الشهر حسب الشهر المختار بالأسفل.</p></div></div>';
  if (!rows.length) return h + '<div class="empty">لا توجد ملاحظات لهذا الموظف</div></div>';
  h += '<div class="years">' + ys.map(function (y) { return '<button class="chip' + (S.ey === y ? ' on' : '') + '" data-act="ey" data-v="' + y + '">' + y + ' · ' + nf(years[y]) + '</button>'; }).join('') + '</div>';
  var mc = []; for (var i = 0; i < 12; i++) mc.push(0);
  yRows.forEach(function (o) { mc[+Core.dayKey(o.ts, TZ).slice(5, 7) - 1]++; });
  var mmx = Math.max.apply(null, mc.concat([1]));
  h += '<div class="wrap"><div class="card"><h3>الأشهر <small>' + (last ? 'آخر ملاحظة: ' + fmtDay(last.ts) : '') + '</small></h3><div class="months">' + mc.map(function (c, i) { return '<button class="mo' + (c ? '' : ' z') + (S.em === i + 1 ? ' on' : '') + '" data-act="em" data-v="' + (i + 1) + '"' + (c ? '' : ' disabled') + '><b class="num">' + nf(c) + '</b><small>' + MON[i] + '</small><i style="--p:' + (c / mmx).toFixed(2) + '"></i></button>'; }).join('') + '</div></div>';
  var list = yRows;
  if (S.em) {
    var mk = S.ey + '-' + pad(S.em), dc = {};
    yRows.forEach(function (o) { var k = Core.dayKey(o.ts, TZ); if (k.slice(0, 7) === mk) dc[k] = (dc[k] || 0) + 1; });
    var first = new Date(Date.UTC(+S.ey, S.em - 1, 1)).getUTCDay(), dim = new Date(Date.UTC(+S.ey, S.em, 0)).getUTCDate(), mxd = Math.max.apply(null, Object.keys(dc).map(function (k) { return dc[k]; }).concat([1]));
    var cells = DOW.map(function (d) { return '<div class="h">' + d + '</div>'; }).join('');
    for (i = 0; i < first; i++) cells += '<div class="cd e"></div>';
    for (var d = 1; d <= dim; d++) {
      var key = mk + '-' + pad(d), c = dc[key] || 0, lv = c ? Math.min(4, Math.ceil(c / mxd * 4)) : 0;
      cells += c ? '<button class="cd l' + lv + (S.ed === key ? ' on' : '') + '" data-act="ed" data-v="' + key + '"><span class="num">' + d + '</span><small class="num">' + c + '</small></button>' : '<div class="cd"><span class="num">' + d + '</span></div>';
    }
    h += '<div class="card"><h3>' + MON[S.em - 1] + ' ' + S.ey + (S.ed ? '<button class="chip" data-act="ed" data-v="">كل الشهر</button>' : '') + '</h3><div class="cal">' + cells + '</div></div>';
    list = yRows.filter(function (o) { var k = Core.dayKey(o.ts, TZ); return S.ed ? k === S.ed : k.slice(0, 7) === mk; });
  }
  h += '</div>';
  // قائمة مجمّعة باليوم
  var grp = {}, order = []; list.forEach(function (o) { var k = Core.dayKey(o.ts, TZ); if (!grp[k]) { grp[k] = []; order.push(k); } grp[k].push(o); });
  h += '<div class="sec">' + nf(list.length) + ' ملاحظة' + (S.em ? '' : ' في ' + (S.ey || '')) + '</div><div class="list" style="padding-bottom:40px">' + (order.length ? order.map(function (k) { return '<div class="daygrp"><b>' + fmtKey(k) + '</b><span class="num">' + grp[k].length + '</span></div>' + grp[k].map(function (o) { return obsCard(o, false); }).join(''); }).join('') : '<div class="empty">لا توجد ملاحظات</div>');
  var und = rows.filter(function (o) { return o.ts === null; });
  if (und.length) h += '<div class="daygrp"><b>بدون تاريخ</b><span class="num">' + und.length + '</span></div>' + und.map(function (o) { return obsCard(o, false); }).join('');
  return h + '</div></div>';
}

/* ---------- تفاصيل الملاحظة والصور ---------- */
function thumb(id) {
  if (thumbCache[id]) return thumbCache[id];
  return thumbCache[id] = api('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?fields=thumbnailLink,mimeType&supportsAllDrives=true').then(function (f) {
    if (!f.thumbnailLink) throw new Error('no-thumb');
    return f.thumbnailLink.replace(/=s\d+$/, '=s900');
  });
}
function figure(label, ids) {
  if (!ids.length) return '<figure><div class="nop">لا توجد صورة</div><figcaption>' + label + '</figcaption></figure>';
  return '<figure><img data-pid="' + esc(ids[0]) + '" alt="" loading="lazy"><figcaption>' + label + (ids.length > 1 ? ' · +' + (ids.length - 1) : '') + '</figcaption></figure>';
}
function vSheet() {
  var o = S.sheet; if (!o) return '';
  var p = S.byId[o.empId || '—'];
  function kv(k, v) { return v ? '<dt>' + k + '</dt><dd>' + esc(v) + '</dd>' : ''; }
  var ex = ''; if (o.extra) Object.keys(o.extra).forEach(function (k) { ex += kv(k, o.extra[k]); });
  return '<div class="shade" data-act="closesheet"></div><div class="sheet"><div class="grab"></div><span class="tag t-' + (o.catKind || 'other') + '">' + KIND[o.catKind || 'other'] + '</span>' + (o.risk ? '<span class="tag r-' + o.risk + '">' + RISK[o.risk] + '</span>' : '') +
    '<h3>' + esc(hz(o)) + '</h3><div class="mut" style="font-size:12px">سجل ' + o.row + (o.ts ? ' · ' + fmtDay(o.ts) + ' · ' + fmtTime(o.ts) : '') + '</div>' +
    '<div class="ph2">' + figure('قبل', o.before) + figure('بعد', o.after) + '</div><dl class="kv">' +
    kv('الموظف', p ? p.name : '') + kv('الرقم الوظيفي', o.empId) + kv('المنطقة', o.zone) + kv('الوردية', o.shift) + kv('المشروع', o.project) + kv('التصنيف', o.category) + kv('الوصف', o.desc) + kv('الإجراء التصحيحي', o.action) + ex + '</dl>' +
    (p ? '<button class="btn ghost sm" data-act="emp" data-id="' + esc(p.id) + '">صحيفة أعمال الموظف</button>' : '') + '</div>';
}
function hydratePhotos() {
  var imgs = document.querySelectorAll('img[data-pid]');
  Array.prototype.forEach.call(imgs, function (img) {
    if (img.dataset.done) return; img.dataset.done = '1';
    thumb(img.dataset.pid).then(function (u) { img.src = u; img.onclick = function () { S.lb = u; render(); }; img.onerror = function () { img.replaceWith(Object.assign(document.createElement('div'), { className: 'nop', textContent: 'تعذر عرض الصورة' })); }; })
      .catch(function () { img.replaceWith(Object.assign(document.createElement('div'), { className: 'nop', textContent: 'تعذر تحميل الصورة' })); });
  });
}
function vMenu() {
  var q = S.quality || {};
  return '<div class="shade" data-act="closemenu"></div><div class="sheet"><div class="grab"></div><h3>الإعدادات</h3><dl class="kv">' +
    '<dt>الملاحظات</dt><dd class="num">' + nf(S.rows.length) + '</dd><dt>الموظفين في الدليل</dt><dd class="num">' + nf(S.dirInfo ? S.dirInfo.count : 0) + (S.dirErr ? ' · لا صلاحية على ملف OBHD' : '') + '</dd>' +
    '<dt>صفوف بدون رقم وظيفي</dt><dd class="num">' + nf(q.noEmpId) + '</dd><dt>صفوف بدون تاريخ</dt><dd class="num">' + nf((q.missingDate || 0) + (q.invalidDate || 0)) + '</dd><dt>بدون صورة قبل</dt><dd class="num">' + nf(q.noBefore) + '</dd><dt>آخر تحديث</dt><dd>' + (S.syncedAt ? fmtDay(S.syncedAt) + ' ' + fmtTime(S.syncedAt) : '—') + '</dd></dl>' +
    '<p class="mut" style="font-size:12px">التطبيق للقراءة فقط ولا يعدّل أي شيت. نسخة من آخر بيانات تُحفظ على جوالك للعرض بدون إنترنت، وتُحذف عند تسجيل الخروج.</p>' +
    '<div style="display:flex;gap:10px"><button class="btn sm" data-act="refresh">تحديث الآن</button><button class="btn ghost sm" data-act="signout">تسجيل الخروج</button></div></div>';
}
function vLogin() {
  var cfgBad = /PUT_YOUR/.test(C.CLIENT_ID);
  return '<div class="login"><img src="icons/icon-512.png" alt=""><h1>HSE ملاحظات</h1><p>ملاحظات السلامة الميدانية لمبنى التوسعة. سجّل الدخول بحساب جوجل المصرّح له بالشيت.</p>' +
    (cfgBad ? '<div class="err">لم يتم ضبط Client ID بعد (config.js).</div>' : '<button class="btn" data-act="signin">' + (S.loading ? 'جاري التحميل…' : 'الدخول بحساب جوجل') + '</button>') +
    (S.error ? '<div class="err">' + esc(S.error) + '</div>' : '') + '<div class="note">قراءة فقط. لا يُكتب أي شيء في الشيت، ولا تُحفظ كلمة المرور.</div></div>';
}
function nav() {
  var items = [['home', ico('home'), 'الرئيسية'], ['day', ico('day'), 'اليوم'], ['team', ico('team'), 'الموظفين'], ['feed', ico('feed'), 'الملاحظات'], ['zones', ico('zones'), 'المناطق']];
  return '<div class="nav">' + items.map(function (i) { return '<button class="' + (S.view === i[0] ? 'on' : '') + '" data-act="nav" data-v="' + i[0] + '"><span class="i">' + i[1] + '</span>' + i[2] + '</button>'; }).join('') + '</div>';
}

/* ---------- العرض ---------- */
function render() {
  var pg = document.querySelector('.page'), ps = pg ? pg.scrollTop : 0, ws = window.scrollY, sh = document.querySelector('.sheet'), ss = sh ? sh.scrollTop : 0;
  var h;
  if (!S.signed && !S.rows.length) h = vLogin();
  else {
    h = (S.error ? '<div class="card" style="margin:12px 16px;border-color:var(--bad)"><b style="color:var(--bad)">' + esc(S.error) + '</b>' + (S.signed ? '' : '<br><button class="btn sm" style="margin-top:8px" data-act="signin">تسجيل الدخول</button>') + '</div>' : '');
    if (S.loading && !S.rows.length) h += '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    else h += S.view === 'home' ? vHome() : S.view === 'day' ? vDay() : S.view === 'team' ? vTeam() : S.view === 'feed' ? vFeed() : vZones();
    h += nav() + (S.emp ? vEmp() : '') + (S.sheet ? vSheet() : '') + (S.menu ? vMenu() : '');
  }
  if (S.lb) h += '<div class="lb" data-act="closelb"><img src="' + esc(S.lb) + '" alt=""></div>';
  if (S.toast) h += '<div class="toast">' + esc(S.toast) + '</div>';
  root.innerHTML = h;
  pg = document.querySelector('.page'); if (pg) pg.scrollTop = ps; if (!pg) window.scrollTo(0, ws); sh = document.querySelector('.sheet'); if (sh) sh.scrollTop = ss;
  animate(); hydratePhotos(); bindInputs();
}
function animate() {
  Array.prototype.forEach.call(document.querySelectorAll('[data-n]'), function (el, i) {
    var to = Number(el.dataset.n), key = el.className + i;
    if (lastNums[key] === to || to < 10) { lastNums[key] = to; return; }
    var from = lastNums[key] || 0, t0 = performance.now(); lastNums[key] = to;
    (function step(t) { var k = Math.min(1, (t - t0) / 650), e = 1 - Math.pow(1 - k, 3); el.textContent = nf(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(step); })(t0);
  });
}
function bindInputs() {
  var t = document.getElementById('tq'); if (t) t.oninput = function () { S.tq = this.value; document.getElementById('lst').innerHTML = teamRows(); };
  var dp = document.getElementById('dpick'); if (dp) dp.onchange = function () { if (this.value && this.value <= todayKey()) { S.day = this.value; S.shown = 40; render(); } };
  var f = document.getElementById('fq'); if (f) { var tm; f.oninput = function () { var v = this.value; clearTimeout(tm); tm = setTimeout(function () { S.f.q = v; S.shown = 40; document.getElementById('lst').innerHTML = feedRows(); }, 180); }; }
  [['fz', 'zone'], ['fk', 'kind'], ['fr', 'risk']].forEach(function (x) { var e = document.getElementById(x[0]); if (e) e.onchange = function () { S.f[x[1]] = this.value; S.shown = 40; render(); }; });
}

/* ---------- الأحداث والتنقل ---------- */
function push() { try { history.pushState({ o: 1 }, ''); } catch (e) {} }
window.addEventListener('popstate', function () { if (S.lb) S.lb = null; else if (S.sheet) S.sheet = null; else if (S.emp) { S.emp = null; S.em = null; S.ed = null; } render(); });
window.addEventListener('online', function () { S.offline = false; if (S.signed) load(); else render(); });
window.addEventListener('offline', function () { S.offline = true; render(); });
root.addEventListener('click', function (e) {
  var el = e.target.closest('[data-act]'); if (!el) return;
  var a = el.dataset.act, v = el.dataset.v;
  if (a === 'signin') return void signIn();
  if (a === 'refresh') { S.menu = false; if (S.token && Date.now() < S.exp || S.signed) { getToken(false).catch(function () { return getToken(true); }).then(load).catch(function (er) { S.error = er.message; render(); }); } else signIn(); return; }
  if (a === 'nav') { S.view = v; S.shown = 40; render(); window.scrollTo(0, 0); return; }
  if (a === 'period') { S.period = v; S.shown = 40; render(); return; }
  if (a === 'tsort') { S.tsort = S.tsort === 'rem' ? 'n' : 'rem'; render(); return; }
  if (a === 'dday') { var d0 = Core.addDays(dkey(), -v); if (d0 <= todayKey()) { S.day = d0; S.shown = 40; render(); } return; }
  if (a === 'dtoday') { S.day = null; S.shown = 40; render(); return; }
  if (a === 'dfilter') { S.dfilter = v; render(); return; }
  if (a === 'empday') { var id2 = el.dataset.id; if (!S.byId[id2]) return; push(); S.emp = id2; S.ey = v.slice(0, 4); S.em = +v.slice(5, 7); S.ed = counts(S.byId[id2]).d[v] ? v : null; render(); var pg2 = document.querySelector('.page'); if (pg2) pg2.scrollTop = 0; return; }
  if (a === 'inactive') { S.showInactive = !S.showInactive; render(); return; }
  if (a === 'more') { S.shown += 40; render(); return; }
  if (a === 'menu') { S.menu = true; push(); render(); return; }
  if (a === 'closemenu') { S.menu = false; render(); return; }
  if (a === 'signout') return void signOut();
  if (a === 'emp') { var id = el.dataset.id; if (!S.byId[id]) return; if (S.sheet) { S.sheet = null; } else push(); var first = !S.emp; S.emp = id; S.ey = null; S.em = null; S.ed = null; if (first) { } render(); var pg = document.querySelector('.page'); if (pg) pg.scrollTop = 0; return; }
  if (a === 'back') { history.back(); return; }
  if (a === 'ey') { S.ey = v; S.em = null; S.ed = null; render(); return; }
  if (a === 'em') { S.em = S.em === +v ? null : +v; S.ed = null; render(); return; }
  if (a === 'ed') { S.ed = v && S.ed !== v ? v : null; render(); return; }
  if (a === 'obs') { var r = +el.dataset.r; var o = S.rows.filter(function (x) { return x.row === r; })[0]; if (o) { S.sheet = o; push(); render(); } return; }
  if (a === 'closesheet') { history.back(); return; }
  if (a === 'closelb') { S.lb = null; render(); return; }
});

/* ---------- البدء ---------- */
if ('serviceWorker' in navigator) { try { navigator.serviceWorker.register('sw.js'); } catch (e) {} }
render();
kvGet('cache').then(function (c) {
  if (c && c.rows && c.rows.length) { restore(c); S.signed = flag(); render(); }
  if (flag() && navigator.onLine) { getToken(false).then(load).catch(function (e) { S.error = c ? 'تعرض نسخة محفوظة. سجّل الدخول للتحديث.' : e.message; S.signed = !!(c && c.rows); render(); }); }
});
window.__HSE__ = { S: S, process: process, render: render };
})();
