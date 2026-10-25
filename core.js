/**
 * Core.js — منطق نقي (بدون اعتماد على Apps Script أو المتصفح).
 * نفس الملف يُستخدم في: الـ Backend (Core.gs) + الواجهة (داخل Index.html) + اختبارات Node.
 */
var Core = (function () {
  'use strict';

  var DEFAULT_TZ = 180; // Asia/Riyadh = UTC+3 (دقائق)

  // ---------- أدوات عامة ----------
  function str(v) { return v === null || v === undefined ? '' : String(v).replace(/ /g, ' ').trim(); }
  function isEmptyRow(row) { for (var i = 0; i < row.length; i++) if (str(row[i]) !== '') return false; return true; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // ---------- التواريخ ----------
  // يقبل: Date | رقم تسلسلي | نص M-D-YYYY أو M/D/YYYY (+ وقت). إن كان اليوم > 12 يُفسَّر D-M.
  function parseTimestamp(v, tzMin) {
    tzMin = tzMin === undefined ? DEFAULT_TZ : tzMin;
    if (v === null || v === undefined || v === '') return null;
    if (Object.prototype.toString.call(v) === '[object Date]') {
      var t = v.getTime();
      return isNaN(t) ? null : t;
    }
    if (typeof v === 'number') {
      if (v > 20000 && v < 80000) return Math.round(Date.UTC(1899, 11, 30) + v * 86400000) - tzMin * 60000;
      return null;
    }
    var s = str(v);
    var m = /^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (!m) return null;
    var a = +m[1], b = +m[2], c = +m[3], y, mo, d;
    if (m[1].length === 4) { y = a; mo = b; d = c; }
    else { y = c; if (a > 12 && b <= 12) { d = a; mo = b; } else { mo = a; d = b; } }
    if (y < 100) y += 2000;
    if (y < 2020 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var h = m[4] ? +m[4] : 0, mi = m[5] ? +m[5] : 0, sec = m[6] ? +m[6] : 0;
    if (h > 23 || mi > 59 || sec > 59) return null;
    var ms = Date.UTC(y, mo - 1, d, h, mi, sec);
    var chk = new Date(ms);
    if (chk.getUTCMonth() !== mo - 1) return null; // 31 فبراير مثلًا
    return ms - tzMin * 60000;
  }
  function local(ts, tzMin) { return new Date(ts + (tzMin === undefined ? DEFAULT_TZ : tzMin) * 60000); }
  function dayKey(ts, tzMin) { var d = local(ts, tzMin); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function monthKey(ts, tzMin) { return dayKey(ts, tzMin).slice(0, 7); }
  function weekKey(ts, tzMin) { // بداية الأسبوع: الأحد
    var d = local(ts, tzMin);
    var back = d.getUTCDay();
    var s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back));
    return s.getUTCFullYear() + '-' + pad(s.getUTCMonth() + 1) + '-' + pad(s.getUTCDate());
  }
  function keyToUTC(k) { var p = k.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function addDays(k, n) { var d = new Date(keyToUTC(k) + n * 86400000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }

  // ---------- روابط الصور ----------
  function parsePhotoIds(cell) {
    var s = str(cell), ids = [], bad = 0;
    if (!s) return { ids: ids, bad: 0 };
    var parts = s.split(/[,\n،;]+/);
    for (var i = 0; i < parts.length; i++) {
      var p = str(parts[i]); if (!p) continue;
      var m = /[?&]id=([\w-]{10,})/.exec(p) || /\/d\/([\w-]{10,})/.exec(p) || /^([\w-]{25,})$/.exec(p);
      if (m) { if (ids.indexOf(m[1]) < 0) ids.push(m[1]); } else bad++;
    }
    return { ids: ids, bad: bad };
  }

  // ---------- ثنائي اللغة ----------
  function splitBilingual(s) {
    s = str(s); if (!s) return { ar: '', en: '' };
    var toks = s.split(/\s+/), ar = [], en = [];
    for (var i = 0; i < toks.length; i++) (/[؀-ۿ]/.test(toks[i]) ? ar : en).push(toks[i]);
    return { ar: ar.join(' ').trim(), en: en.join(' ').trim() };
  }

  // ---------- مطابقة الأعمدة (بالأسماء الفعلية للعناوين) ----------
  var FIELD_ORDER = ['timestamp', 'email', 'empId', 'project', 'zone', 'shift', 'category', 'hazard', 'before', 'risk', 'desc', 'after', 'action'];
  var DEFAULT_MATCHERS = {
    timestamp: '^timestamp|الطابع الزمني|تاريخ ووقت',
    email: 'e-?mail|البريد',
    empId: '^(id|employee ?id|emp ?id|الرقم الوظيفي)$',
    project: '^project|المشروع',
    zone: '^zone|المنطقة',
    shift: 'shift|الوردية',
    category: '^category|^الفئة',
    hazard: '^types|التصنيف',
    before: 'before|قبل التعديل|قبل المعالجة',
    after: 'after|بعد التعديل|بعد المعالجة',
    risk: 'risk|الخطورة',
    desc: 'description|وصف',
    action: 'corrective|الاجراء|الإجراء'
  };
  var REQUIRED = ['timestamp', 'empId'];

  function resolveColumns(headers, overrides) {
    var map = {}, claimed = {}, i, f;
    var matchers = {};
    for (f in DEFAULT_MATCHERS) matchers[f] = (overrides && overrides[f]) || DEFAULT_MATCHERS[f];
    for (var k = 0; k < FIELD_ORDER.length; k++) {
      f = FIELD_ORDER[k];
      var re = new RegExp(matchers[f], 'i');
      for (i = 0; i < headers.length; i++) {
        if (claimed[i]) continue;
        var h = str(headers[i]);
        if (h && re.test(h)) { map[f] = i; claimed[i] = true; break; }
      }
    }
    return { map: map, claimed: claimed };
  }
  function findHeaderRow(values, overrides) {
    var limit = Math.min(values.length, 15), best = -1, bestScore = 0;
    for (var r = 0; r < limit; r++) {
      var rc = resolveColumns(values[r] || [], overrides), sc = 0;
      for (var q = 0; q < REQUIRED.length; q++) if (rc.map[REQUIRED[q]] !== undefined) sc += 2;
      sc += Object.keys(rc.map).length;
      if (sc > bestScore) { bestScore = sc; best = r; }
    }
    if (best < 0) return -1;
    var chk = resolveColumns(values[best], overrides);
    for (var j = 0; j < REQUIRED.length; j++) if (chk.map[REQUIRED[j]] === undefined) return -1;
    return best;
  }

  // ---------- تطبيع القيم ----------
  function riskKey(s) { s = str(s).toLowerCase(); if (!s) return ''; if (/high|عالي/.test(s)) return 'high'; if (/medium|متوسط/.test(s)) return 'medium'; if (/low|منخفض/.test(s)) return 'low'; return 'other'; }
  function catKind(s) { s = str(s).toLowerCase(); if (!s) return ''; if (/unsafe act|تصرف غير/.test(s)) return 'act'; if (/unsafe condition|ظروف غير/.test(s)) return 'condition'; if (/good practice|تصرف جيد/.test(s)) return 'good'; return 'other'; }
  function zoneLabel(s) {
    s = str(s).replace(/\s+/g, ' '); if (!s) return '';
    if (/^\d+$/.test(s)) return 'Zone ' + s;
    return s;
  }

  /**
   * values: مصفوفة ثنائية الأبعاد للورقة كاملة (تتضمن صف العناوين)
   * directory: {id: {id,name,dept}}
   */
  function normalize(values, opts) {
    opts = opts || {};
    var tz = opts.tzMin === undefined ? DEFAULT_TZ : opts.tzMin;
    var hr = findHeaderRow(values, opts.matchers);
    if (hr < 0) {
      var e = new Error('تعذر العثور على صف العناوين: لم تُوجد الأعمدة المطلوبة (Timestamp / ID). تحقّق من اسم الورقة ومن إعداد FIELD_MATCHERS.');
      e.code = 'NO_HEADER'; throw e;
    }
    var headers = values[hr], rc = resolveColumns(headers, opts.matchers), M = rc.map;
    var extraCols = [];
    for (var c = 0; c < headers.length; c++) if (!rc.claimed[c] && str(headers[c])) extraCols.push(c);
    var rows = [], seen = {}, zoneSeen = {};
    var q = { rawRows: 0, emptySkipped: 0, duplicatesSkipped: 0, invalidDate: 0, missingDate: 0, noBefore: 0, noAfter: 0, multiBefore: 0, multiAfter: 0, badLinks: 0, noEmpId: 0, withAction: 0, withDesc: 0 };
    function cell(r, f) { return M[f] === undefined ? '' : r[M[f]]; }
    for (var i = hr + 1; i < values.length; i++) {
      var r = values[i] || []; q.rawRows++;
      if (isEmptyRow(r)) { q.emptySkipped++; continue; }
      var rawTs = cell(r, 'timestamp');
      var ts = parseTimestamp(rawTs, tz);
      var email = str(cell(r, 'email')), empId = str(cell(r, 'empId'));
      var b = parsePhotoIds(cell(r, 'before')), a = parsePhotoIds(cell(r, 'after'));
      var cat = str(cell(r, 'category')), haz = str(cell(r, 'hazard'));
      // صف لا يحمل أي عنصر دال على ملاحظة لا يُحتسب
      if (ts === null && !empId && !email && !cat && !haz && !b.ids.length) { q.emptySkipped++; continue; }
      var key = b.ids.length ? 'p:' + b.ids[0] : 'r:' + (i + 1);
      if (seen[key]) { q.duplicatesSkipped++; continue; }
      seen[key] = true;
      if (ts === null) { if (str(rawTs) === '') q.missingDate++; else q.invalidDate++; }
      if (!empId) q.noEmpId++;
      if (!b.ids.length) q.noBefore++; else if (b.ids.length > 1) q.multiBefore++;
      if (!a.ids.length) q.noAfter++; else if (a.ids.length > 1) q.multiAfter++;
      q.badLinks += b.bad + a.bad;
      var zl = zoneLabel(cell(r, 'zone')), zk = zl.toLowerCase();
      if (zl) { if (!zoneSeen[zk]) zoneSeen[zk] = zl; zl = zoneSeen[zk]; }
      var action = str(cell(r, 'action')), desc = str(cell(r, 'desc'));
      if (action) q.withAction++; if (desc) q.withDesc++;
      var extra = null;
      for (var x = 0; x < extraCols.length; x++) {
        var ev = str(r[extraCols[x]]);
        if (ev !== '') { extra = extra || {}; extra[str(headers[extraCols[x]])] = ev; }
      }
      rows.push({
        row: i + 1, key: key, ts: ts, empId: empId, email: email,
        project: str(cell(r, 'project')), zone: zl, shift: str(cell(r, 'shift')),
        category: cat, catKind: catKind(cat), hazard: haz, risk: riskKey(cell(r, 'risk')), riskRaw: str(cell(r, 'risk')),
        before: b.ids, after: a.ids, desc: desc, action: action,
        extra: extra
      });
    }
    var mapping = [];
    for (var f = 0; f < FIELD_ORDER.length; f++) {
      var fn = FIELD_ORDER[f];
      mapping.push({ field: fn, header: M[fn] !== undefined ? str(headers[M[fn]]) : null, column: M[fn] !== undefined ? colLetter(M[fn]) : null, required: REQUIRED.indexOf(fn) >= 0 });
    }
    var extras = extraCols.map(function (ci) { return { header: str(headers[ci]), column: colLetter(ci) }; });
    return {
      rows: rows, headerRow: hr + 1, mapping: mapping, extraColumns: extras, quality: q
    };
  }
  function colLetter(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

  // ---------- دليل الموظفين (Sheet2) ----------
  function parseDirectory(values) {
    var dir = {}, hr = -1, cId = -1, cName = -1, cDept = -1, i, j;
    for (i = 0; i < Math.min(values.length, 30); i++) {
      var r = values[i] || [], id = -1, nm = -1, dp = -1;
      for (j = 0; j < r.length; j++) {
        var h = str(r[j]);
        if (/^(id|employee ?id|الرقم الوظيفي)$/i.test(h)) id = j;
        else if (/^(name|الاسم|اسم الموظف)$/i.test(h)) nm = j;
        else if (/^(dept|department|القسم)/i.test(h)) dp = j;
      }
      if (id >= 0 && nm >= 0) { hr = i; cId = id; cName = nm; cDept = dp; break; }
    }
    if (hr < 0) return { dir: dir, found: false, count: 0 };
    var n = 0;
    for (i = hr + 1; i < values.length; i++) {
      var rr = values[i] || [], eidRaw = str(rr[cId]);
      if (!eidRaw) continue;
      var nameV = str(rr[cName]); if (!nameV) continue;
      // خلية الرقم قد تحمل أكثر من رقم لنفس الشخص (قديم/جديد) مفصولة بـ / أو , أو ، أو ;
      var eids = eidRaw.split(/[\/,،;\n]+/).map(function (x) { return str(x); }).filter(Boolean);
      var canon = eids[0], dept = cDept >= 0 ? str(rr[cDept]) : '';
      if (!dir[canon]) n++;
      for (var k = 0; k < eids.length; k++) dir[eids[k]] = { id: canon, name: nameV, dept: dept, ids: eids };
    }
    return { dir: dir, found: true, count: n };
  }

  // ---------- التجميع للنقل (ضغط الحقول المتكررة) ----------
  function pack(norm, dir, meta) {
    var dict = { emp: [], email: [], category: [], hazard: [], risk: [], shift: [], zone: [], project: [] }, idx = {};
    for (var k in dict) idx[k] = {};
    function di(k, v) { if (v === '' || v === null || v === undefined) return -1; var m = idx[k]; if (m[v] === undefined) { m[v] = dict[k].length; dict[k].push(v); } return m[v]; }
    var rows = [];
    for (var i = 0; i < norm.rows.length; i++) {
      var o = norm.rows[i];
      rows.push([o.row, o.ts, di('emp', o.empId), di('email', o.email), di('category', o.category), di('hazard', o.hazard), di('risk', o.riskRaw),
        di('shift', o.shift), di('zone', o.zone), di('project', o.project), o.before.join(','), o.after.join(','), o.desc, o.action, o.extra, o.key]);
    }
    return { v: 2, dict: dict, rows: rows, directory: dir, meta: meta };
  }
  function unpack(p) {
    var d = p.dict, out = [];
    function g(k, i) { return i < 0 || i === null ? '' : d[k][i]; }
    for (var i = 0; i < p.rows.length; i++) {
      var r = p.rows[i], riskRaw = g('risk', r[6]), cat = g('category', r[4]);
      out.push({
        row: r[0], ts: r[1], empId: g('emp', r[2]), email: g('email', r[3]), category: cat, catKind: catKind(cat), hazard: g('hazard', r[5]),
        risk: riskKey(riskRaw), riskRaw: riskRaw, shift: g('shift', r[7]), zone: g('zone', r[8]), project: g('project', r[9]),
        before: r[10] ? r[10].split(',') : [], after: r[11] ? r[11].split(',') : [], desc: r[12], action: r[13], extra: r[14], key: r[15]
      });
    }
    return out;
  }

  // ---------- الفترات والفلاتر ----------
  function periodRange(preset, now, tzMin) {
    var today = dayKey(now, tzMin);
    if (preset === 'today') return { from: today, to: today };
    if (preset === 'last7') return { from: addDays(today, -6), to: today };
    if (preset === 'last30') return { from: addDays(today, -29), to: today };
    if (preset === 'month') return { from: today.slice(0, 7) + '-01', to: today };
    return { from: '', to: '' };
  }
  // يوحّد أرقام الشخص الواحد تحت الرقم الأول في الدليل (قراءة فقط، لا يلمس الشيت)
  function applyAliases(rows, dir) {
    var merged = 0;
    for (var i = 0; i < rows.length; i++) {
      var e = rows[i].empId, d = e && dir && dir[e];
      if (d && d.id && d.id !== e) { rows[i].empId = d.id; merged++; }
    }
    return merged;
  }
  function empName(ctx, id) { var e = ctx && ctx.emp && ctx.emp[id]; return e && e.name ? e.name : ''; }
  function applyFilters(rows, f, ctx) {
    f = f || {}; ctx = ctx || {}; var tz = ctx.tzMin === undefined ? DEFAULT_TZ : ctx.tzMin;
    var q = str(f.q).toLowerCase(), out = [];
    for (var i = 0; i < rows.length; i++) {
      var o = rows[i];
      if (f.from || f.to) {
        if (o.ts === null) continue;
        var dk = dayKey(o.ts, tz);
        if (f.from && dk < f.from) continue;
        if (f.to && dk > f.to) continue;
      }
      if (f.emp && o.empId !== f.emp) continue;
      if (f.zone && o.zone !== f.zone) continue;
      if (f.catKind && o.catKind !== f.catKind) continue;
      if (f.hazard && o.hazard !== f.hazard) continue;
      if (f.risk && o.risk !== f.risk) continue;
      if (f.shift && o.shift !== f.shift) continue;
      if (q) {
        var hay = (o.row + ' ' + o.empId + ' ' + empName(ctx, o.empId) + ' ' + o.email + ' ' + o.desc + ' ' + o.action + ' ' + o.hazard + ' ' + o.zone + ' ' + o.category).toLowerCase();
        if (hay.indexOf(q) < 0) continue;
      }
      out.push(o);
    }
    return out;
  }
  function filterOptions(rows, ctx) {
    var sets = { emp: {}, zone: {}, hazard: {}, shift: {}, category: {}, risk: {} }, i;
    for (i = 0; i < rows.length; i++) {
      var o = rows[i];
      if (o.empId) sets.emp[o.empId] = (sets.emp[o.empId] || 0) + 1;
      if (o.zone) sets.zone[o.zone] = (sets.zone[o.zone] || 0) + 1;
      if (o.hazard) sets.hazard[o.hazard] = (sets.hazard[o.hazard] || 0) + 1;
      if (o.shift) sets.shift[o.shift] = (sets.shift[o.shift] || 0) + 1;
      if (o.catKind) sets.category[o.catKind] = (sets.category[o.catKind] || 0) + 1;
      if (o.risk) sets.risk[o.risk] = (sets.risk[o.risk] || 0) + 1;
    }
    function arr(m) { return Object.keys(m).map(function (k) { return { value: k, count: m[k] }; }).sort(function (a, b) { return b.count - a.count; }); }
    var emps = arr(sets.emp).map(function (e) { e.name = empName(ctx, e.value); return e; });
    return { emp: emps, zone: arr(sets.zone), hazard: arr(sets.hazard), shift: arr(sets.shift), category: arr(sets.category), risk: arr(sets.risk) };
  }

  // ---------- الإحصاءات ----------
  function inc(m, k, n) { m[k] = (m[k] || 0) + (n === undefined ? 1 : n); }
  function computeStats(rows, ctx) {
    ctx = ctx || {}; var tz = ctx.tzMin === undefined ? DEFAULT_TZ : ctx.tzMin, now = ctx.now || Date.now();
    var today = dayKey(now, tz), d7 = addDays(today, -6);
    var s = {
      total: rows.length, category: { act: 0, condition: 0, good: 0, other: 0 }, risk: { high: 0, medium: 0, low: 0, other: 0, none: 0 },
      today: 0, last7: 0, withAction: 0, withAfter: 0, withBefore: 0, noDate: 0, employees: 0,
      byDay: {}, byWeek: {}, byMonth: {}, byEmp: {}, byZone: {}, byHazard: {}, byShift: {}, zoneRisk: {}
    };
    var emps = {};
    for (var i = 0; i < rows.length; i++) {
      var o = rows[i];
      s.category[o.catKind || 'other']++;
      s.risk[o.risk || 'none'] = (s.risk[o.risk || 'none'] || 0) + 1;
      if (o.action) s.withAction++;
      if (o.after.length) s.withAfter++;
      if (o.before.length) s.withBefore++;
      if (o.empId) emps[o.empId] = 1;
      inc(s.byEmp, o.empId || '');
      inc(s.byZone, o.zone || '');
      inc(s.byHazard, o.hazard || '');
      inc(s.byShift, o.shift || '');
      var zr = s.zoneRisk[o.zone || ''] || (s.zoneRisk[o.zone || ''] = { high: 0, medium: 0, low: 0, other: 0, none: 0, total: 0 });
      zr[o.risk || 'none']++; zr.total++;
      if (o.ts === null) { s.noDate++; continue; }
      var dk = dayKey(o.ts, tz);
      inc(s.byDay, dk); inc(s.byWeek, weekKey(o.ts, tz)); inc(s.byMonth, dk.slice(0, 7));
      if (dk === today) s.today++;
      if (dk >= d7 && dk <= today) s.last7++;
    }
    s.employees = Object.keys(emps).length;
    return s;
  }
  function fillDays(map) {
    var keys = Object.keys(map).sort(); if (!keys.length) return [];
    var out = [], k = keys[0], end = keys[keys.length - 1], guard = 0;
    while (k <= end && guard++ < 4000) { out.push({ k: k, n: map[k] || 0 }); k = addDays(k, 1); }
    return out;
  }
  function sortedSeries(map) { return Object.keys(map).sort().map(function (k) { return { k: k, n: map[k] }; }); }
  function topN(map, n, nameFn) {
    return Object.keys(map).map(function (k) { return { k: k, n: map[k], name: nameFn ? nameFn(k) : k }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, n);
  }

  function computeEmployeeStats(allRows, periodRows, ctx) {
    ctx = ctx || {}; var dir = ctx.emp || {}, by = {}, id;
    function slot(id) {
      return by[id] || (by[id] = { id: id, name: (dir[id] && dir[id].name) || '', dept: (dir[id] && dir[id].dept) || '', inDirectory: !!dir[id], total: 0, period: 0, withAction: 0, withAfter: 0, high: 0, medium: 0, low: 0, act: 0, condition: 0, good: 0, last: null, firstTs: null, days: {} });
    }
    var i, o, e;
    for (id in dir) slot(id);
    for (i = 0; i < allRows.length; i++) { o = allRows[i]; e = slot(o.empId || ''); e.total++; }
    for (i = 0; i < periodRows.length; i++) {
      o = periodRows[i]; e = slot(o.empId || '');
      e.period++;
      if (o.action) e.withAction++;
      if (o.after.length) e.withAfter++;
      if (o.risk === 'high') e.high++; else if (o.risk === 'medium') e.medium++; else if (o.risk === 'low') e.low++;
      if (o.catKind === 'act') e.act++; else if (o.catKind === 'condition') e.condition++; else if (o.catKind === 'good') e.good++;
      if (o.ts !== null) { if (e.last === null || o.ts > e.last) e.last = o.ts; e.days[dayKey(o.ts, ctx.tzMin)] = 1; }
    }
    var out = [];
    for (id in by) { e = by[id]; e.activeDays = Object.keys(e.days).length; delete e.days; out.push(e); }
    return out;
  }

  // ---------- CSV ----------
  function csvCell(v) { v = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows, ctx) {
    ctx = ctx || {}; var tz = ctx.tzMin === undefined ? DEFAULT_TZ : ctx.tzMin;
    var head = ['Row', 'DateTime', 'EmployeeID', 'EmployeeName', 'Email', 'Project', 'Zone', 'Shift', 'Category', 'Type', 'Risk', 'Description', 'CorrectiveAction', 'BeforePhotos', 'AfterPhotos'];
    var lines = [head.join(',')];
    for (var i = 0; i < rows.length; i++) {
      var o = rows[i], dt = '';
      if (o.ts !== null) { var d = local(o.ts, tz); dt = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()); }
      var link = function (ids) { return ids.map(function (x) { return 'https://drive.google.com/open?id=' + x; }).join(' | '); };
      lines.push([o.row, dt, o.empId, empName(ctx, o.empId), o.email, o.project, o.zone, o.shift, o.category, o.hazard, o.riskRaw, o.desc, o.action, link(o.before), link(o.after)].map(csvCell).join(','));
    }
    return lines.join('\r\n');
  }

  /* ---------- التارقت: أيام العمل سبت-خميس والجمعة إجازة ---------- */
  var DAILY_TARGET = 20;
  function isWorkDay(k) { return new Date(keyToUTC(k)).getUTCDay() !== 5; }
  function monthDays(ym) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function workDaysInMonth(ym, upToKey) { // عدد أيام العمل في الشهر (حتى تاريخ اختياري ضمنه)
    var n = 0, dim = monthDays(ym);
    for (var d = 1; d <= dim; d++) { var k = ym + '-' + pad(d); if (upToKey && k > upToKey) break; if (isWorkDay(k)) n++; }
    return n;
  }
  function targetInfo(done, ym, todayKey, daily) {
    daily = daily || DAILY_TARGET;
    var wd = workDaysInMonth(ym), cur = todayKey ? todayKey.slice(0, 7) : '';
    var el = !todayKey || ym < cur ? wd : ym > cur ? 0 : workDaysInMonth(ym, todayKey);
    var target = wd * daily, expected = el * daily;
    return { daily: daily, workDays: wd, elapsed: el, remainingDays: wd - el, target: target, done: done, remaining: Math.max(0, target - done), over: Math.max(0, done - target),
      expected: expected, diff: done - expected, pct: target ? Math.round(done / target * 100) : 0 };
  }
  function dayBreakdown(rows, key, tzMin) { // عدد ملاحظات كل موظف في يوم معيّن
    var by = {}, list = [];
    for (var i = 0; i < rows.length; i++) { var o = rows[i]; if (o.ts !== null && dayKey(o.ts, tzMin) === key) { list.push(o); inc(by, o.empId || ''); } }
    return { byEmp: by, rows: list };
  }

  var api = {
    isWorkDay: isWorkDay, workDaysInMonth: workDaysInMonth, targetInfo: targetInfo, dayBreakdown: dayBreakdown, DAILY_TARGET: DAILY_TARGET,
    parseTimestamp: parseTimestamp, dayKey: dayKey, weekKey: weekKey, monthKey: monthKey, addDays: addDays, keyToUTC: keyToUTC,
    parsePhotoIds: parsePhotoIds, splitBilingual: splitBilingual,
    resolveColumns: resolveColumns, findHeaderRow: findHeaderRow, normalize: normalize, parseDirectory: parseDirectory, applyAliases: applyAliases,
    pack: pack, unpack: unpack, periodRange: periodRange, applyFilters: applyFilters, filterOptions: filterOptions,
    computeStats: computeStats, computeEmployeeStats: computeEmployeeStats, fillDays: fillDays, sortedSeries: sortedSeries, topN: topN,
    toCSV: toCSV, riskKey: riskKey, catKind: catKind, empName: empName, DEFAULT_TZ: DEFAULT_TZ, FIELD_ORDER: FIELD_ORDER, REQUIRED: REQUIRED
  };
  return api;
})();
if (typeof module !== 'undefined' && module.exports) { module.exports = Core; }
