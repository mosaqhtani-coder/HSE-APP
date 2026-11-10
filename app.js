/* تطبيق تصاريح العمل (PWA مستقل). يكلّم بوابة JSON (Api.gs) على نفس Apps Script، فالبيانات والحسابات مشتركة مع الموقع. */
(function () {
  'use strict';

  var APP_VERSION = '1.16';
  var root = document.getElementById('root');

  // ======================= أدوات عامة =======================
  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else if (c.nodeType) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function ltr(s) { var b = document.createElement('bdi'); b.setAttribute('dir', 'ltr'); b.textContent = s === null || s === undefined ? '' : String(s); return b; }

  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  var ICONS = {
    home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    site: '<path d="M9 3h6l1 2h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3z"/><path d="M8.5 13l2.5 2.5L16 10"/>',
    photos: '<path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.8"/>',
    dash: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    me: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    back: '<path d="M9 5l7 7-7 7"/>',
    next: '<path d="M15 5l-7 7 7 7"/>',
    open: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M5 12h14"/>',
    gallery: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    meet: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 6a3 3 0 0 1 0 6M18 14.5c1.8.7 3 2.4 3 5.5"/>',
    report: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
    obs: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
    find: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
    print: '<path d="M7 8V3h10v5"/><rect x="4" y="8" width="16" height="9" rx="2"/><path d="M7 14h10v7H7z"/>'
  };
  function icon(name) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name] || '';
    return s;
  }

  var toastTimer = null;
  function toast(text) {
    var old = document.querySelector('.toast'); if (old) old.remove();
    var t = h('div', { class: 'toast', text: text });
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, 2600);
  }

  function safeUrl(u) {
    u = String(u || '').trim();
    return /^https:\/\/(drive|docs)\.google\.com\//i.test(u) ? u : '';
  }
  function extractUrls(s) { return (String(s || '').match(/https?:\/\/[^\s,،]+/g) || []).map(safeUrl).filter(Boolean); }

  var MONTHS = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  // ======================= الاتصال بالخادم =======================
  var S = { user: null, token: lsGet('ptw_token') };

  function apiBase() {
    var cfg = (window.PTW_CONFIG && window.PTW_CONFIG.API_URL) || '';
    return String(cfg || lsGet('ptw_api_url') || '').trim();
  }
  var URL_RE = /^https:\/\/script\.google\.com\/(a\/(macros\/)?[^\/]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec$/;
  function validApiUrl(u) { return URL_RE.test(String(u || '').trim()); }

  function rpc(fn, args, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 90000) : null;
    return fetch(apiBase() + '?api=1', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fn, args: args || [] }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) { return r.text(); }).then(function (txt) {
      try { return JSON.parse(txt); } catch (e) {
        return { ok: false, code: 'BAD', message: 'رد غير مفهوم من الخادم. تأكد إن نسخة Apps Script المنشورة v2.39 أو أحدث.' };
      }
    }).catch(function (e) {
      return { ok: false, code: 'NET', message: (e && e.name === 'AbortError') ? 'انتهت مهلة الاتصال. حاول مرة ثانية.' : 'تعذر الاتصال بالخادم. تأكد من الإنترنت وحاول مرة ثانية.' };
    }).then(function (res) { if (timer) clearTimeout(timer); return res; });
  }

  /** نداء دالة محمية: التوكن يروح كأول معامل. انتهاء الجلسة يرجّع لشاشة الدخول */
  function call(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    return rpc(fn, [S.token].concat(args), (fn.indexOf('upload') === 0 || fn === 'saveMeeting') ? 180000 : 90000).then(function (res) {
      if (res && res.ok === false && res.code === 'AUTH') { sessionLost('انتهت جلستك، سجّل دخولك من جديد.'); }
      return res;
    });
  }

  // كاش القراءة (stale-while-revalidate): نعرض آخر نتيجة محفوظة فورًا ونحدّثها من الخادم بالخلفية.
  // مربوط بالجلسة (آخر 12 حرف من التوكن) ويُمسح عند الخروج. للصفحات القرائية فقط، مو للعمليات.
  var RC_P = 'ptw_rc:';
  function rcTok() { return String(S.token || '').slice(-12); }
  function rcGet(k) {
    try { var o = JSON.parse(lsGet(k) || 'null'); return (o && o.res && o.u === rcTok()) ? o : null; } catch (e) { return null; }
  }
  function rcSet(k, res) {
    var txt = ''; try { txt = JSON.stringify({ u: rcTok(), t: Date.now(), res: res }); } catch (e) { return; }
    if (txt.length > 250000) return; // ما نثقّل التخزين
    lsSet(k, txt);
  }
  function rcPurge() {
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(RC_P) === 0) localStorage.removeItem(k); }); } catch (e) {}
  }
  /** cb(res, fromCache). لو فيه نسخة محفوظة تنادي cb فورًا بها ثم تنادي cb بالنتيجة الحديثة. maxAgeMs: لو النسخة أحدث من هذا ما نعيد الجلب. */
  function swr(fn, args, cb, maxAgeMs) {
    var k = RC_P + fn + ':' + JSON.stringify(args || []);
    var c = rcGet(k);
    if (c) { cb(c.res, true); if (maxAgeMs && Date.now() - c.t < maxAgeMs) return Promise.resolve(c.res); }
    return call.apply(null, [fn].concat(args || [])).then(function (res) {
      if (res && res.ok) rcSet(k, res);
      cb(res, false);
      return res;
    });
  }

  function rcDrop(fn) {
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(RC_P + fn + ':') === 0) localStorage.removeItem(k); }); } catch (e) {}
  }
  /** بعد أي فتح/إغلاق ناجح: القوائم والأرقام المحفوظة صارت قديمة */
  function opsChanged() { rcDrop('getMyOpenToday'); rcDrop('getMyOpenedPermits'); rcDrop('getMyPageStats'); }

  function sessionLost(msg) {
    S.token = ''; S.user = null; lsDel('ptw_token'); lsDel('ptw_user'); rcPurge();
    renderAuth(msg || '');
  }

  // ======================= الصور والملفات =======================
  var MAX_FILE = 20 * 1024 * 1024;
  function isHeic(f) { var t = (f.type || '').toLowerCase(); return t === 'image/heic' || t === 'image/heif' || /\.(heic|heif)$/i.test(f.name || ''); }
  function isImage(f) { return /^image\//i.test(f.type || '') || isHeic(f); }

  var heicPromise = null;
  function loadHeic() {
    if (window.heic2any) return Promise.resolve();
    if (heicPromise) return heicPromise;
    heicPromise = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
      s.onload = res; s.onerror = function () { heicPromise = null; rej(new Error('تعذر تحميل محوّل صور HEIC.')); };
      document.head.appendChild(s);
    });
    return heicPromise;
  }
  function readB64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = function () { reject(new Error('تعذر قراءة الملف.')); };
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.readAsDataURL(blob);
    });
  }
  function loadImg(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('تعذر قراءة الصورة. جرّب JPG أو PNG.')); };
      img.src = url;
    });
  }
  function compress(file) {
    var prep = Promise.resolve(file);
    if (isHeic(file)) {
      prep = loadHeic().then(function () { return window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 }); })
        .then(function (o) { return Array.isArray(o) ? o[0] : o; })
        .catch(function () { throw new Error('تعذر تحويل صورة HEIC. جرّب تحفظها JPG من إعدادات الكاميرا.'); });
    }
    return prep.then(function (f) {
      var bmpP = (window.createImageBitmap) ? createImageBitmap(f, { imageOrientation: 'from-image' }).catch(function () { return null; }) : Promise.resolve(null);
      return bmpP.then(function (bmp) {
        return bmp ? bmp : loadImg(f);
      });
    }).then(function (src) {
      var w = src.width || src.naturalWidth, hh = src.height || src.naturalHeight, max = 1600;
      if (w > max || hh > max) { if (w > hh) { hh = Math.round(hh * max / w); w = max; } else { w = Math.round(w * max / hh); hh = max; } }
      var cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
      cv.getContext('2d').drawImage(src, 0, 0, w, hh);
      if (src.close) { try { src.close(); } catch (e) {} }
      return cv.toDataURL('image/jpeg', 0.72).split(',')[1];
    });
  }
  /** ملف -> {data, mime, name}. الصور تُضغط، غيرها (PDF/فيديو) يُرفع كما هو */
  function filePayload(file) {
    if (file.size > MAX_FILE) return Promise.reject(new Error('حجم الملف "' + file.name + '" كبير جداً (أقصى 20 ميجا).'));
    if (isImage(file)) return compress(file).then(function (b64) { return { data: b64, mime: 'image/jpeg', name: file.name }; });
    return readB64(file).then(function (b64) { return { data: b64, mime: file.type || 'application/octet-stream', name: file.name }; });
  }

  // ======================= الهيكل العام =======================
  var NAV = [
    { key: 'home', label: 'الرئيسية', icon: 'home', perm: 'any' },
    { key: 'dash', label: 'اللوحة', icon: 'dash', perm: 'dashboard' },
    { key: 'site', label: 'تسجيل', icon: 'site', perm: 'site' },
    { key: 'photos', label: 'الصور', icon: 'photos', perm: 'site' },
    { key: 'me', label: 'صفحتي', icon: 'me', perm: 'mypage' }
  ];
  function has(p) { return p === 'any' || !!(S.user && S.user.perms && S.user.perms.indexOf(p) > -1); }

  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; });

  function shell(active, title, content) {
    clear(root);
    var top = h('div', { class: 'topbar' },
      h('h1', { text: title }),
      h('button', { class: 'icon-btn', 'aria-label': 'القائمة', onclick: openMenu }, icon('menu')));
    var nav = h('nav', { class: 'nav' }, h('div', { class: 'nav-in' }, NAV.filter(function (n) { return has(n.perm); }).map(function (n) {
      return h('a', { href: '#/' + n.key, class: n.key === active ? 'on' : '', onclick: function () { if (location.hash === '#/' + n.key) route(); } }, icon(n.icon), h('span', { text: n.label }));
    })));
    root.appendChild(top);
    if (!navigator.onLine) root.appendChild(h('div', { class: 'banner', text: 'ما فيه اتصال بالإنترنت' }));
    root.appendChild(h('main', { class: 'main' }, content));
    root.appendChild(nav);
    window.scrollTo(0, 0);
  }

  function openSheet(titleText, items) {
    var bg = h('div', { class: 'sheet-bg', onclick: function (e) { if (e.target === bg) bg.remove(); } });
    var sheet = h('div', { class: 'sheet' }, h('h3', { text: titleText }));
    items.forEach(function (it) {
      if (it.node) { sheet.appendChild(it.node); return; }
      sheet.appendChild(h('button', { class: 'item' + (it.danger ? ' danger' : ''), onclick: function () { bg.remove(); it.run(); } }, it.label));
    });
    sheet.appendChild(h('button', { class: 'item', onclick: function () { bg.remove(); } }, 'إغلاق'));
    bg.appendChild(sheet);
    document.body.appendChild(bg);
  }

  function openMenu() {
    var items = [];
    if (installEvt) items.push({ label: 'تثبيت التطبيق على الجوال', run: function () { installEvt.prompt(); installEvt = null; } });
    else if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone) {
      items.push({ node: h('div', { class: 'msg info' }, 'لتثبيت التطبيق على الآيفون: زر المشاركة ثم "إضافة إلى الشاشة الرئيسية".') });
    }
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    items.push({ label: isLight ? 'التصميم: التبديل للوضع الفاخر الداكن' : 'التصميم: التبديل للوضع الفاتح', run: function () {
      var nt = isLight ? 'lux' : 'light'; lsSet('ptw_theme', nt); document.documentElement.setAttribute('data-theme', nt);
      var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', nt === 'light' ? '#0B2E1E' : '#0A0C0B');
    } });
    items.push({ label: 'تغيير رابط الخادم', run: function () { renderSetup(true); } });
    items.push({ label: 'تسجيل الخروج', danger: true, run: function () { sessionLost(''); } });
    items.push({ node: h('div', { class: 'muted', style: 'padding-top:10px' }, 'تطبيق تصاريح العمل - نسخة ' + APP_VERSION + (S.user ? ' - ' + S.user.name : '')) });
    openSheet('القائمة', items);
  }

  function spinnerBlock(text) { return h('div', { class: 'center' }, h('span', { class: 'spinner dark' }), h('div', { class: 'muted', text: text || 'لحظة...' })); }

  function btnBusy(btn, on, label) {
    btn.disabled = !!on;
    clear(btn);
    if (on) { btn.appendChild(h('span', { class: 'spinner' })); btn.appendChild(document.createTextNode(' لحظة...')); }
    else btn.appendChild(document.createTextNode(label));
  }

  // ======================= إعداد الرابط =======================
  function renderSetup(canCancel) {
    clear(root);
    var input = h('input', { class: 'input', type: 'url', dir: 'ltr', placeholder: 'https://script.google.com/macros/s/.../exec', value: apiBase(), autocomplete: 'off' });
    var msg = h('div', { class: 'msg err', hidden: true });
    var go = h('button', { class: 'btn', type: 'button' }, 'حفظ واختبار');
    go.addEventListener('click', function () {
      var u = input.value.trim();
      msg.hidden = true;
      if (!validApiUrl(u)) { msg.className = 'msg err'; msg.textContent = 'الرابط غير صحيح. لازم يكون رابط تطبيق الويب المنتهي بـ /exec'; msg.hidden = false; return; }
      btnBusy(go, true);
      fetch(u + '?api=ping').then(function (r) { return r.text(); }).then(function (txt) {
        var j = null; try { j = JSON.parse(txt); } catch (e) {}
        btnBusy(go, false, 'حفظ واختبار');
        if (j && j.ok && j.api) { lsSet('ptw_api_url', u); toast('تم الاتصال بالخادم'); boot(); return; }
        msg.className = 'msg err';
        msg.textContent = 'وصلت للرابط لكن النسخة المنشورة ما فيها بوابة التطبيق. الصق Api.gs و Telegram.gs و Code.gs بمحرر Apps Script وانشر نسخة جديدة (v2.39-mobile-api).';
        msg.hidden = false;
      }).catch(function () {
        btnBusy(go, false, 'حفظ واختبار');
        msg.className = 'msg err'; msg.textContent = 'تعذر الوصول للرابط. تأكد منه، وإن النشر "Anyone" (أي شخص).'; msg.hidden = false;
      });
    });
    root.appendChild(h('div', { class: 'auth-wrap' },
      h('div', { class: 'brand' }, h('img', { src: 'icons/icon-192.png', alt: '' }), h('h1', { text: 'إعداد التطبيق' }), h('div', { class: 'sig' })),
      h('div', { class: 'card' },
        h('p', { class: 'muted', text: 'الصق رابط تطبيق الويب (المنتهي بـ /exec) من نشر Apps Script. تسويها مرة وحدة بس.' }),
        h('div', { class: 'field' }, h('label', { text: 'رابط الخادم' }), input),
        go, msg,
        canCancel && S.user ? h('button', { class: 'btn ghost', style: 'margin-top:10px', type: 'button', onclick: function () { route(); } }, 'إلغاء') : null)));
  }

  // ======================= الدخول والتسجيل =======================
  function renderAuth(note) {
    clear(root);
    var tab = 'login';
    var wrap = h('div', { class: 'auth-wrap' });
    var body = h('div', { class: 'card' });

    function field(id, label, props) {
      return h('div', { class: 'field' }, h('label', { for: id, text: label }), h('input', Object.assign({ id: id, class: 'input' }, props || {})));
    }
    function formLogin() {
      var msg = h('div', { class: 'msg err', hidden: true });
      var go = h('button', { class: 'btn', type: 'submit' }, 'دخول');
      var f = h('form', { autocomplete: 'on' },
        field('l-id', 'الرقم الوظيفي', { type: 'text', inputmode: 'numeric', autocomplete: 'username' }),
        field('l-pw', 'كلمة السر', { type: 'password', autocomplete: 'current-password' }),
        go, msg);
      if (note) { msg.textContent = note; msg.hidden = false; }
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var id = f.querySelector('#l-id').value.trim(), pw = f.querySelector('#l-pw').value;
        if (!id || !pw) { msg.className = 'msg err'; msg.textContent = 'اكتب الرقم الوظيفي وكلمة السر.'; msg.hidden = false; return; }
        btnBusy(go, true); msg.hidden = true;
        rpc('loginAccount', [id, pw]).then(function (res) {
          btnBusy(go, false, 'دخول');
          if (res && res.ok && res.token) {
            S.token = res.token; S.user = res.user; lsSet('ptw_token', res.token); lsSet('ptw_user', JSON.stringify(res.user));
            if (!location.hash || location.hash === '#') location.hash = '#/home';
            route();
          } else { msg.className = 'msg err'; msg.textContent = (res && res.message) || 'تعذر الدخول.'; msg.hidden = false; }
        });
      });
      return f;
    }
    function formReg() {
      var msg = h('div', { class: 'msg', hidden: true });
      var go = h('button', { class: 'btn', type: 'submit' }, 'إرسال الطلب');
      var f = h('form', { autocomplete: 'off' },
        field('r-id', 'الرقم الوظيفي', { type: 'text', inputmode: 'numeric' }),
        field('r-ph', 'رقم الجوال (نفس المسجل عند الشركة)', { type: 'tel', inputmode: 'tel' }),
        field('r-em', 'الإيميل', { type: 'email', dir: 'ltr' }),
        field('r-pw', 'كلمة السر (8 خانات على الأقل، حروف إنجليزية وأرقام)', { type: 'password', autocomplete: 'new-password' }),
        field('r-pw2', 'تأكيد كلمة السر', { type: 'password', autocomplete: 'new-password' }),
        go, msg);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        function v(id) { return f.querySelector('#' + id).value; }
        if (!v('r-id').trim() || !v('r-ph').trim() || !v('r-em').trim() || !v('r-pw')) { msg.className = 'msg err'; msg.textContent = 'عبّ كل الحقول.'; msg.hidden = false; return; }
        if (v('r-pw') !== v('r-pw2')) { msg.className = 'msg err'; msg.textContent = 'كلمة السر وتأكيدها مو متطابقين.'; msg.hidden = false; return; }
        btnBusy(go, true); msg.hidden = true;
        rpc('registerAccount', [v('r-id').trim(), v('r-ph').trim(), v('r-em').trim(), v('r-pw')]).then(function (res) {
          btnBusy(go, false, 'إرسال الطلب');
          msg.className = 'msg ' + (res && res.ok ? 'ok' : 'err'); msg.textContent = (res && res.message) || 'تعذر إرسال الطلب.'; msg.hidden = false;
        });
      });
      return f;
    }
    function formRst() {
      var msg = h('div', { class: 'msg', hidden: true });
      var go = h('button', { class: 'btn', type: 'submit' }, 'حفظ');
      var f = h('form', { autocomplete: 'off' },
        h('p', { class: 'muted', text: 'تستخدمها لما المسؤول يعيد تعيين حسابك.' }),
        field('s-id', 'الرقم الوظيفي', { type: 'text', inputmode: 'numeric' }),
        field('s-ph', 'رقم الجوال', { type: 'tel', inputmode: 'tel' }),
        field('s-pw', 'كلمة السر الجديدة', { type: 'password', autocomplete: 'new-password' }),
        go, msg);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        function v(id) { return f.querySelector('#' + id).value; }
        if (!v('s-id').trim() || !v('s-ph').trim() || !v('s-pw')) { msg.className = 'msg err'; msg.textContent = 'عبّ كل الحقول.'; msg.hidden = false; return; }
        btnBusy(go, true); msg.hidden = true;
        rpc('setInitialPassword', [v('s-id').trim(), v('s-ph').trim(), v('s-pw')]).then(function (res) {
          btnBusy(go, false, 'حفظ');
          msg.className = 'msg ' + (res && res.ok ? 'ok' : 'err'); msg.textContent = (res && res.message) || 'تعذر الحفظ.'; msg.hidden = false;
        });
      });
      return f;
    }
    var tabs = h('div', { class: 'tabs' });
    [['login', 'دخول'], ['reg', 'طلب حساب'], ['rst', 'تعيين كلمة سر']].forEach(function (t) {
      tabs.appendChild(h('button', { type: 'button', 'data-t': t[0], class: t[0] === tab ? 'on' : '', onclick: function () { tab = t[0]; draw(); } }, t[1]));
    });
    function draw() {
      Array.prototype.forEach.call(tabs.children, function (b) { b.classList.toggle('on', b.getAttribute('data-t') === tab); });
      clear(body); body.appendChild(tabs);
      body.appendChild(tab === 'login' ? formLogin() : tab === 'reg' ? formReg() : formRst());
    }
    wrap.appendChild(h('div', { class: 'brand' }, h('img', { src: 'icons/icon-192.png', alt: '' }), h('h1', { text: 'نظام تصاريح العمل' }), h('div', { class: 'sig' })));
    wrap.appendChild(body);
    wrap.appendChild(h('button', { class: 'btn ghost sm', style: 'margin:0 auto;display:flex', type: 'button', onclick: function () { renderSetup(false); } }, 'تغيير رابط الخادم'));
    root.appendChild(wrap);
    draw();
  }

  // ======================= الرئيسية =======================
  function pageHome() {
    var u = S.user;
    var statsBox = h('div', { class: 'muted', text: '' });
    var content = h('div', null,
      h('div', { class: 'hello' }, h('h2', { text: 'أهلاً ' + u.name }), h('p', { text: u.role + ' - ' + u.empId })));
    if (has('site')) {
      content.appendChild(h('div', { class: 'tiles' },
        h('a', { class: 'tile open', href: '#/site/open' }, icon('open'), h('div', null, 'فتح تصريح', h('small', { text: 'سجّل فتح تصريح عمل' }))),
        h('a', { class: 'tile closeop', href: '#/site/close' }, icon('close'), h('div', null, 'إغلاق تصريح', h('small', { text: 'سجّل إغلاق تصريح' }))),
        h('a', { class: 'tile', href: '#/photos' }, icon('photos'), h('div', null, 'رفع الصور', h('small', { text: 'صور التصاريح والجولات' }))),
        has('mypage') ? h('a', { class: 'tile', href: '#/me' }, icon('me'), h('div', null, 'صفحتي', h('small', { text: 'إحصائياتك هذا الشهر' }))) : null));
    } else if (has('mypage')) {
      content.appendChild(h('div', { class: 'tiles' }, h('a', { class: 'tile wide', href: '#/me' }, icon('me'), h('div', null, 'صفحتي', h('small', { text: 'إحصائياتك هذا الشهر' })))));
    } else {
      content.appendChild(h('div', { class: 'msg warn', text: 'ما عندك صفحات مفعّلة بالتطبيق الحين. كلّم المسؤول.' }));
    }
    var mineSlot = h('div');
    content.insertBefore(mineSlot, content.children[1]);
    if (has('dashboard')) content.insertBefore(h('a', { class: 'tile wide dashtile', href: '#/dash', style: 'margin-bottom:12px' }, icon('dash'), h('div', null, 'لوحة اليوم', h('small', { text: 'إحصائيات اليوم وتنقل بين الأيام' }))), content.children[1]);
    var extra = [];
    if (has('dashboard')) extra.push(h('a', { class: 'tile', href: '#/gallery' }, icon('gallery'), h('div', null, 'معرض الصور', h('small', { text: 'صور التصاريح والجولات' }))), h('a', { class: 'tile', href: '#/meetings' }, icon('meet'), h('div', null, 'الاجتماعات', h('small', { text: 'محضر جديد وسجل' }))));
    if (has('search')) extra.unshift(h('a', { class: 'tile', href: '#/find' }, icon('find'), h('div', null, 'بحث عن تصريح', h('small', { text: 'بياناته ومين فتحه وقفله' }))));
    if (has('admin')) extra.push(h('a', { class: 'tile', href: '#/emp' }, icon('report'), h('div', null, 'تقرير موظف', h('small', { text: 'فتح وإغلاق وصور بالشهر' }))), h('a', { class: 'tile', href: '#/obs' }, icon('obs'), h('div', null, 'ملاحظات السلامة', h('small', { text: 'أداء الموظفين' }))));
    if (extra.length) { content.appendChild(h('div', { class: 'sect', text: 'الأدوات الإدارية' })); content.appendChild(h('div', { class: 'tiles' }, extra)); }
    content.appendChild(h('div', { class: 'card' }, h('h2', { text: 'هذا الشهر' }), statsBox));
    shell('home', 'نظام تصاريح العمل', content);

    if (has('mypage')) {
      statsBox.textContent = 'جاري التحميل...';
      swr('getMyPageStats', [], function (res, fromCache) {
        if (!statsBox.isConnected) return;
        if (!res || !res.ok) { if (!fromCache && !statsBox.querySelector('.stats')) statsBox.textContent = ''; return; }
        clear(statsBox);
        statsBox.className = '';
        statsBox.appendChild(h('div', { class: 'stats', style: 'margin:0' },
          h('div', { class: 'stat' }, h('div', { class: 'n', text: res.permits.opened }), h('div', { class: 'l', text: 'تصاريح فتحتها' })),
          h('div', { class: 'stat' }, h('div', { class: 'n', text: res.permits.closed }), h('div', { class: 'l', text: 'تصاريح أغلقتها' }))));
      });
    } else { statsBox.parentNode.remove(); }

    // v1.16: تصاريحك المفتوحة اليوم (إغلاق بضغطة)
    if (has('site')) {
      swr('getMyOpenToday', [], function (res) {
        if (!mineSlot.isConnected) return;
        clear(mineSlot);
        if (!res || !res.ok || !res.permits || !res.permits.length || res.date !== localToday()) return;
        var n = res.permits.length;
        mineSlot.appendChild(h('a', { class: 'tile wide closeop', href: '#/site/close', style: 'margin-bottom:12px' }, icon('close'),
          h('div', null, 'عندك ' + n + (n === 1 ? ' تصريح مفتوح' : ' تصاريح مفتوحة') + ' اليوم', h('small', { text: 'اضغط وأغلقها بضغطة، بدون كتابة الرقم' }))));
      });
    }
    // v1.16: نجهّز لوحة اليوم بالخلفية عشان تفتح فوراً (مرة كل دقيقة بالكثير)
    if (has('dashboard') && Date.now() - dashWarmAt > 60000) {
      dashWarmAt = Date.now();
      call('getAppDashboard', false, '', 'day').then(function (res) { if (res && res.ok && res.mode !== 'day' && res.mode !== 'range') lsSet(DASH_LS, JSON.stringify(res)); });
    }
  }
  var dashWarmAt = 0;

  // ======================= تسجيل فتح / إغلاق =======================
  var PHOTO_KEYS = [['permit', 'صورة التصريح'], ['hazards', 'خطوات العمل والمخاطر'], ['participants', 'أسماء المشاركين في TBT'], ['tbt', 'TBT'], ['site', 'صورة موقع العمل']];
  var CLOSE_KEYS = [['closed', 'صورة التصريح مغلق'], ['site_after', 'صورة موقع العمل بعد الإغلاق']];
  var STATUS_AR = { active: 'سارٍ', expired: 'منتهي', upcoming: 'لم يبدأ' };

  /** حقول رفع ملفات: يرجع {node, inputs:[{key,input}]} */
  function fileFields(keys, prefix) {
    var inputs = [];
    var node = h('div', null, keys.map(function (k, i) {
      var inp = h('input', { type: 'file', accept: 'image/*,video/*,application/pdf', id: prefix + k[0] });
      var picked = h('div', { class: 'picked', hidden: true });
      inp.addEventListener('change', function () { if (inp.files && inp.files[0]) { picked.textContent = '✓ ' + inp.files[0].name; picked.hidden = false; } else picked.hidden = true; });
      inputs.push({ key: k[0], input: inp });
      return h('div', { class: 'file' }, h('label', { class: 't', for: prefix + k[0], text: (i + 1) + ') ' + k[1] }), inp, picked);
    }));
    return { node: node, inputs: inputs };
  }
  function collectChosen(ff) { return ff.inputs.filter(function (x) { return x.input.files && x.input.files[0]; }).map(function (x) { return { key: x.key, file: x.input.files[0] }; }); }
  function buildPhotos(chosen) {
    return Promise.all(chosen.map(function (c) { return filePayload(c.file); })).then(function (pls) {
      var photos = {}; pls.forEach(function (p, i) { photos[chosen[i].key] = p; }); return photos;
    });
  }

  function pageSite(op0) {
    var st = { op: op0 === 'close' ? 'close' : 'open', ptw: '', first: false, busy: false };
    var box = h('div');
    shell('site', 'تسجيل فتح / إغلاق', box);

    function step1(prefill) {
      clear(box);
      var ptwIn = h('input', { class: 'input big', type: 'text', id: 'ptw', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'مثال: 5 أو SEP.5', value: prefill || '' });
      var noteIn = h('input', { class: 'input', type: 'text', id: 'note', maxlength: '300', autocomplete: 'off', placeholder: 'ملاحظة (اختياري)' });
      var msg = h('div', { class: 'msg err', hidden: true });
      var ambig = h('div', { hidden: true });
      var segOpen = h('button', { type: 'button', class: st.op === 'open' ? 'on' : '' }, 'فتح');
      var segClose = h('button', { type: 'button', class: st.op === 'close' ? 'on close' : '' }, 'إغلاق');
      var go = h('button', { class: 'btn' + (st.op === 'close' ? ' danger' : ''), type: 'button' }, 'متابعة');
      var mineBox = h('div', { hidden: st.op !== 'close' });
      function setOp(o) {
        st.op = o; mineBox.hidden = o !== 'close';
        segOpen.className = o === 'open' ? 'on' : ''; segClose.className = o === 'close' ? 'on close' : '';
        go.className = 'btn' + (o === 'close' ? ' danger' : '');
      }
      segOpen.addEventListener('click', function () { setOp('open'); });
      segClose.addEventListener('click', function () { setOp('close'); });
      function check(forced) {
        if (st.busy) return;
        var ptw = (forced || ptwIn.value).trim();
        msg.hidden = true; ambig.hidden = true; clear(ambig);
        if (!ptw) { msg.textContent = 'اكتب رقم التصريح.'; msg.hidden = false; return; }
        st.busy = true; btnBusy(go, true);
        call('lookupPermit', ptw, st.op).then(function (res) {
          st.busy = false; btnBusy(go, false, 'متابعة');
          if (!res || !res.ok) {
            if (res && res.code === 'AUTH') return;
            if (res && res.ambiguous) {
              ambig.appendChild(h('div', { class: 'msg warn', text: res.message }));
              (res.candidates || []).forEach(function (c) {
                var sub = [c.location, c.openedBy ? 'فتحه ' + c.openedBy + (c.openedAt ? ' - ' + c.openedAt : '') : ''].filter(Boolean).join(' · ');
                ambig.appendChild(h('button', { class: 'list-item', type: 'button', onclick: function () { check(c.ptw); } },
                  h('div', null, h('b', null, ltr(c.ptw)), c.company ? ' - ' + c.company : ''), h('div', { class: 'sub', text: sub })));
              });
              ambig.hidden = false; return;
            }
            msg.textContent = (res && res.message) || 'صار خطأ. حاول مرة ثانية.'; msg.hidden = false; return;
          }
          step2(res, noteIn.value.trim());
        });
      }
      go.addEventListener('click', function () { check(); });
      ptwIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(); });
      box.appendChild(h('div', { class: 'card' },
        h('h2', { text: 'تسجيل فتح / إغلاق تصريح' }),
        h('div', { class: 'seg' }, segOpen, segClose),
        h('div', { class: 'field' }, h('label', { for: 'ptw', text: 'رقم التصريح' }), ptwIn),
        h('div', { class: 'field' }, noteIn),
        go, msg, ambig));
      box.appendChild(mineBox);
      loadMine(mineBox);
      if (!prefill && st.op !== 'close') setTimeout(function () { try { ptwIn.focus(); } catch (e) {} }, 50);
    }

    // v1.16: تصاريحي المفتوحة اليوم - إغلاق بضغطة (بدون كتابة الرقم وبدون خطوة المطابقة)
    function loadMine(host) {
      swr('getMyOpenToday', [], function (res) {
        if (!host.isConnected) return;
        clear(host);
        if (!res || !res.ok || !res.permits || res.date !== localToday()) return;   // خادم قديم أو خطأ: نخفيها بهدوء
        host.appendChild(h('div', { class: 'sect', style: 'margin-top:16px', text: 'تصاريحك المفتوحة اليوم (' + res.permits.length + ')' }));
        if (!res.permits.length) { host.appendChild(h('div', { class: 'muted', style: 'text-align:center;padding:10px', text: 'ما عندك تصاريح مفتوحة اليوم.' })); return; }
        res.permits.forEach(function (p) {
          host.appendChild(h('button', { class: 'list-item', type: 'button', onclick: function () { quickClose(p); } },
            h('div', null, h('b', null, ltr(p.ptw)), p.company ? ' - ' + p.company : ''),
            h('div', { class: 'sub' }, [p.location, ' · فتحته ', ltr(String(p.time).substring(11, 16))])));
        });
      });
    }
    function quickClose(p) {
      if (st.busy) return;
      var noteIn = h('input', { class: 'input', type: 'text', maxlength: '300', placeholder: 'ملاحظة (اختياري)' });
      openSheet('إغلاق التصريح ' + p.ptw, [
        { node: h('div', { class: 'details' }, row('التصريح', ltr(p.ptw)), row('الشركة', p.company), row('الموقع', p.location), row('انفتح', ltr(String(p.time).substring(11, 16)))) },
        { node: h('div', { class: 'field' }, noteIn) },
        { label: 'اعتماد الإغلاق', danger: true, run: function () {
          st.busy = true; st.op = 'close'; st.ptw = p.ptw;
          clear(box); box.appendChild(spinnerBlock('جاري تسجيل الإغلاق...'));
          call('submitOperation', p.ptw, 'close', noteIn.value.trim()).then(function (res) {
            st.busy = false;
            if (!res || !res.ok) {
              if (res && res.code === 'AUTH') return;
              step1(''); toast((res && res.message) || 'صار خطأ. حاول مرة ثانية.'); return;
            }
            step3(res, []);
          });
        } }
      ]);
    }

    function row(k, v) { return h('div', { class: 'drow' }, h('span', { class: 'k', text: k }), h('span', { class: 'v' }, v || '-')); }

    function step2(d, note) {
      clear(box);
      var isOpen = st.op === 'open';
      var p = d.permit;
      st.ptw = p.ptw; st.first = isOpen && !!d.firstOpen;
      var badge = h('span', { class: 'badge ' + (STATUS_AR[d.status] ? d.status : 'unknown'), text: STATUS_AR[d.status] || 'غير معروف' });
      var details = h('div', { class: 'details' },
        row('الموظف', d.employee.name + ' (' + d.employee.id + ')'),
        row('رقم التصريح', ltr(p.ptw)), row('الحالة', badge), row('الشركة', p.company),
        row('الفترة', [ltr(p.startDate || '?'), '  إلى  ', ltr(p.endDate || '?')]),
        row('الموقع', (p.location || '') + (p.floor ? ' - ' + p.floor : '')),
        row('وصف الأعمال', p.description), row('النوع', p.type), row('المصدر', p.issuer),
        row('المستلم', p.receiver), row('الجوال', p.phone ? ltr(p.phone) : ''), row('الوردية', p.shift));
      var warn = null;
      if (d.warnings && d.warnings.length) {
        warn = h('div', { class: 'msg warn', style: 'margin:0 0 14px' }, h('b', { text: 'تنبيه (تقدر تكمل والعملية بتنسجل):' }),
          h('ul', null, d.warnings.map(function (w) { return h('li', { text: w }); })));
      }
      var ff = st.first ? fileFields(PHOTO_KEYS, 'op-') : null;
      var msg = h('div', { class: 'msg err', hidden: true });
      var noteIn = h('input', { class: 'input', type: 'text', maxlength: '300', placeholder: 'ملاحظة (اختياري)', value: note || '' });
      var confirm = h('button', { class: 'btn' + (isOpen ? '' : ' danger'), type: 'button' }, isOpen ? 'اعتماد الفتح' : 'اعتماد الإغلاق');
      var back = h('button', { class: 'btn gray', type: 'button' }, 'رجوع وتعديل');
      back.addEventListener('click', function () { if (!st.busy) step1(st.ptw); });
      confirm.addEventListener('click', function () {
        if (st.busy) return;
        st.busy = true; btnBusy(confirm, true); back.disabled = true; msg.hidden = true;
        call('submitOperation', st.ptw, st.op, noteIn.value.trim()).then(function (res) {
          st.busy = false; back.disabled = false; btnBusy(confirm, false, isOpen ? 'اعتماد الفتح' : 'اعتماد الإغلاق');
          if (!res || !res.ok) {
            if (res && res.code === 'AUTH') return;
            msg.textContent = (res && res.message) || 'صار خطأ. حاول مرة ثانية.'; msg.hidden = false; return;
          }
          step3(res, ff ? collectChosen(ff) : []);
        });
      });
      box.appendChild(h('div', { class: 'card' },
        h('h2', { text: isOpen ? 'تأكيد فتح التصريح' : 'تأكيد إغلاق التصريح' }),
        warn, details,
        ff ? h('div', null, h('div', { class: 'muted', style: 'margin-bottom:8px', text: 'أول فتح لهذا التصريح، تقدر ترفع الصور الحين (اختياري):' }), ff.node) : null,
        h('div', { class: 'field' }, noteIn),
        confirm, back, msg));
      window.scrollTo(0, 0);
    }

    function step3(res, chosen) {
      clear(box); opsChanged();
      var verb = res.op === 'فتح' ? 'فتحت' : 'أغلقت';
      var flagged = res.flags && res.flags.length;
      var result = h('div', { class: 'msg ' + (flagged ? 'warn' : 'ok'), style: 'font-size:16px' });
      if (flagged) {
        result.appendChild(document.createTextNode('تم تسجيل العملية (' + res.op + ') للتصريح '));
        result.appendChild(ltr(res.ptw));
        result.appendChild(document.createTextNode('، لكن يبدو إنك ' + verb + ' تصريح غلط: ' + res.flags.join('، ') + '. تراك مسجل عليك، وبنراجعه آخر اليوم.'));
      } else {
        result.appendChild(document.createTextNode('تم تسجيل ' + res.op + ' التصريح '));
        result.appendChild(ltr(res.ptw));
        result.appendChild(document.createTextNode(' بنجاح ('));
        result.appendChild(ltr(res.time));
        result.appendChild(document.createTextNode(').'));
      }
      if (res.duplicate) result.appendChild(h('div', { text: '(كانت مسجلة قبل لحظات، ما انسجلت مرة ثانية.)' }));
      var photoStatus = h('div', { hidden: true });
      var again = h('button', { class: 'btn', type: 'button', onclick: function () { st.ptw = ''; step1(''); } }, res.op === 'إغلاق' ? 'إغلاق تصريح ثاني' : 'تسجيل تصريح ثاني');
      box.appendChild(h('div', { class: 'card', style: 'text-align:center' },
        h('div', { style: 'font-size:48px', text: flagged ? '⚠️' : '✅' }), result, photoStatus,
        h('div', { style: 'margin-top:16px' }, again)));
      window.scrollTo(0, 0);
      if (chosen.length) {
        photoStatus.className = 'msg info'; photoStatus.textContent = 'جاري حفظ الصور...'; photoStatus.hidden = false;
        buildPhotos(chosen).then(function (photos) { return call('uploadPermitPhotos', res.ptw, photos); }).then(function (r) {
          if (r && r.ok) { photoStatus.className = 'msg ok'; photoStatus.textContent = r.extraFiles ? 'تم حفظ المرفقات بنجاح.' : 'تم حفظ الصور بنجاح بملف PDF واحد.'; }
          else { photoStatus.className = 'msg err'; photoStatus.textContent = 'تعذر حفظ المرفقات' + (r && r.message ? ': ' + r.message : '') + '. التسجيل نفسه تم، وتقدر ترفعها من "الصور".'; }
        }).catch(function (e) { photoStatus.className = 'msg err'; photoStatus.textContent = 'تعذر معالجة الصور: ' + (e && e.message ? e.message : 'خطأ غير معروف'); });
      }
    }
    step1('');
  }

  // ======================= رفع الصور =======================
  var LEVELS = ['البدروم', 'الأرضي', 'الأرضي ميزانين', 'رزد الأول', 'الأول', 'رزد الأول ميزانين', 'الأول ميزانين', 'رزد الثاني', 'الثاني', 'رزد الثاني ميزانين', 'الثاني ميزانين', 'الثالث', 'رزد السطح', 'السطح', 'السطح العلوي', 'الواجهة'];
  var ZONES = [1, 2, 3, 4, 5, 'شمالية', 'جنوبية', 'شرقية', 'غربية'];
  var ROUND_TYPES = ['جولة عامة في الموقع', 'متابعة أعمال', 'جولة مع دار الهندسة', 'جولة مع التنفيذ', 'فحص الطفايات', 'فحص صناديق الحريق', 'فحص المكاتب والمستودعات', 'فحص السلالم', 'فحص الحواف', 'التخزينات الموقتة', 'جولة تسليمات', 'جولات مع فريق التنفيذ', 'جولات مع مدير المشروع', 'المواد المتساقطه', 'يوم الجمعه', 'امان والطلاقي', 'الدفاع المدني', 'بريتام', 'الماليه', 'أخرى'];

  function pagePhotos() {
    var box = h('div');
    shell('photos', 'رفع الصور', box);

    function tile(title, sub, fn) { return h('button', { class: 'list-item', type: 'button', style: 'text-align:center;padding:20px', onclick: fn }, h('b', { text: title }), h('div', { class: 'sub', text: sub })); }
    function backBtn(fn) { return h('button', { class: 'btn gray', type: 'button', onclick: fn }, 'رجوع'); }

    function main() {
      clear(box);
      box.appendChild(h('div', { class: 'card' }, h('h2', { text: 'رفع الصور' }),
        tile('صور التصاريح', 'صور فتح وإغلاق التصاريح', permitsType),
        tile('صور جولات ومتابعة أعمال', 'حسب الدور والزون ونوع الجولة', rounds)));
    }
    function permitsType() {
      clear(box);
      box.appendChild(h('div', { class: 'card' }, h('h2', { text: 'صور التصاريح' }),
        tile('صور الفتح', '5 خانات ساعة الفتح', function () { myPermits('open'); }),
        tile('صور الإغلاق', 'خانتين ساعة الإغلاق', function () { myPermits('close'); }),
        backBtn(main)));
    }
    function myPermits(kind) {
      clear(box);
      var list = h('div'); var card = h('div', { class: 'card' }, h('h2', { text: kind === 'open' ? 'اختر التصريح (صور الفتح)' : 'اختر التصريح (صور الإغلاق)' }), list, backBtn(permitsType));
      box.appendChild(card);
      list.appendChild(spinnerBlock('جاري تحميل تصاريحك...'));
      swr('getMyOpenedPermits', [], function (res) {
        if (!list.isConnected) return;
        clear(list);
        if (!res || !res.ok) { if (res && res.code === 'AUTH') return; list.appendChild(h('div', { class: 'msg err', text: (res && res.message) || 'صار خطأ. حاول مرة ثانية.' })); return; }
        if (!res.permits.length) { list.appendChild(h('div', { class: 'muted', style: 'text-align:center;padding:16px', text: 'ما فيه تصاريح فتحتها هذا الشهر.' })); return; }
        res.permits.forEach(function (p) {
          list.appendChild(h('button', { class: 'list-item', type: 'button', onclick: function () { uploadForm(kind, p.ptw); } },
            h('div', null, h('b', null, ltr(p.ptw)), p.company ? ' - ' + p.company : ''),
            h('div', { class: 'sub', text: [p.location, p.lastOpenedAt ? 'آخر فتح: ' + p.lastOpenedAt : ''].filter(Boolean).join(' · ') })));
        });
      });
    }
    function uploadForm(kind, ptw) {
      clear(box);
      var ff = fileFields(kind === 'open' ? PHOTO_KEYS : CLOSE_KEYS, 'up-');
      var msg = h('div', { hidden: true });
      var go = h('button', { class: 'btn', type: 'button' }, 'رفع الصور');
      var back = backBtn(function () { myPermits(kind); });
      var busy = false;
      go.addEventListener('click', function () {
        if (busy) return;
        var chosen = collectChosen(ff);
        if (!chosen.length) { msg.className = 'msg err'; msg.textContent = 'اختر ملف واحد على الأقل.'; msg.hidden = false; return; }
        busy = true; btnBusy(go, true); back.disabled = true; msg.hidden = true;
        buildPhotos(chosen).then(function (photos) { return call(kind === 'open' ? 'uploadPermitPhotos' : 'uploadPermitClosePhotos', ptw, photos); }).then(function (res) {
          busy = false; btnBusy(go, false, 'رفع الصور'); back.disabled = false;
          if (!res || !res.ok) { if (res && res.code === 'AUTH') return; msg.className = 'msg err'; msg.textContent = (res && res.message) || 'تعذر حفظ المرفقات. حاول مرة ثانية.'; msg.hidden = false; return; }
          msg.className = 'msg ok'; msg.textContent = res.extraFiles ? 'تم حفظ المرفقات بنجاح.' : 'تم حفظ الصور بنجاح بملف PDF واحد.'; msg.hidden = false;
          ff.inputs.forEach(function (x) { x.input.value = ''; x.input.dispatchEvent(new Event('change')); });
        }).catch(function (e) {
          busy = false; btnBusy(go, false, 'رفع الصور'); back.disabled = false;
          msg.className = 'msg err'; msg.textContent = 'تعذر معالجة المرفقات: ' + (e && e.message ? e.message : 'خطأ غير معروف'); msg.hidden = false;
        });
      });
      box.appendChild(h('div', { class: 'card' }, h('h2', null, (kind === 'open' ? 'صور فتح التصريح ' : 'صور إغلاق التصريح '), ltr(ptw)), ff.node, go, back, msg));
      window.scrollTo(0, 0);
    }
    function chipGroup(values, labelOf) {
      var wrap = h('div', { class: 'chips' }); var cbs = [];
      values.forEach(function (v) {
        var cb = h('input', { type: 'checkbox', value: String(v) });
        var lab = h('label', { class: 'chip' }, cb, labelOf ? labelOf(v) : String(v));
        cb.addEventListener('change', function () { lab.classList.toggle('on', cb.checked); });
        cbs.push(cb); wrap.appendChild(lab);
      });
      return { node: wrap, values: function () { return cbs.filter(function (c) { return c.checked; }).map(function (c) { return c.value; }); }, reset: function () { cbs.forEach(function (c) { c.checked = false; c.parentNode.classList.remove('on'); }); } };
    }
    function rounds() {
      clear(box);
      var type = chipGroup(ROUND_TYPES);   // v1.4: اختيار متعدد لنوع الصور
      var lv = chipGroup(LEVELS), zn = chipGroup(ZONES, function (z) { return typeof z === 'number' ? 'زون ' + z : z; });
      var desc = h('textarea', { class: 'input', maxlength: '500', placeholder: 'وصف (اختياري)' });
      var files = h('input', { type: 'file', accept: 'image/*,video/*,application/pdf', multiple: true });
      var msg = h('div', { hidden: true });
      var go = h('button', { class: 'btn', type: 'button' }, 'رفع');
      var back = backBtn(main); var busy = false;
      go.addEventListener('click', function () {
        if (busy) return;
        var levels = lv.values(), zones = zn.values(), fl = files.files ? Array.prototype.slice.call(files.files) : [];
        function err(t) { msg.className = 'msg err'; msg.textContent = t; msg.hidden = false; }
        if (!levels.length && !zones.length) return err('اختر دور أو زون واحد على الأقل.');
        var types = type.values();
        if (!types.length) return err('اختر نوع واحد على الأقل من أنواع الصور.');
        if (!fl.length) return err('اختر ملف واحد على الأقل.');
        if (fl.length > 20) return err('أقصى عدد ملفات بالمرة الواحدة 20.');
        busy = true; btnBusy(go, true); back.disabled = true; msg.hidden = true;
        Promise.all(fl.map(filePayload)).then(function (photos) {
          return call('uploadRoundPhotos', { levels: levels, zones: zones, roundType: types, description: desc.value.trim(), photos: photos });
        }).then(function (res) {
          busy = false; btnBusy(go, false, 'رفع'); back.disabled = false;
          if (!res || !res.ok) { if (res && res.code === 'AUTH') return; return err((res && res.message) || 'تعذر حفظ الملفات. حاول مرة ثانية.'); }
          msg.className = 'msg ok'; msg.textContent = 'تم حفظ ' + res.count + ' ملف بنجاح.'; msg.hidden = false;
          lv.reset(); zn.reset(); type.reset(); desc.value = ''; files.value = '';
        }).catch(function (e) { busy = false; btnBusy(go, false, 'رفع'); back.disabled = false; err('تعذر معالجة الملفات: ' + (e && e.message ? e.message : 'خطأ غير معروف')); });
      });
      box.appendChild(h('div', { class: 'card' }, h('h2', { text: 'صور جولات ومتابعة أعمال' }),
        h('div', { class: 'field' }, h('label', { text: 'نوع الصور (تقدر تختار أكثر من نوع)' }), type.node),
        h('div', { class: 'field' }, h('label', { text: 'الأدوار' }), lv.node),
        h('div', { class: 'field' }, h('label', { text: 'الزونات' }), zn.node),
        h('div', { class: 'field' }, h('label', { text: 'وصف' }), desc),
        h('div', { class: 'field' }, h('label', { text: 'الملفات' }), h('div', { class: 'file' }, files)),
        go, back, msg));
      window.scrollTo(0, 0);
    }
    main();
  }

  // ======================= صفحتي =======================
  function pageMe() {
    var now = new Date(), curY = now.getFullYear(), curM = now.getMonth() + 1;
    var st = { y: curY, m: curM, section: '', data: null };
    var box = h('div');
    shell('me', 'صفحتي', box);

    var label = h('div', { class: 'lbl' });
    var body = h('div');
    var prev = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'الشهر السابق' }, icon('back'));
    var next = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'الشهر التالي' }, icon('next'));
    prev.addEventListener('click', function () { shiftMonth(-1); });
    next.addEventListener('click', function () { shiftMonth(1); });
    box.appendChild(h('div', { class: 'months' }, prev, label, next));
    box.appendChild(body);

    function shiftMonth(d) {
      var m = st.m + d, y = st.y;
      if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
      if (y > curY || (y === curY && m > curM)) return;
      st.y = y; st.m = m; st.section = ''; load();
    }
    function load() {
      label.textContent = MONTHS[st.m] + ' ' + st.y;
      next.disabled = (st.y === curY && st.m === curM);
      clear(body); body.appendChild(spinnerBlock('جاري تحميل بياناتك...'));
      var shown = false, ky = st.y + '-' + st.m;
      swr('getMyPageStats', [{ year: st.y, month: st.m }], function (res, fromCache) {
        if (!body.isConnected || ky !== st.y + '-' + st.m) return;
        if (res && res.ok) { shown = true; st.data = res; return render(); }
        if (shown) return; // عندنا نسخة محفوظة معروضة، ما نبدّلها بخطأ شبكة
        clear(body);
        if (!res || !res.ok) {
          if (res && res.code === 'AUTH') return;
          body.appendChild(h('div', { class: 'msg err', text: (res && res.message) || 'تعذر جلب بياناتك.' }));
          body.appendChild(h('button', { class: 'btn', style: 'margin-top:12px', type: 'button', onclick: load }, 'إعادة المحاولة'));
          return;
        }
        st.data = res; render();
      });
    }
    function render() {
      var d = st.data; clear(body);
      var detail = h('div', { class: 'card' });
      var defs = [
        ['opened', d.permits.opened, 'تصاريح فتحتها'], ['closed', d.permits.closed, 'تصاريح أغلقتها'],
        ['meetings', d.meetings.count, 'اجتماعات'], ['rounds', d.rounds.count, 'صور جولات'],
        ['obs', d.observations.total, 'ملاحظات السلامة (كل الفترة)', true]
      ];
      var grid = h('div', { class: 'stats' });
      defs.forEach(function (x) {
        grid.appendChild(h('button', { class: 'stat' + (x[3] ? ' wide' : '') + (st.section === x[0] ? ' on' : ''), type: 'button', onclick: function () { st.section = st.section === x[0] ? '' : x[0]; render(); } },
          h('div', { class: 'n', text: x[1] }), h('div', { class: 'l', text: x[2] })));
      });
      body.appendChild(grid);
      if (st.section) { fillDetail(detail, st.section); body.appendChild(detail); }
    }
    function linkTo(url, text) { var u = safeUrl(url); return u ? h('a', { href: u, target: '_blank', rel: 'noopener' }, text) : null; }
    function empty(t) { return h('div', { class: 'muted', style: 'text-align:center;padding:12px', text: t }); }
    function fillDetail(card, sec) {
      var d = st.data;
      if (sec === 'opened' || sec === 'closed') {
        var list = sec === 'opened' ? d.permits.openedList : d.permits.closedList;
        card.appendChild(h('h2', { text: sec === 'opened' ? 'التصاريح اللي فتحتها' : 'التصاريح اللي أغلقتها' }));
        if (!list.length) card.appendChild(empty('ما فيه شي بهذا الشهر.'));
        list.forEach(function (p) { card.appendChild(h('div', { class: 'rowitem' }, ltr(p))); });
      } else if (sec === 'meetings') {
        card.appendChild(h('h2', { text: 'الاجتماعات' }));
        if (!d.meetings.list.length) card.appendChild(empty('ما فيه اجتماعات بهذا الشهر.'));
        d.meetings.list.forEach(function (m) { card.appendChild(h('div', { class: 'rowitem' }, ltr(m.meetingNo), ' — ' + (m.topic || '-') + ' ', ltr(m.dateTime), linkTo(m.fileUrl, 'فتح المحضر'))); });
      } else if (sec === 'rounds') {
        card.appendChild(h('h2', { text: 'صور الجولات' }));
        if (!d.rounds.list.length) card.appendChild(empty('ما فيه صور جولات بهذا الشهر.'));
        d.rounds.list.forEach(function (r) {
          var loc = [r.levels, r.zones].filter(Boolean).join(' - ');
          card.appendChild(h('div', { class: 'rowitem' }, ltr(r.time), ' — ' + r.type + (loc ? ' (' + loc + ')' : '') + (r.description ? ' — ' + r.description : ''), linkTo(r.fileUrl, 'فتح الملف')));
        });
      } else if (sec === 'obs') {
        card.appendChild(h('h2', { text: 'ملاحظات السلامة' }));
        var months = Object.keys(d.observations.byMonth || {}).sort().reverse();
        var sel = h('select', { class: 'input', style: 'margin-bottom:12px' }, h('option', { value: '', text: 'كل الفترة (' + d.observations.total + ')' }),
          months.map(function (ym) { var p = ym.split('-'); return h('option', { value: ym, text: MONTHS[Number(p[1])] + ' ' + p[0] + ' (' + d.observations.byMonth[ym] + ')' }); }));
        var listBox = h('div');
        function draw() {
          clear(listBox);
          var items = (d.observations.list || []).filter(function (o) { return !sel.value || o.ym === sel.value; });
          if (!items.length) { listBox.appendChild(empty('ما فيه ملاحظات مطابقة.')); return; }
          items.forEach(function (o) {
            var links = extractUrls(o.photoBefore).map(function (u) { return linkTo(u, 'صورة قبل'); }).concat(extractUrls(o.photoAfter).map(function (u) { return linkTo(u, 'صورة بعد'); }));
            listBox.appendChild(h('div', { class: 'rowitem' },
              h('div', null, o.category ? h('span', { class: 'tag', text: o.category }) : null, o.type ? h('span', { class: 'tag', text: o.type }) : null, o.risk ? h('span', { class: 'tag', text: 'الخطورة: ' + o.risk }) : null),
              h('div', { class: 'muted' }, ltr(o.time), [o.zone, o.shift].filter(Boolean).length ? ' · ' + [o.zone, o.shift].filter(Boolean).join(' · ') : ''),
              o.description ? h('div', { text: o.description }) : null,
              o.correctiveAction ? h('div', { class: 'muted', text: 'الإجراء التصحيحي: ' + o.correctiveAction }) : null,
              links.length ? h('div', null, links) : null));
          });
        }
        sel.addEventListener('change', draw);
        card.appendChild(sel); card.appendChild(listBox); draw();
      }
    }
    load();
  }


  // ======================= لوحة اليوم (صلاحية dashboard) =======================
  var DASH_LS = 'ptw_dash_cache';
  function nfmt(n) { return String(n === null || n === undefined ? 0 : n); }
  function countUp(el, to) {
    to = Number(to) || 0;
    if (!window.requestAnimationFrame || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || to === 0) { el.textContent = nfmt(to); return; }
    var t0 = null, dur = 650;
    function step(ts) {
      if (!el.isConnected) return;
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = nfmt(Math.round(to * e));
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, kids) {
    var el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }
  function ring(done, total) {
    var R = 52, C = 2 * Math.PI * R, pct = total ? done / total : 0;
    var arc = sv('circle', { cx: 70, cy: 70, r: R, fill: 'none', 'stroke-width': 14, 'stroke-linecap': 'round', class: 'ring-fg', transform: 'rotate(-90 70 70)', 'stroke-dasharray': C.toFixed(1), 'stroke-dashoffset': C.toFixed(1) });
    var svg = sv('svg', { viewBox: '0 0 140 140', class: 'ring', role: 'img', 'aria-label': 'نسبة الإغلاق ' + Math.round(pct * 100) + '%' }, [
      sv('circle', { cx: 70, cy: 70, r: R, fill: 'none', 'stroke-width': 14, class: 'ring-bg' }), arc]);
    var t = sv('text', { x: 70, y: 76, 'text-anchor': 'middle', class: 'ring-t' }); t.textContent = total ? Math.round(pct * 100) + '%' : '-';
    svg.appendChild(t);
    setTimeout(function () { arc.setAttribute('stroke-dashoffset', (C * (1 - pct)).toFixed(1)); }, 60);
    return svg;
  }
  function hoursChart(hours, curHour) {
    var W = 336, H = 150, padB = 20, padT = 8, bw = 5.5, gap = (W - 24 * bw * 2) / 24;
    var max = 1; hours.forEach(function (x) { max = Math.max(max, x.o, x.c); });
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'hchart', role: 'img', 'aria-label': 'النشاط بالساعة' });
    [0.5, 1].forEach(function (f) {
      var y = H - padB - (H - padB - padT) * f;
      svg.appendChild(sv('line', { x1: 0, x2: W, y1: y, y2: y, class: 'grid' }));
    });
    hours.forEach(function (x, i) {
      var x0 = i * (bw * 2 + gap) + gap / 2;
      var hO = (H - padB - padT) * x.o / max, hC = (H - padB - padT) * x.c / max;
      if (curHour === i) svg.appendChild(sv('rect', { x: x0 - 2, y: padT, width: bw * 2 + 4, height: H - padB - padT, rx: 4, class: 'nowband' }));
      if (x.o) svg.appendChild(sv('rect', { x: x0, y: H - padB - hO, width: bw, height: hO, rx: 2, class: 'bar-o' }));
      if (x.c) svg.appendChild(sv('rect', { x: x0 + bw, y: H - padB - hC, width: bw, height: hC, rx: 2, class: 'bar-c' }));
      if (i % 3 === 0) { var tx = sv('text', { x: x0 + bw, y: H - 5, 'text-anchor': 'middle', class: 'ax' }); tx.textContent = i; svg.appendChild(tx); }
    });
    var wrap = h('div', { class: 'hwrap', dir: 'ltr' }); wrap.appendChild(svg); return wrap;
  }
  function barRows(rows, max) {
    return h('div', { class: 'brows' }, rows.map(function (r) {
      return h('div', { class: 'brow' },
        h('div', { class: 'bl' }, h('span', { class: 'bn', text: r.name }), h('span', { class: 'bv' }, r.value)),
        h('div', { class: 'bt' }, r.parts.map(function (p) { return h('i', { class: p.cls, style: 'width:' + Math.max(p.n ? 3 : 0, Math.round(100 * p.n / (max || 1))) + '%' }); })));
    }));
  }

  // ---------- v1.7: أدوات لوحة الأيام والإحصائيات الجديدة ----------
  var WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  function isDateStr(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
  function dayName(ds) { if (!isDateStr(ds)) return ''; var p = ds.split('-'); return WEEKDAYS[new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12).getDay()]; }
  function shiftDay(ds, n) {
    var p = ds.split('-'), d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n, 12);
    function z(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }
  function localToday() { return shiftDay((function () { var d = new Date(), z = function (x) { return (x < 10 ? '0' : '') + x; }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); })(), 0); }

  /** قائمة ترتيب موظفين (أعلى N): الرتبة + الاسم (رابط لتقرير الموظف للمدير) + العدد + شريط */
  function topList(items, unit, cls) {
    if (!items || !items.length) return h('div', { class: 'muted', style: 'text-align:center;padding:8px', text: 'ما فيه بيانات بهذا ' + dashWord + '.' });
    var mx = items[0].n || 1, adm = has('admin');
    return h('div', { class: 'toplist' }, items.map(function (e, i) {
      var nm = e.name || e.id || '-';
      var nameNode = (adm && e.id) ? h('a', { class: 'tn', href: '#/emp/' + encodeURIComponent(e.id) }, nm) : h('span', { class: 'tn', text: nm });
      return h('div', { class: 'trow' },
        h('span', { class: 'rk r' + (i < 3 ? i + 1 : 'x'), text: i + 1 }),
        h('div', { class: 'tb' },
          h('div', { class: 'tl' }, nameNode, h('span', { class: 'tv', text: e.n + (unit ? ' ' + unit : '') })),
          h('div', { class: 'bt' }, h('i', { class: cls || 'po', style: 'width:' + Math.max(4, Math.round(100 * e.n / mx)) + '%' }))));
    }));
  }
  function leadersText(ls) { return (ls && ls.length) ? ls.map(function (e) { return e.name || e.id; }).join('، ') + ' · ' + ls[0].n : '-'; }

  function topsCards(S) {
    var out = [];
    function sum(l) { var t = 0; (l || []).forEach(function (e) { t += e.n; }); return t; }
    function ttl(w, l) { return w + (l && l.length ? ' (' + l.length + ' موظف · ' + sum(l) + ' تصريح)' : ''); }
    out.push(h('section', { class: 'card' }, h('h2', { text: ttl('الموظفين اللي فتحوا تصاريح', S.openers) }), topList(S.openers, 'تصريح', 'po')));
    var cl = h('section', { class: 'card' }, h('h2', { text: ttl('الموظفين اللي أغلقوا تصاريح', S.closers) }), topList(S.closers, 'تصريح', 'pc'));
    if (S.bulkClosed) cl.appendChild(h('div', { class: 'muted', style: 'margin-top:8px;font-size:13px', text: 'ما يشمل ' + S.bulkClosed + ' إغلاق جماعي بالنظام.' }));
    out.push(cl);
    return out;
  }
  function photosCard(P) {
    var card = h('section', { class: 'card' }, h('h2', { text: 'رفع الصور' }));
    if (!P || !P.uploads) { card.appendChild(emptyNote('ما فيه رفع صور بهذا ' + dashWord + '.')); return card; }
    var R = P.sections.rounds;
    card.appendChild(h('div', { class: 'phead' }, h('b', { text: P.uploads }), ' رفعة', R.files ? h('span', { class: 'muted', text: ' · ' + R.files + ' ملف جولات' }) : null));
    if (P.byEmp && P.byEmp.length) {
      card.appendChild(h('div', { class: 'sub2', text: 'كل موظف: عمليات الرفع وعدد الملفات (' + P.byEmp.length + ' موظف · ' + (P.totalFiles || 0) + ' ملف)' }));
      var adm = has('admin');
      var tb = h('div', { class: 'etab' }, h('div', { class: 'erow eh' }, h('span', { class: 'en', text: 'الموظف' }), h('span', { class: 'ev', text: 'رفعات' }), h('span', { class: 'ev', text: 'ملفات' })));
      P.byEmp.forEach(function (e) {
        var nm = e.name || e.id || '-';
        var nn = (adm && e.id) ? h('a', { class: 'en tn', href: '#/emp/' + encodeURIComponent(e.id) }, nm) : h('span', { class: 'en', text: nm });
        var parts = [e.open ? 'فتح ' + e.open : '', e.close ? 'إغلاق ' + e.close : '', e.rounds ? 'جولات ' + e.rounds : ''].filter(Boolean).join(' · ');
        tb.appendChild(h('div', { class: 'erow' }, h('span', { class: 'en2' }, nn, h('small', { class: 'muted', text: parts })), h('span', { class: 'ev', text: e.uploads }), h('span', { class: 'ev', text: e.files })));
      });
      card.appendChild(tb);
    } else {
      card.appendChild(h('div', { class: 'sub2', text: 'الأكثر مشاركة (عام)' }));
      card.appendChild(topList(P.top, 'رفعة', 'po'));
    }
    card.appendChild(h('div', { class: 'sub2', text: 'الأكثر رفعاً في كل قسم' }));
    var secs = h('div', { class: 'secs' });
    [['open', 'صور فتح التصاريح', P.sections.open], ['close', 'صور إغلاق التصاريح', P.sections.close], ['rounds', 'صور الجولات', R]].forEach(function (s) {
      secs.appendChild(h('div', { class: 'secrow' }, h('span', { class: 'k', text: s[1] + (s[2].total ? ' (' + s[2].total + ')' : '') }), h('span', { class: 'v', text: leadersText(s[2].leaders) })));
    });
    card.appendChild(secs);
    if (R.byType && R.byType.length) {
      var det = h('details', { class: 'fold2' }, h('summary', { text: 'الجولات حسب نوع الجولة (' + R.byType.length + ')' }));
      R.byType.forEach(function (t) { det.appendChild(h('div', { class: 'secrow' }, h('span', { class: 'k', text: t.type + ' (' + t.total + ')' }), h('span', { class: 'v', text: leadersText(t.leaders) }))); });
      card.appendChild(det);
    }
    card.appendChild(h('div', { class: 'muted', style: 'margin-top:8px;font-size:13px', text: 'الرفعة = عملية رفع وحدة. الملفات: بالجولات كل صورة ملف، وبرفع التصاريح الملف المدمج (PDF الصور) + أي مرفقات إضافية (عدد الصور داخل الـPDF المدمج غير مسجّل).' }));
    return card;
  }
  function dayCard(Y, title, sub) {
    var pend = Y.pending || [];
    var pendBox = h('div', { class: 'pend', hidden: true }, pend.map(function (p) {
      return h('div', { class: 'pitem' }, h('div', null, h('b', null, ltr(p.ptw)), p.company ? ' · ' + p.company : ''),
        h('div', { class: 'muted' }, [p.location, p.by ? ' · فتحه ' + p.by : '', ' · ', ltr(String(p.time).substring(11, 16))]));
    }));
    var pbtn = Y.stillOpen ? h('button', { class: 'btn ghost sm', type: 'button', style: 'margin-top:12px', onclick: function () { pendBox.hidden = !pendBox.hidden; pbtn.textContent = pendBox.hidden ? 'عرض اللي ما قفله موظف (' + Y.stillOpen + ')' : 'إخفاء القائمة'; } }, 'عرض اللي ما قفله موظف (' + Y.stillOpen + ')') : null;
    return h('section', { class: 'card ycard' },
      h('div', { class: 'ytitle' }, h('h2', { text: title }), h('span', { class: 'muted' }, ltr(Y.date))),
      h('div', { class: 'yrow' }, ring(Y.closedOfOpened, Y.opened),
        h('div', { class: 'ytext' },
          h('div', { class: 'ybig' }, h('b', { text: Y.opened }), ' انفتحت'),
          h('div', { class: 'ybig ok' }, h('b', { text: Y.closedOfOpened }), ' قفلها موظف'),
          h('div', { class: 'ybig ' + (Y.stillOpen ? 'bad' : 'ok') }, h('b', { text: Y.stillOpen }), ' انقفلت تلقائي (ما قفلها موظف)'),
          h('div', { class: 'muted', style: 'margin-top:6px' }, sub || 'كل يوم بيومه: اللي ما قفله موظف نهاية اليوم ينحسب انقفل تلقائي.'))),
      pbtn, pendBox);
  }
  function chartsCards(T, cur, dayWord) {
    var out = [];
    out.push(h('section', { class: 'card' }, h('h2', { text: 'نشاط ' + dayWord + ' بالساعة' }),
      hoursChart(T.hours, cur),
      h('div', { class: 'legend' }, h('span', null, h('i', { class: 'lg o' }), 'فتح'), h('span', null, h('i', { class: 'lg c' }), 'إغلاق'))));
    var shifts = Object.keys(T.byShift || {});
    if (shifts.length) {
      var mx = 1; shifts.forEach(function (k) { mx = Math.max(mx, T.byShift[k].o + T.byShift[k].c); });
      out.push(h('section', { class: 'card' }, h('h2', { text: 'حسب الوردية (' + dayWord + ')' }),
        barRows(shifts.map(function (k) { var s = T.byShift[k]; return { name: k, value: s.o + ' فتح · ' + s.c + ' إغلاق', parts: [{ cls: 'po', n: s.o }, { cls: 'pc', n: s.c }] }; }), mx)));
    }
    if (T.topCompanies && T.topCompanies.length) {
      var mc = T.topCompanies[0].n;
      var tc = 0; T.topCompanies.forEach(function (c) { tc += c.n; });
      out.push(h('section', { class: 'card' }, h('h2', { text: 'الشركات اللي فتحت تصاريح ' + dayWord + ' (' + T.topCompanies.length + ' شركة · ' + tc + ' تصريح)' }),
        barRows(T.topCompanies.map(function (c) { return { name: c.name, value: c.n, parts: [{ cls: 'po', n: c.n }] }; }), mc)));
    }
    return out;
  }

  // v2.58: خريطة الازدحام (دور × زون) — نفس فكرة خريطة الموقع، من فتحات الفترة المختارة
  function heatCard(H, word) {
    var card = h('section', { class: 'card heatcard' }, h('h2', { text: 'خريطة الازدحام — الأدوار × الزونات' }));
    if (!H || !H.rows || (!H.rows.length && !H.facades.length && !H.places.length && !H.none)) {
      card.appendChild(emptyNote('ما فيه فتحات مصنّفة بدور وزون بهذا ' + dashWord + '.'));
      return card;
    }
    var cols = [1, 2, 3, 4, 5], hasNz = H.nz > 0, mx = Math.max(H.max || 0, 1);
    // أبرز المواضع
    var cells = [];
    H.rows.forEach(function (r) {
      r.z.forEach(function (n, i) { if (n) cells.push({ n: n, t: r.lv + ' · زون ' + (i + 1) }); });
      if (r.nz) cells.push({ n: r.nz, t: r.lv + ' · بدون زون' });
    });
    cells.sort(function (a, b) { return b.n - a.n; });
    var lvBest = H.rows.slice().sort(function (a, b) { return b.t - a.t; })[0];
    var zBest = -1; H.zones.forEach(function (n, i) { if (n && (zBest < 0 || n > H.zones[zBest])) zBest = i; });
    var hot = h('div', { class: 'hotline' });
    if (lvBest && lvBest.t) hot.appendChild(h('div', null, 'أكثر دور ضغط: ', h('b', { text: lvBest.lv }), ' (' + lvBest.t + ')'));
    if (zBest > -1) hot.appendChild(h('div', null, 'أكثر زون ضغط: ', h('b', { text: 'زون ' + (zBest + 1) }), ' (' + H.zones[zBest] + ')'));
    if (cells.length) hot.appendChild(h('div', null, 'أعلى نقطة: ', h('b', { text: cells[0].t }), ' (' + cells[0].n + ' تصريح)'));
    card.appendChild(hot);

    function cell(n, tot) {
      var a = n ? (0.12 + 0.78 * n / mx) : 0;
      var st = n ? 'background:rgba(226,92,48,' + a.toFixed(2) + ');' + (a > 0.5 ? 'color:#fff' : '') : '';
      return h('span', { class: 'hc' + (n ? '' : ' z'), style: st, text: n || '' });
    }
    var cls = 'hgrid' + (hasNz ? ' nz' : '');
    var grid = h('div', { class: cls });
    grid.appendChild(h('span', { class: 'hh hl' }));
    cols.forEach(function (z) { grid.appendChild(h('span', { class: 'hh', text: 'ز' + z })); });
    if (hasNz) grid.appendChild(h('span', { class: 'hh', text: 'بلا زون' }));
    grid.appendChild(h('span', { class: 'hh', text: 'مجموع' }));
    H.rows.forEach(function (r) {
      grid.appendChild(h('span', { class: 'hl', text: r.lv }));
      r.z.forEach(function (n) { grid.appendChild(cell(n)); });
      if (hasNz) grid.appendChild(cell(r.nz));
      grid.appendChild(h('span', { class: 'ht', text: r.t }));
    });
    grid.appendChild(h('span', { class: 'hl hb', text: 'المجموع' }));
    H.zones.forEach(function (n) { grid.appendChild(h('span', { class: 'ht hb', text: n })); });
    if (hasNz) grid.appendChild(h('span', { class: 'ht hb', text: H.nz }));
    var all = 0; H.zones.forEach(function (n) { all += n; }); all += H.nz;
    grid.appendChild(h('span', { class: 'ht hb', text: all }));
    if (H.rows.length) card.appendChild(h('div', { class: 'hwrap' }, grid));

    var extra = h('div', { class: 'hextra' });
    function chips(title, list) {
      if (!list || !list.length) return;
      extra.appendChild(h('div', { class: 'sub2', text: title }));
      var box = h('div', { class: 'chips2' });
      list.forEach(function (x) { box.appendChild(h('span', { class: 'chip2' }, x.name + ' ', h('b', { text: x.n }))); });
      extra.appendChild(box);
    }
    chips('الواجهات', H.facades);
    chips('أماكن خاصة', H.places);
    if (H.none) extra.appendChild(h('div', { class: 'muted', style: 'margin-top:6px', text: 'غير مصنّف (بدون دور ولا زون): ' + H.none }));
    card.appendChild(extra);
    card.appendChild(h('div', { class: 'muted', style: 'margin-top:8px;font-size:13px', text: 'كل خلية = عدد التصاريح اللي انفتحت بهذا الدور والزون خلال ' + dashWord + '، وكل ما غمق اللون زاد الضغط. التصريح اللي يغطي أكثر من دور أو زون ينحسب تحت كل واحد منهم، فالمجموع ممكن يكون أكبر من عدد التصاريح.' }));
    return card;
  }

  var dashWord = 'اليوم';  // كلمة الفترة بالنصوص (اليوم/الأسبوع/الشهر)
  var WEEK_START = 6;     // نفس APPDASH_WEEK_START_ بالخادم: 6=السبت (الجمعة راحة)
  var DAY_MEM = {};   // كاش جلسة لأيام سابقة (التنقل ذهاب وإياب يصير فوري)

  function weekStartC(ds) { var p = ds.split('-'), dow = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12).getDay(); return shiftDay(ds, -((dow - WEEK_START + 7) % 7)); }
  function monthStartC(ds) { return ds.substring(0, 8) + '01'; }
  function monthShiftC(ds, n) { var p = ds.split('-'), d = new Date(Number(p[0]), Number(p[1]) - 1 + n, 1, 12); function z(x) { return (x < 10 ? '0' : '') + x; } return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-01'; }
  function periodStartC(per, ds) { return per === 'week' ? weekStartC(ds) : monthStartC(ds); }
  function periodNextC(per, ds) { return per === 'week' ? shiftDay(weekStartC(ds), 7) : monthShiftC(ds, 1); }
  function periodPrevC(per, ds) { return per === 'week' ? shiftDay(weekStartC(ds), -7) : monthShiftC(ds, -1); }
  var PERIOD_AR = { day: 'يوم', week: 'أسبوع', month: 'شهر' };

  function pageDash(arg1, arg2) {
    var period = (arg1 === 'week' || arg1 === 'month') ? arg1 : 'day';
    var date = period === 'day' ? (isDateStr(arg1) ? arg1 : '') : (isDateStr(arg2) ? arg2 : '');
    var memKey = period === 'day' ? date : period + '|' + (date || 'cur');
    var box = h('div');
    shell('dash', 'لوحة اليوم', box);
    var timer = null, loading = false, serverToday = localToday();
    var cached = null;
    if (period === 'day' && !date) { try { cached = JSON.parse(lsGet(DASH_LS) || 'null'); } catch (e) {} }
    else if (DAY_MEM[memKey]) cached = DAY_MEM[memKey].res;

    function go(ds) {
      if (period === 'day') { location.hash = (ds && ds !== serverToday) ? '#/dash/' + ds : '#/dash'; return; }
      location.hash = (!ds || periodStartC(period, ds) === periodStartC(period, serverToday)) ? '#/dash/' + period : '#/dash/' + period + '/' + ds;
    }
    function switchPeriod(p) {
      var an = date || serverToday;
      if (p === 'day') location.hash = (date && date !== serverToday) ? '#/dash/' + date : '#/dash';
      else location.hash = (periodStartC(p, an) === periodStartC(p, serverToday)) ? '#/dash/' + p : '#/dash/' + p + '/' + an;
    }
    box.appendChild(h('div', { class: 'seg pseg' }, ['day', 'week', 'month'].map(function (p) {
      return h('button', { type: 'button', class: p === period ? 'on' : '', onclick: function () { if (p !== period) switchPeriod(p); } }, PERIOD_AR[p]);
    })));
    var body = h('div', { class: 'dbody' });
    var stamp = h('span', { class: 'muted', text: '' });
    var rbtn = h('button', { class: 'icon-btn rfs', type: 'button', 'aria-label': 'تحديث' }, h('span', { text: '↻' }));
    box.appendChild(h('div', { class: 'dash-head' }, stamp, rbtn));

    // شريط التنقل بين الأيام
    var shown = date || serverToday;
    var dateIn = h('input', { class: 'input datein', type: 'date', value: shown, max: serverToday, 'aria-label': 'اختر اليوم' });
    var dname = h('div', { class: 'dname', text: period === 'day' ? (date ? dayName(date) : 'اليوم') : (period === 'week' ? 'الأسبوع' : 'الشهر') });
    var prevB = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'السابق' }, icon('back'));
    function nextOff() { return period === 'day' ? (!date || date >= serverToday) : (periodNextC(period, date || serverToday) > serverToday); }
    var nextB = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'التالي', disabled: nextOff() }, icon('next'));
    var todayB = h('button', { class: 'pill sm', type: 'button', hidden: !date }, period === 'day' ? 'اليوم' : 'الحالي');
    prevB.addEventListener('click', function () { go(period === 'day' ? shiftDay(date || serverToday, -1) : periodPrevC(period, date || serverToday)); });
    nextB.addEventListener('click', function () { go(period === 'day' ? shiftDay(date || serverToday, 1) : periodNextC(period, date || serverToday)); });
    todayB.addEventListener('click', function () { go(''); });
    dateIn.addEventListener('change', function () { if (isDateStr(dateIn.value)) go(dateIn.value > serverToday ? serverToday : dateIn.value); });
    box.appendChild(h('div', { class: 'datebar' }, prevB, h('div', { class: 'dmid' }, dateIn, dname), nextB, todayB));

    // طباعة اللوحة: رأس يظهر بالطباعة فقط + زر واضح. قبل الطباعة نفتح كل الأقسام المطوية عشان تطلع كاملة.
    var phT = h('div', { class: 'pht', text: 'لوحة تصاريح العمل' }), phS = h('div', { class: 'phs', text: '' });
    box.insertBefore(h('div', { class: 'printhead' }, phT, phS), box.firstChild);
    function setPH(d) {
      var ds = d.mode === 'day' ? d.date : (d.date || (d.today && d.today.date)) || '';
      var n = new Date(), z = function (x) { return (x < 10 ? '0' : '') + x; };
      phT.textContent = d.mode === 'range' ? ('لوحة تصاريح العمل - ' + (d.period === 'month' ? 'الشهر ' : 'الأسبوع ') + rangeLabel(d) + ' (' + d.from + ' إلى ' + d.to + ')') : ('لوحة تصاريح العمل - ' + (d.mode === 'day' ? dayName(ds) + ' ' : 'اليوم ') + ds);
      phS.textContent = 'طُبعت: ' + n.getFullYear() + '-' + z(n.getMonth() + 1) + '-' + z(n.getDate()) + ' ' + z(n.getHours()) + ':' + z(n.getMinutes()) + (S.user ? ' - ' + S.user.name : '');
    }
    var opened = [];
    function prepPrint() {
      if (opened.length) return;
      box.querySelectorAll('details:not([open])').forEach(function (d) { d.setAttribute('open', ''); opened.push(d); });
    }
    function donePrint() {
      opened.forEach(function (n) { if (n.tagName === 'DETAILS') n.removeAttribute('open'); else n.hidden = true; });
      opened = [];
    }
    var onBP = function () { if (box.isConnected) prepPrint(); }, onAP = function () { donePrint(); };
    window.addEventListener('beforeprint', onBP); window.addEventListener('afterprint', onAP);
    var pbtnAll = h('button', { class: 'btn printbtn', type: 'button', onclick: function () { prepPrint(); setTimeout(function () { window.print(); }, 60); } }, icon('print'), 'طباعة اللوحة');
    box.appendChild(pbtnAll);
    box.appendChild(body);

    function skeleton() {
      clear(body);
      for (var i = 0; i < 3; i++) body.appendChild(h('div', { class: 'card sk' }, h('div', { class: 'skl w60' }), h('div', { class: 'skl w90' }), h('div', { class: 'skl w40' })));
    }
    function syncBar(d) {
      var st = (d.mode === 'day' || d.mode === 'range') ? d.today : (d.date || (d.today && d.today.date));
      if (isDateStr(st)) { serverToday = st; dateIn.max = serverToday; }
      nextB.disabled = nextOff();
      if (!date) dateIn.value = serverToday;
      if (d.mode === 'range') dname.textContent = rangeLabel(d);
    }

    function drawToday(d, fromCache) {
      clear(body); dashWord = 'اليوم';
      var T = d.today, Y = d.yesterday, N = d.now || {};
      var cur = parseInt((d.generatedAt || '').substring(11, 13), 10);
      stamp.textContent = (fromCache ? 'آخر نسخة محفوظة · ' : 'تحدّثت ') + (d.generatedAt || '').substring(11, 16);

      var nOpen = h('div', { class: 'big', text: '0' }), nClosed = h('div', { class: 'big', text: '0' }), nNow = h('div', { class: 'big', text: '0' });
      body.appendChild(h('section', { class: 'hero' },
        h('div', { class: 'hero-top' }, h('b', { text: 'اليوم · ' + dayName(T.date) }), h('span', null, ltr(T.date))),
        h('div', { class: 'trio' },
          h('div', { class: 'kp o' }, nOpen, h('div', { class: 'kl', text: 'انفتحت' })),
          h('div', { class: 'kp c' }, nClosed, h('div', { class: 'kl', text: 'انقفلت' })),
          h('div', { class: 'kp n' }, nNow, h('div', { class: 'kl', text: 'مفتوحة الحين' }))),
        h('div', { class: 'hero-foot' },
          T.opened ? ('نهاية اليوم اللي ما قفله موظف ينحسب انقفل تلقائي ويبدأ اليوم الجديد من صفر' + (T.flagged ? ' · ' + T.flagged + ' بتنبيه' : '')) : 'ما انفتح شي لين الحين')));
      countUp(nOpen, T.opened); countUp(nClosed, T.closed); countUp(nNow, N.openNow);

      if (N.validNotOpened || N.overdue) {
        body.appendChild(h('div', { class: 'alerts' },
          N.validNotOpened ? h('div', { class: 'al' }, h('b', { text: N.validNotOpened }), ' سارية ولم تُفتح اليوم') : null,
          N.overdue ? h('div', { class: 'al' }, h('b', { text: N.overdue }), N.overdueDays ? ' ما قفلها موظف (آخر ' + N.overdueDays + ' أيام)' : ' ما قفلها موظف (أيام سابقة)') : null));
      }
      body.appendChild(dayCard(Y, 'أمس · ' + dayName(Y.date)));
      chartsCards(T, cur, 'اليوم').forEach(function (c) { body.appendChild(c); });
      body.appendChild(heatCard(T.heat));
      topsCards(T).forEach(function (c) { body.appendChild(c); });
      body.appendChild(photosCard(T.photos));
      body.appendChild(h('div', { class: 'muted', style: 'text-align:center;padding:6px 0 2px' }, 'العدّ بعدد العمليات المسجّلة، وكل يوم محسوب بيومه.'));
    }

    function rangeLabel(d) {
      if (d.period === 'month') { var p = d.from.split('-'); return MONTHS[Number(p[1])] + ' ' + p[0]; }
      return 'من ' + dayName(d.from) + ' ' + d.from.substring(5) + ' إلى ' + dayName(d.to) + ' ' + d.to.substring(5);
    }
    function drawRange(d, fromCache) {
      clear(body);
      var S = d.range, word = d.period === 'month' ? 'الشهر' : 'الأسبوع';
      dashWord = word;
      stamp.textContent = (fromCache ? 'نسخة محفوظة · ' : 'تحدّثت ') + (d.generatedAt || '').substring(11, 16);
      var nOpen = h('div', { class: 'big', text: '0' }), nClosed = h('div', { class: 'big', text: '0' }), nAuto = h('div', { class: 'big', text: '0' });
      body.appendChild(h('section', { class: 'hero' },
        h('div', { class: 'hero-top' }, h('b', { text: word }), h('span', null, ltr(d.from.substring(5) + ' ← ' + d.to.substring(5)), d.partial ? ' · حتى اليوم' : '')),
        h('div', { class: 'trio' },
          h('div', { class: 'kp o' }, nOpen, h('div', { class: 'kl', text: 'انفتحت' })),
          h('div', { class: 'kp c' }, nClosed, h('div', { class: 'kl', text: 'انقفلت' })),
          h('div', { class: 'kp n' }, nAuto, h('div', { class: 'kl', text: 'انقفلت تلقائي' }))),
        h('div', { class: 'hero-foot' }, S.opened || S.closed ? ('مجموع ' + S.days + ' يوم، كل يوم محسوب بيومه' + (S.flagged ? ' · ' + S.flagged + ' بتنبيه' : '')) : 'ما فيه عمليات مسجّلة بهذه الفترة')));
      countUp(nOpen, S.opened); countUp(nClosed, S.closed); countUp(nAuto, S.stillOpen);
      if (S.opened) {
        body.appendChild(h('section', { class: 'card ycard' }, h('div', { class: 'ytitle' }, h('h2', { text: 'قفل التصاريح (' + word + ' كامل)' })),
          h('div', { class: 'yrow' }, ring(S.closedOfOpened, S.opened),
            h('div', { class: 'ytext' },
              h('div', { class: 'ybig' }, h('b', { text: S.opened }), ' انفتحت'),
              h('div', { class: 'ybig ok' }, h('b', { text: S.closedOfOpened }), ' قفلها موظف'),
              h('div', { class: 'ybig ' + (S.stillOpen ? 'bad' : 'ok') }, h('b', { text: S.stillOpen }), ' انقفلت تلقائي (ما قفلها موظف)')))));
      }
      if (S.byDay && S.byDay.length > 1) {
        var mx = 1; S.byDay.forEach(function (x) { mx = Math.max(mx, x.o + x.c); });
        body.appendChild(h('section', { class: 'card' }, h('h2', { text: 'يوم بيوم' }),
          barRows(S.byDay.map(function (x) {
            return { name: dayName(x.date) + ' ' + x.date.substring(5), value: x.o + ' فتح · ' + x.c + ' إغلاق' + (x.auto ? ' · ' + x.auto + ' تلقائي' : ''), parts: [{ cls: 'po', n: x.o }, { cls: 'pc', n: x.c }] };
          }), mx)));
      }
      chartsCards(S, -1, word).forEach(function (c) { body.appendChild(c); });
      body.appendChild(heatCard(S.heat));
      topsCards(S).forEach(function (c) { body.appendChild(c); });
      body.appendChild(photosCard(S.photos));
    }

    function drawDay(d, fromCache) {
      clear(body); dashWord = 'اليوم';
      var S = d.day;
      stamp.textContent = (fromCache ? 'نسخة محفوظة · ' : 'تحدّثت ') + (d.generatedAt || '').substring(11, 16);
      var nOpen = h('div', { class: 'big', text: '0' }), nClosed = h('div', { class: 'big', text: '0' }), nAuto = h('div', { class: 'big', text: '0' });
      body.appendChild(h('section', { class: 'hero' },
        h('div', { class: 'hero-top' }, h('b', { text: dayName(S.date) }), h('span', null, ltr(S.date))),
        h('div', { class: 'trio' },
          h('div', { class: 'kp o' }, nOpen, h('div', { class: 'kl', text: 'انفتحت' })),
          h('div', { class: 'kp c' }, nClosed, h('div', { class: 'kl', text: 'انقفلت' })),
          h('div', { class: 'kp n' }, nAuto, h('div', { class: 'kl', text: 'انقفلت تلقائي' }))),
        h('div', { class: 'hero-foot' }, S.opened || S.closed ? ('إحصائيات هذا اليوم بيومه' + (S.flagged ? ' · ' + S.flagged + ' بتنبيه' : '')) : 'ما فيه عمليات مسجّلة بهذا اليوم')));
      countUp(nOpen, S.opened); countUp(nClosed, S.closed); countUp(nAuto, S.stillOpen);
      if (S.opened) body.appendChild(dayCard(S, 'قفل التصاريح', 'اللي ما قفله موظف نهاية هذا اليوم انحسب انقفل تلقائي.'));
      chartsCards(S, -1, 'اليوم').forEach(function (c) { body.appendChild(c); });
      body.appendChild(heatCard(S.heat));
      topsCards(S).forEach(function (c) { body.appendChild(c); });
      body.appendChild(photosCard(S.photos));
    }

    function draw(d, fromCache) {
      syncBar(d); setPH(d);
      if (d.mode === 'range') drawRange(d, fromCache); else if (d.mode === 'day') drawDay(d, fromCache); else drawToday(d, fromCache);
    }

    function load(force) {
      if (loading) return; loading = true;
      rbtn.classList.add('spin');
      call('getAppDashboard', !!force, date, period).then(function (res) {
        loading = false; rbtn.classList.remove('spin');
        if (!box.isConnected) return;
        if (res && res.ok) {
          if (period !== 'day' || date) DAY_MEM[memKey] = { res: res, at: Date.now() }; else lsSet(DASH_LS, JSON.stringify(res));
          draw(res, false); return;
        }
        if (res && res.code === 'AUTH') return;
        var msg = (res && res.code === 'API_FN') ? 'النسخة المنشورة من Apps Script قديمة. الصق AppDashboard.gs وApi.gs وانشر نسخة جديدة.' : ((res && res.message) || 'تعذر جلب اللوحة.');
        if (!cached) { clear(body); body.appendChild(h('div', { class: 'msg err', text: msg })); body.appendChild(h('button', { class: 'btn', style: 'margin-top:12px', type: 'button', onclick: function () { skeleton(); load(true); } }, 'إعادة المحاولة')); }
        else toast(msg);
      });
    }
    rbtn.addEventListener('click', function () { load(true); });
    var modeOk = cached && cached.ok && (period !== 'day' ? cached.mode === 'range' : ((date && cached.mode === 'day') || (!date && cached.mode !== 'day' && cached.mode !== 'range')));
    if (modeOk) {
      draw(cached, true);
      // فترة/يوم سابق محفوظ بالجلسة وعمره أقل من دقيقتين: ما نعيد الجلب
      if ((date || period !== 'day') && DAY_MEM[memKey] && Date.now() - DAY_MEM[memKey].at < 120000) { /* نكتفي بالمحفوظ */ } else load(false);
    } else { skeleton(); load(false); }
    if (!date) {
      timer = setInterval(function () {
        if (!box.isConnected) { clearInterval(timer); return; }
        if (!document.hidden) load(false);
      }, 60000);
    }
  }

  // ======================= v1.5: معرض الصور / الاجتماعات / تقرير موظف / ملاحظات السلامة =======================
  function pageHead(title, sub, cls) {
    return h('section', { class: 'phero ' + (cls || '') }, h('a', { class: 'pback', href: '#/home', 'aria-label': 'الرئيسية' }, icon('back')), h('div', null, h('h2', { text: title }), sub ? h('p', { text: sub }) : null));
  }
  function field(label, node) { return h('div', { class: 'field' }, h('label', { text: label }), node); }
  function errMsg(box, t) { box.className = 'msg err'; box.textContent = t; box.hidden = false; }
  function openLink(url, text) { return h('a', { class: 'lnk', href: safeUrl(url) || '#', target: '_blank', rel: 'noopener' }, text || 'فتح'); }
  function emptyNote(t) { return h('div', { class: 'empty' }, h('div', { class: 'em-ic', text: '∅' }), h('div', { text: t })); }

  // ---------- المعرض (صلاحية dashboard) ----------
  var G_KINDS = [['all', 'الكل'], ['permit_open', 'فتح تصاريح'], ['permit_close', 'إغلاق تصاريح'], ['round', 'جولات']];
  var G_KIND_AR = { permit_open: 'فتح', permit_close: 'إغلاق', round: 'جولة' };
  function pageGallery() {
    var box = h('div'); shell('home', 'معرض الصور', box);
    box.appendChild(pageHead('معرض الصور', 'صور التصاريح والجولات', 'g'));
    var f = { kind: 'all', roundType: '', q: '', dateFrom: '', dateTo: '' };
    var offset = 0, total = 0, busy = false, LIMIT = 24;
    var seg = h('div', { class: 'pills' });
    var q = h('input', { class: 'input', type: 'search', placeholder: 'بحث: رقم تصريح أو اسم أو وصف' });
    var d1 = h('input', { class: 'input', type: 'date' }), d2 = h('input', { class: 'input', type: 'date' });
    var rt = h('select', { class: 'input' }, h('option', { value: '', text: 'كل أنواع الجولات' }));
    var grid = h('div', { class: 'ggrid' }), more = h('button', { class: 'btn ghost', type: 'button', hidden: true }, 'عرض المزيد'), info = h('div', { class: 'muted', style: 'margin:6px 2px' });
    function drawSeg() {
      clear(seg);
      G_KINDS.forEach(function (k) { seg.appendChild(h('button', { type: 'button', class: 'pill' + (f.kind === k[0] ? ' on' : ''), onclick: function () { f.kind = k[0]; drawSeg(); load(true); } }, k[1])); });
    }
    box.appendChild(h('div', { class: 'card' }, seg, h('div', { class: 'row', style: 'margin-top:12px' }, field('من', d1), field('إلى', d2)), field('نوع الجولة', rt), q));
    box.appendChild(info); box.appendChild(grid); box.appendChild(more);
    var qt = null;
    q.addEventListener('input', function () { clearTimeout(qt); qt = setTimeout(function () { f.q = q.value.trim(); load(true); }, 400); });
    d1.addEventListener('change', function () { f.dateFrom = d1.value; load(true); });
    d2.addEventListener('change', function () { f.dateTo = d2.value; load(true); });
    rt.addEventListener('change', function () { f.roundType = rt.value; load(true); });
    more.addEventListener('click', function () { load(false); });
    function detail(it) {
      var rows = [['النوع', G_KIND_AR[it.kind] || it.kind], ['الوقت', it.time], ['الموظف', it.empName || it.empId], it.ptw ? ['التصريح', it.ptw] : null,
        it.roundType ? ['نوع الجولة', it.roundType] : null, it.levels ? ['الأدوار', it.levels] : null, it.zones ? ['الزونات', it.zones] : null, it.desc ? ['الوصف', it.desc] : null].filter(Boolean);
      var items = [{ node: h('div', { class: 'details' }, rows.map(function (r) { return h('div', { class: 'drow' }, h('span', { class: 'k', text: r[0] }), h('span', { class: 'v' }, r[0] === 'التصريح' ? ltr(r[1]) : String(r[1]))); })) }];
      var links = h('div', { class: 'row', style: 'margin-bottom:10px' });
      if (it.fileUrl) links.appendChild(h('a', { class: 'btn sm', href: safeUrl(it.fileUrl) || '#', target: '_blank', rel: 'noopener' }, 'فتح الملف'));
      if (it.folderUrl) links.appendChild(h('a', { class: 'btn sm ghost', href: safeUrl(it.folderUrl) || '#', target: '_blank', rel: 'noopener' }, 'المجلد'));
      items.push({ node: links });
      (it.extraUrls || []).slice(0, 8).forEach(function (u, i) { items.push({ node: openLink(u, 'ملف إضافي ' + (i + 1)) }); });
      openSheet(it.title || 'التفاصيل', items);
    }
    function card(it) {
      var th = h('div', { class: 'gth' });
      if (it.thumb && safeUrl(it.thumb)) {
        var im = h('img', { src: safeUrl(it.thumb), loading: 'lazy', alt: '', referrerpolicy: 'no-referrer' });
        im.addEventListener('error', function () { im.remove(); th.appendChild(h('span', { class: 'gph', text: '▣' })); });
        th.appendChild(im);
      } else th.appendChild(h('span', { class: 'gph', text: '▣' }));
      th.appendChild(h('span', { class: 'gk k-' + it.kind, text: G_KIND_AR[it.kind] || '' }));
      return h('button', { class: 'gcard', type: 'button', onclick: function () { detail(it); } }, th,
        h('div', { class: 'gmeta' }, h('b', null, it.ptw ? ltr(it.ptw) : (it.title || '')), h('small', { text: (it.empName || '') + ' · ' + String(it.time || '').substring(5, 16) })));
    }
    function load(reset) {
      if (busy) return; busy = true;
      if (reset) { offset = 0; clear(grid); for (var i = 0; i < 6; i++) grid.appendChild(h('div', { class: 'gcard sk' }, h('div', { class: 'gth skl' }))); more.hidden = true; }
      more.disabled = true;
      call('getGalleryData', { kind: f.kind, roundType: f.roundType, q: f.q, dateFrom: f.dateFrom, dateTo: f.dateTo, limit: LIMIT, offset: offset }).then(function (res) {
        busy = false; more.disabled = false; if (!grid.isConnected) return;
        if (reset) clear(grid);
        if (!res || !res.ok) { if (res && res.code === 'AUTH') return; grid.appendChild(h('div', { class: 'msg err', style: 'grid-column:1/-1', text: (res && res.message) || 'تعذر جلب المعرض.' })); return; }
        if (res.roundTypes && rt.options.length === 1) res.roundTypes.forEach(function (t) { rt.appendChild(h('option', { value: t, text: t })); });
        (res.items || []).forEach(function (it) { grid.appendChild(card(it)); });
        offset += (res.items || []).length; total = res.total || 0;
        info.textContent = total ? ('النتائج: ' + total) : '';
        if (!total) grid.appendChild(h('div', { style: 'grid-column:1/-1' }, emptyNote('ما فيه صور بهالفلتر.')));
        more.hidden = offset >= total;
      });
    }
    drawSeg(); load(true);
  }

  // ---------- الاجتماعات (صلاحية dashboard) ----------
  function nowLocalDT() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function pageMeetings(sub) {
    var box = h('div'); shell('home', 'الاجتماعات', box);
    box.appendChild(pageHead('الاجتماعات', 'محاضر الاجتماعات وسجلها', 'm'));
    var seg = h('div', { class: 'seg' },
      h('button', { type: 'button', class: sub === 'log' ? '' : 'on', onclick: function () { location.hash = '#/meetings'; } }, 'اجتماع جديد'),
      h('button', { type: 'button', class: sub === 'log' ? 'on' : '', onclick: function () { location.hash = '#/meetings/log'; } }, 'السجل'));
    box.appendChild(seg);
    var body = h('div'); box.appendChild(body);
    if (sub === 'log') return meetingsLog(body);
    meetingForm(body);
  }
  function meetingsLog(body) {
    body.appendChild(spinnerBlock('جاري جلب السجل...'));
    var shownM = false;
    swr('getRecentMeetings', [{ limit: 60 }], function (res) {
      if (!body.isConnected) return;
      if (res && res.ok) shownM = true; else if (shownM) return;
      clear(body);
      if (!res || !res.ok) { if (res && res.code === 'AUTH') return; return body.appendChild(h('div', { class: 'msg err', text: (res && res.message) || 'تعذر جلب السجل.' })); }
      if (!res.meetings.length) return body.appendChild(emptyNote('ما فيه اجتماعات مسجلة لين الحين.'));
      res.meetings.forEach(function (m) {
        var parts = [m.dateTime, m.place, m.attendeesCount + ' حاضر', m.itemsCount ? m.itemsCount + ' بند' : '', m.photosCount ? m.photosCount + ' صورة' : '', m.empName ? 'سجّله: ' + m.empName : ''].filter(Boolean);
        body.appendChild(h('div', { class: 'mcard' }, h('div', { class: 'mno' }, ltr(m.meetingNo)), h('div', { class: 'mbody' }, h('b', { text: m.project || '-' }), h('div', { class: 'sub', text: m.topic || '' }), h('div', { class: 'sub', text: parts.join(' · ') }), m.fileUrl ? openLink(m.fileUrl, 'فتح المحضر PDF') : null)));
      });
    });
  }
  function meetingForm(body) {
    var P = h('input', { class: 'input', maxlength: '200' }), I = h('input', { class: 'input', maxlength: '200' }), D = h('input', { class: 'input', type: 'datetime-local', value: nowLocalDT() });
    var PL = h('input', { class: 'input', maxlength: '200' }), T = h('textarea', { class: 'input', maxlength: '500' });
    var att = h('div'), its = h('div');
    function rowEl(host, fields, ph) {
      var inputs = fields.map(function (k, i) { var el = h('input', { class: 'input sm', placeholder: ph[i], maxlength: '300' }); el.dataset.k = k; return el; });
      var row = h('div', { class: 'mrow' }, h('div', { class: 'mfields' }, inputs), h('button', { type: 'button', class: 'rm', 'aria-label': 'حذف', onclick: function () { row.remove(); } }, '×'));
      host.appendChild(row); return row;
    }
    function read(host, fields) {
      var out = []; Array.prototype.forEach.call(host.children, function (row) {
        var o = {}, any = false; fields.forEach(function (k) { var v = row.querySelector('[data-k="' + k + '"]').value.trim(); o[k] = v; if (v) any = true; }); if (any) out.push(o);
      }); return out;
    }
    for (var i = 0; i < 3; i++) rowEl(att, ['name', 'title'], ['الاسم', 'الوظيفة']);
    var files = h('input', { type: 'file', accept: 'image/*', multiple: true });
    var msg = h('div', { hidden: true }), go = h('button', { class: 'btn', type: 'button' }, 'حفظ المحضر'), busy = false;
    go.addEventListener('click', function () {
      if (busy) return; msg.hidden = true;
      var a = read(att, ['name', 'title']), it = read(its, ['item', 'action', 'owner']), fl = files.files ? Array.prototype.slice.call(files.files) : [];
      if (!P.value.trim()) return errMsg(msg, 'اكتب اسم المشروع.');
      if (!I.value.trim()) return errMsg(msg, 'اكتب الجهة الداعية للاجتماع.');
      if (!D.value) return errMsg(msg, 'حدد تاريخ ووقت الاجتماع.');
      if (!PL.value.trim()) return errMsg(msg, 'اكتب مكان الاجتماع.');
      if (!T.value.trim()) return errMsg(msg, 'اكتب موضوع الاجتماع.');
      if (!a.length) return errMsg(msg, 'أضف حاضر واحد على الأقل (اسم ووظيفة).');
      if (!fl.length) return errMsg(msg, 'ارفع صورة ورقة التوقيعات على الأقل.');
      if (fl.length > 15) return errMsg(msg, 'أقصى عدد صور 15.');
      busy = true; btnBusy(go, true);
      Promise.all(fl.map(filePayload)).then(function (ph) {
        return call('saveMeeting', { project: P.value.trim(), inviter: I.value.trim(), dateTime: D.value.replace('T', ' '), place: PL.value.trim(), topic: T.value.trim(), attendees: a, items: it, photos: ph.map(function (x) { return { data: x.data, mime: x.mime }; }) });
      }).then(function (res) {
        busy = false; btnBusy(go, false, 'حفظ المحضر');
        if (!res || !res.ok) { if (res && res.code === 'AUTH') return; return errMsg(msg, (res && res.message) || 'تعذر حفظ المحضر.'); }
        clear(body);
        body.appendChild(h('div', { class: 'card center' }, h('div', { class: 'okmark', text: '✓' }), h('h2', { text: 'تم حفظ المحضر' }), h('div', null, 'رقم الاجتماع: ', h('b', null, ltr(res.meetingNo))),
          res.fileUrl ? h('a', { class: 'btn', href: safeUrl(res.fileUrl) || '#', target: '_blank', rel: 'noopener' }, 'فتح المحضر (PDF)') : null,
          h('button', { class: 'btn ghost', type: 'button', onclick: function () { route(); } }, 'تسجيل اجتماع آخر')));
      }).catch(function (e) { busy = false; btnBusy(go, false, 'حفظ المحضر'); errMsg(msg, 'تعذر معالجة الصور: ' + (e && e.message ? e.message : 'خطأ غير معروف')); });
    });
    body.appendChild(h('div', { class: 'card' }, field('المشروع', P), field('الجهة الداعية للاجتماع', I), field('تاريخ ووقت الاجتماع', D), field('مكان الاجتماع', PL), field('موضوع الاجتماع', T)));
    body.appendChild(h('div', { class: 'card' }, h('h2', { text: 'الحضور' }), att, h('button', { type: 'button', class: 'btn ghost sm', onclick: function () { rowEl(att, ['name', 'title'], ['الاسم', 'الوظيفة']); } }, '+ إضافة حاضر')));
    body.appendChild(h('div', { class: 'card' }, h('h2', { text: 'بنود الاجتماع (اختياري)' }), its, h('button', { type: 'button', class: 'btn ghost sm', onclick: function () { rowEl(its, ['item', 'action', 'owner'], ['البند', 'الإجراء', 'المسؤول']); } }, '+ إضافة بند')));
    body.appendChild(h('div', { class: 'card' }, h('h2', { text: 'صور الاجتماع' }), h('div', { class: 'muted', style: 'margin-bottom:8px', text: 'ورقة التوقيعات بعد التوقيع أول شي، وأي صور إضافية. تتأرشف كلها بملف PDF واحد.' }), h('div', { class: 'file' }, files), go, msg));
  }

  // ---------- تقرير موظف (صلاحية admin) ----------
  var MONTHS_AR = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  function pageEmpReport(empId) {
    var box = h('div'); shell('home', 'تقرير موظف', box);
    box.appendChild(pageHead('تقرير موظف', 'كم فتح وكم قفل بالشهر', 'r'));
    if (empId) return empDetail(box, empId);
    var q = h('input', { class: 'input', type: 'search', placeholder: 'اسم الموظف أو رقمه الوظيفي' }), list = h('div');
    box.appendChild(h('div', { class: 'card' }, q)); box.appendChild(list);
    var t = null, seq = 0;
    function search() {
      var my = ++seq; clear(list); list.appendChild(spinnerBlock('بحث...'));
      call('searchEmployees', q.value.trim()).then(function (res) {
        if (my !== seq || !list.isConnected) return; clear(list);
        if (!res || !res.ok) { if (res && res.code === 'AUTH') return; return list.appendChild(h('div', { class: 'msg err', text: (res && res.message) || 'تعذر البحث.' })); }
        if (!res.results.length) return list.appendChild(emptyNote('ما لقيت أحد.'));
        res.results.forEach(function (e) { list.appendChild(h('button', { class: 'list-item', type: 'button', onclick: function () { location.hash = '#/emp/' + encodeURIComponent(e.empId); } }, h('b', { text: e.name }), h('div', { class: 'sub' }, ltr(e.empId), ' · ' + (e.role || '')))); });
      });
    }
    q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(search, 350); });
    search();
  }
  function empDetail(box, empId) {
    var body = h('div'), cur = { y: 0, m: 0 }, seq = 0; box.appendChild(body);
    function rankChip(rk) {
      if (!rk || !rk.rank) return h('div', { class: 'rkchip none', text: 'بدون ترتيب' });
      var top5 = rk.rank <= 5;
      return h('div', { class: 'rkchip' + (top5 ? ' top' : ''), text: (top5 ? '★ ضمن أعلى 5 · ' : '') + 'الترتيب ' + rk.rank + ' من ' + rk.of });
    }
    function load(y, m) {
      var my = ++seq;
      clear(body); body.appendChild(spinnerBlock('جاري تحميل التقرير...'));
      call('getEmployeeReport', empId, y || undefined, m || undefined).then(function (r) {
        if (my !== seq || !body.isConnected) return; clear(body);
        if (!r || !r.ok) { if (r && r.code === 'AUTH') return; body.appendChild(h('div', { class: 'msg err', text: (r && r.message) || 'تعذر جلب التقرير.' })); body.appendChild(h('a', { class: 'btn gray', href: '#/emp' }, 'رجوع')); return; }
        cur.y = r.year; cur.m = r.month;
        function step(d) { var m2 = r.month + d, y2 = r.year; if (m2 < 1) { m2 = 12; y2--; } if (m2 > 12) { m2 = 1; y2++; } load(y2, m2); }
        body.appendChild(h('div', { class: 'card' }, h('h2', { text: r.name }), h('div', { class: 'muted' }, ltr(r.empId), ' · ' + (r.role || ''))));
        body.appendChild(h('div', { class: 'months' }, h('button', { class: 'icon-btn', type: 'button', onclick: function () { step(-1); } }, icon('back')), h('div', { class: 'lbl', text: MONTHS_AR[r.month] + ' ' + r.year }), h('button', { class: 'icon-btn', type: 'button', disabled: r.isCurrentMonth, onclick: function () { step(1); } }, icon('next'))));
        // الترتيب والصور تجي بنداء ثاني (ما نعطّل ظهور التقرير)
        var slotO = h('div', { class: 'rkslot' }), slotC = h('div', { class: 'rkslot' }), slotP = h('div', { class: 'rkslot' });
        var nPhotos = h('div', { class: 'n', text: '…' });
        body.appendChild(h('div', { class: 'stats' },
          h('div', { class: 'stat' }, h('div', { class: 'n', text: r.openedCount }), h('div', { class: 'l', text: 'فتح' }), slotO),
          h('div', { class: 'stat' }, h('div', { class: 'n', text: r.closedCount }), h('div', { class: 'l', text: 'قفل بنفسه' }), slotC),
          h('div', { class: 'stat wide' }, nPhotos, h('div', { class: 'l', text: 'رفعات صور' }), slotP)));
        if (r.bulkClosedCount) body.appendChild(h('div', { class: 'muted', style: 'margin:-6px 4px 12px;font-size:13px', text: 'من القفل ' + r.bulkClosedCount + ' إغلاق جماعي، وما يدخل بترتيب الإغلاق.' }));

        var pc = h('div', { class: 'card' }, h('h2', { text: 'رفع الصور بالقسم' }), spinnerBlock('جاري حساب الصور والترتيب...'));
        body.appendChild(pc);

        var mx = 1; r.byDay.forEach(function (d) { mx = Math.max(mx, d.opened, d.closed); });
        var days = h('div', { class: 'brows' }), daySlots = {};
        r.byDay.forEach(function (d) {
          var ps = h('span', { class: 'dph' });
          daySlots[d.date] = ps;
          days.appendChild(h('div', { class: 'brow' },
            h('div', { class: 'bl' }, h('a', { class: 'bn dlink', href: '#/dash/' + d.date, title: 'عرض لوحة هذا اليوم' }, ltr(d.date.substring(5))), h('span', { class: 'bv' }, 'فتح ' + d.opened + ' · قفل ' + d.closed, ps)),
            h('div', { class: 'bt' }, h('i', { class: 'po', style: 'width:' + (d.opened / mx * 50) + '%' }), h('i', { class: 'pc', style: 'width:' + (d.closed / mx * 50) + '%' }))));
        });
        var daysCard = h('div', { class: 'card' }, h('h2', { text: 'توزيع الأيام' }), h('div', { class: 'muted', style: 'margin:-4px 0 10px;font-size:13px', text: 'اضغط على التاريخ تشوف لوحة ذاك اليوم.' }), r.byDay.length ? days : emptyNote('ما فيه عمليات بهالشهر.'));
        body.appendChild(daysCard);
        [['التصاريح اللي فتحها', r.openedList], ['التصاريح اللي قفلها', r.closedList]].forEach(function (s) {
          if (!s[1].length) return;
          var det = h('details', { class: 'card fold' }, h('summary', { text: s[0] + ' (' + s[1].length + ')' }));
          s[1].forEach(function (x) { det.appendChild(h('div', { class: 'rowitem' }, h('b', null, ltr(x.ptw)), ' · ' + (x.company || '') + (x.location ? ' · ' + x.location : ''), x.bulk ? h('span', { class: 'tag', text: 'جماعي' }) : null, h('div', { class: 'muted' }, ltr(x.time)))); });
          body.appendChild(det);
        });
        var listHost = h('div'); body.appendChild(listHost);
        body.appendChild(h('a', { class: 'btn gray', href: '#/emp' }, 'موظف ثاني'));

        call('getEmployeeReportExtras', empId, r.year, r.month).then(function (x) {
          if (my !== seq || !body.isConnected) return;
          clear(pc); pc.appendChild(h('h2', { text: 'رفع الصور بالقسم' }));
          if (!x || !x.ok) {
            if (x && x.code === 'AUTH') return;
            nPhotos.textContent = '-';
            var msg = (x && x.code === 'API_FN') ? 'النسخة المنشورة من Apps Script قديمة. الصق EmployeeReport.gs وApi.gs وانشر نسخة جديدة.' : ((x && x.message) || 'تعذر جلب الصور والترتيب.');
            pc.appendChild(h('div', { class: 'msg err', text: msg }));
            pc.appendChild(h('button', { class: 'btn ghost sm', type: 'button', style: 'margin-top:10px', onclick: function () { load(r.year, r.month); } }, 'إعادة المحاولة'));
            return;
          }
          var rk = x.ranks || {}, ph = x.photos;
          nPhotos.textContent = ph.total;
          slotO.appendChild(rankChip(rk.opened)); slotC.appendChild(rankChip(rk.closed)); slotP.appendChild(rankChip(rk.photos));
          if (!ph.total) pc.appendChild(emptyNote('ما رفع صور بهالشهر.'));
          else {
            var secs = h('div', { class: 'secs' });
            [['صور فتح التصاريح', ph.open, rk.photosOpen], ['صور إغلاق التصاريح', ph.close, rk.photosClose], ['صور الجولات', ph.rounds, rk.photosRounds]].forEach(function (s) {
              secs.appendChild(h('div', { class: 'secrow' }, h('span', { class: 'k', text: s[0] }), h('span', { class: 'v' }, h('b', { text: s[1] }), s[0] === 'صور الجولات' && ph.roundFiles ? ' (' + ph.roundFiles + ' ملف)' : '', s[2] && s[2].rank ? h('span', { class: 'rkmini' + (s[2].rank <= 5 ? ' top' : ''), text: ' #' + s[2].rank }) : null)));
            });
            pc.appendChild(secs);
            if (ph.byType && ph.byType.length) {
              pc.appendChild(h('div', { class: 'sub2', text: 'الجولات حسب النوع' }));
              pc.appendChild(h('div', { class: 'chips ro' }, ph.byType.map(function (t) { return h('span', { class: 'chip on', text: t.type + ' · ' + t.n }); })));
            }
          }
          var pbd = x.photoByDay || {};
          Object.keys(pbd).forEach(function (d) {
            if (daySlots[d]) daySlots[d].textContent = ' · صور ' + pbd[d];
            else if (r.byDay.length) { /* يوم فيه صور بس بدون عمليات: نضيفه */ }
          });
          if (ph.list && ph.list.length) {
            var pdet = h('details', { class: 'card fold' }, h('summary', { text: 'الصور اللي رفعها (' + ph.total + (ph.list.length < ph.total ? '، آخر ' + ph.list.length : '') + ')' }));
            ph.list.forEach(function (it) {
              pdet.appendChild(h('div', { class: 'rowitem' }, h('span', { class: 'tag', text: it.section }), ' ', it.section === 'جولة' ? (it.label || '') + (it.files ? ' (' + it.files + ' ملف)' : '') : h('b', null, ltr(it.label || '')),
                h('div', { class: 'muted' }, ltr(it.time)), safeUrl(it.url) ? openLink(it.url, 'فتح') : null));
            });
            listHost.appendChild(pdet);
          }
        });
      });
    }
    load(0, 0);
  }

  // ---------- ملاحظات السلامة (صلاحية admin) ----------
  function pageObs(empId) {
    var box = h('div'); shell('home', 'ملاحظات السلامة', box);
    box.appendChild(pageHead('ملاحظات السلامة', 'قراءة حية من شيت الملاحظات', 'o'));
    var body = h('div'); box.appendChild(body);
    if (empId) return obsDetail(body, empId);
    var info = h('div', { class: 'muted' }), rf = h('button', { class: 'btn ghost sm', type: 'button' }, 'تحديث الآن');
    body.appendChild(h('div', { class: 'card' }, info, h('div', { style: 'margin-top:10px' }, rf)));
    var list = h('div'); body.appendChild(list);
    var OBS_LS = 'ptw_obs_list';
    function draw(b, fromCache) {
      clear(list);
      if (b.total !== undefined) info.textContent = 'إجمالي الملاحظات: ' + b.total + (b.latest ? ' · آخر ملاحظة ' + b.latest.substring(0, 16) : '') + (fromCache ? ' · (آخر نسخة محفوظة، جاري التحديث...)' : '');
      var mx = (b.employees[0] && b.employees[0].total) || 1;
      b.employees.forEach(function (e, i) {
        var risks = Object.keys(e.byRisk).map(function (k) { return k + ' ' + e.byRisk[k]; }).join(' · ');
        list.appendChild(h('button', { class: 'list-item', type: 'button', onclick: function () { location.hash = '#/obs/' + encodeURIComponent(e.id); } },
          h('div', { class: 'bl' }, h('b', { text: (i + 1) + '. ' + e.name }), h('span', { class: 'bv', text: e.total })), h('div', { class: 'bt' }, h('i', { class: 'po', style: 'width:' + (e.total / mx * 100) + '%' })), h('div', { class: 'sub' }, ltr(e.id), risks ? ' · ' + risks : '')));
      });
    }
    function loadAll() {
      var cached = null; try { cached = JSON.parse(lsGet(OBS_LS) || 'null'); } catch (e) {}
      if (cached && cached.employees) draw(cached, true); else { clear(list); list.appendChild(spinnerBlock('جاري قراءة الشيت (أول مرة تاخذ شوي)...')); }
      call('getObsEmployeeReport').then(function (b) {
        if (!list.isConnected) return;
        if (!b || !b.ok) { if (b && b.code === 'AUTH') return; if (cached && cached.employees) { toast((b && b.message) || 'تعذر التحديث'); return; } clear(list); return list.appendChild(h('div', { class: 'msg err', text: (b && b.message) || 'تعذر قراءة الملاحظات.' })); }
        lsSet(OBS_LS, JSON.stringify(b)); draw(b, false);
      });
    }
    rf.addEventListener('click', function () { btnBusy(rf, true); call('refreshObsCache').then(function (r) { btnBusy(rf, false, 'تحديث الآن'); if (r && r.ok) { toast('تم التحديث'); loadAll(); } else if (!r || r.code !== 'AUTH') toast((r && r.message) || 'تعذر التحديث'); }); });
    loadAll();
  }
  function obsDetail(body, empId) {
    body.appendChild(spinnerBlock('جاري التحميل...'));
    call('getObsEmployeeDetail', empId).then(function (r) {
      if (!body.isConnected) return; clear(body);
      if (!r || !r.ok) { if (r && r.code === 'AUTH') return; body.appendChild(h('div', { class: 'msg err', text: (r && r.message) || 'تعذر الجلب.' })); }
      else {
        body.appendChild(h('div', { class: 'card' }, h('h2', { text: r.name || r.id }), h('div', { class: 'muted' }, ltr(r.id), ' · ' + r.detail.length + ' ملاحظة')));
        if (!r.detail.length) body.appendChild(emptyNote('ما فيه ملاحظات.'));
        r.detail.forEach(function (o) {
          body.appendChild(h('div', { class: 'card obs' }, h('div', { class: 'bl' }, h('b', { text: o.category || 'ملاحظة' }), h('span', { class: 'tag risk', text: o.risk || '' })),
            h('div', { class: 'sub muted' }, ltr(o.time.substring(0, 16)), (o.zone ? ' · ' + o.zone : '') + (o.shift ? ' · ' + o.shift : '')),
            o.type ? h('div', { text: o.type }) : null, o.description ? h('div', { class: 'muted', text: o.description }) : null,
            o.correctiveAction ? h('div', { class: 'msg ok', text: 'الإجراء: ' + o.correctiveAction }) : null,
            h('div', { class: 'row', style: 'margin-top:8px' }, o.photoBefore ? openLink(o.photoBefore, 'قبل') : null, o.photoAfter ? openLink(o.photoAfter, 'بعد') : null)));
        });
      }
      body.appendChild(h('a', { class: 'btn gray', href: '#/obs' }, 'رجوع'));
    });
  }

  // ---------- v1.16: بحث عن تصريح (صلاحية search) ----------
  function pageFind(q0) {
    var box = h('div'); shell('home', 'بحث عن تصريح', box);
    box.appendChild(pageHead('بحث عن تصريح', 'بياناته، حالته، ومين فتحه وقفله', 'r'));
    var q = h('input', { class: 'input big', type: 'text', autocomplete: 'off', autocapitalize: 'characters', enterkeyhint: 'search', placeholder: 'مثال: 5 أو SEP.5', value: q0 || '' });
    var go = h('button', { class: 'btn', type: 'button' }, 'بحث'), out = h('div'), busy = false;
    box.appendChild(h('div', { class: 'card' }, h('div', { class: 'field' }, q), go)); box.appendChild(out);
    function kv(k, v) { return h('div', { class: 'drow' }, h('span', { class: 'k', text: k }), h('span', { class: 'v' }, v || '-')); }
    function run() {
      var v = q.value.trim(); if (!v || busy) return;
      busy = true; btnBusy(go, true); clear(out); out.appendChild(spinnerBlock('جاري البحث...'));
      call('searchPermit', v).then(function (r) {
        busy = false; btnBusy(go, false, 'بحث'); if (!out.isConnected) return; clear(out);
        if (!r || !r.ok) {
          if (r && r.code === 'AUTH') return;
          out.appendChild(h('div', { class: 'msg err', text: (r && r.code === 'API_FN') ? 'النسخة المنشورة من Apps Script قديمة. الصق Api.gs وانشر نسخة جديدة.' : ((r && r.message) || 'ما لقيت التصريح.') }));
          return;
        }
        var i = r.info || {};
        out.appendChild(h('div', { class: 'card' },
          h('h2', null, ltr(r.ptw), ' ', h('span', { class: 'badge ' + (r.isOpen ? 'active' : 'unknown'), text: r.isOpen ? 'مفتوح الحين' : 'مو مفتوح' }), ' ',
            h('span', { class: 'badge ' + (STATUS_AR[r.status] ? r.status : 'unknown'), text: STATUS_AR[r.status] || 'غير معروف' })),
          r.inRegister ? null : h('div', { class: 'msg warn', style: 'margin-bottom:10px', text: 'التصريح مو موجود بالسجل الحالي، البيانات من سجل العمليات.' }),
          h('div', { class: 'details' }, kv('الشركة', i.company), kv('الفترة', [ltr(i.startDate || '?'), '  إلى  ', ltr(i.endDate || '?')]),
            kv('الموقع', (i.location || '') + (i.floor ? ' - ' + i.floor : '')), kv('وصف الأعمال', i.description), kv('النوع', i.type),
            kv('المصدر', i.issuer), kv('المستلم', i.receiver), kv('الجوال', i.phone ? ltr(i.phone) : ''), kv('الوردية', i.shift))));
        var hist = (r.history || []).slice().reverse();
        var hc = h('div', { class: 'card' }, h('h2', { text: 'سجل العمليات (' + hist.length + ')' }));
        if (!hist.length) hc.appendChild(emptyNote('ما فيه عمليات مسجلة على هذا التصريح.'));
        hist.slice(0, 60).forEach(function (x) {
          hc.appendChild(h('div', { class: 'rowitem' }, h('span', { class: 'tag', text: x.op }), ' ', h('b', { text: x.empName || x.empId || '' }),
            x.flags ? h('span', { class: 'tag risk', text: x.flags }) : null,
            h('div', { class: 'muted' }, ltr(x.time), x.note ? ' · ' + x.note : '')));
        });
        out.appendChild(hc);
        if (r.notes && r.notes.length) {
          var nc = h('div', { class: 'card' }, h('h2', { text: 'ملاحظات المشرفين (' + r.notes.length + ')' }));
          r.notes.slice().reverse().forEach(function (n) { nc.appendChild(h('div', { class: 'rowitem' }, h('div', { text: n.text }), h('div', { class: 'muted' }, (n.empName || '') + ' · ', ltr(n.time)))); });
          out.appendChild(nc);
        }
      });
    }
    go.addEventListener('click', run);
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
    if (q0) run(); else setTimeout(function () { try { q.focus(); } catch (e) {} }, 50);
  }

  // ======================= التوجيه والإقلاع =======================
  function route() {
    if (!apiBase()) return renderSetup(false);
    if (!S.token || !S.user) return renderAuth('');
    var parts = (location.hash || '#/home').replace(/^#\/?/, '').split('/');
    var key = parts[0] || 'home';
    if ((key === 'site' || key === 'photos') && !has('site')) key = 'home';
    if (key === 'me' && !has('mypage')) key = 'home';
    if (key === 'dash' && !has('dashboard')) key = 'home';
    if ((key === 'gallery' || key === 'meetings') && !has('dashboard')) key = 'home';
    if ((key === 'emp' || key === 'obs') && !has('admin')) key = 'home';
    if (key === 'find' && !has('search')) key = 'home';
    if (key === 'find') return pageFind(parts[1] ? decodeURIComponent(parts[1]) : '');
    if (key === 'gallery') return pageGallery();
    if (key === 'meetings') return pageMeetings(parts[1]);
    if (key === 'emp') return pageEmpReport(parts[1] ? decodeURIComponent(parts[1]) : '');
    if (key === 'obs') return pageObs(parts[1] ? decodeURIComponent(parts[1]) : '');
    if (key === 'site') return pageSite(parts[1]);
    if (key === 'photos') return pagePhotos();
    if (key === 'me') return pageMe();
    if (key === 'dash') return pageDash(parts[1], parts[2]);
    return pageHome();
  }
  window.addEventListener('hashchange', function () { if (S.user) route(); });
  window.addEventListener('online', function () { if (S.user) route(); });
  window.addEventListener('offline', function () { if (S.user) route(); });

  function boot() {
    if (!apiBase()) return renderSetup(false);
    S.token = lsGet('ptw_token');
    if (!S.token) return renderAuth('');
    // فتح فوري: لو عندنا بيانات المستخدم المحفوظة نعرض التطبيق مباشرة ونتحقق من الجلسة بالخلفية
    // (كل نداء محمي يتحقق من التوكن بالخادم على أي حال، فهذا ما يفتح ثغرة).
    var cachedU = null; try { cachedU = JSON.parse(lsGet('ptw_user') || 'null'); } catch (e) {}
    var optimistic = !!(cachedU && cachedU.perms && cachedU.perms.length);
    if (optimistic) { S.user = cachedU; route(); }
    else { clear(root); root.appendChild(spinnerBlock('جاري التحميل...')); }
    rpc('whoami', [S.token]).then(function (res) {
      if (res && res.ok && res.user) {
        var changed = optimistic && JSON.stringify(cachedU.perms) !== JSON.stringify(res.user.perms);
        S.user = res.user; lsSet('ptw_user', JSON.stringify(res.user));
        if (!optimistic || changed) return route();   // صلاحياته تغيّرت: نعيد رسم الصفحة الحالية
        return;
      }
      if (res && (res.code === 'AUTH' || res.code === 'FORBIDDEN')) return sessionLost(res.code === 'AUTH' ? '' : '');
      // خطأ شبكة أو خادم: لو عندنا بيانات المستخدم المحفوظة نكمل (وضع بدون اتصال جزئي)
      if (optimistic) return; // الواجهة مفتوحة أصلًا من الكاش
      var cached = cachedU;
      if (cached && cached.perms) { S.user = cached; return route(); }
      clear(root);
      root.appendChild(h('div', { class: 'auth-wrap' }, h('div', { class: 'card center' },
        h('div', { class: 'msg err', text: (res && res.message) || 'تعذر الاتصال بالخادم.' }),
        h('button', { class: 'btn', type: 'button', onclick: boot }, 'إعادة المحاولة'),
        h('button', { class: 'btn ghost', type: 'button', onclick: function () { renderSetup(false); } }, 'تغيير رابط الخادم'))));
    });
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
        try { reg.update(); } catch (e) {}
        document.addEventListener('visibilitychange', function () { if (!document.hidden) { try { reg.update(); } catch (e) {} } });
      }).catch(function () {});
      var had = !!navigator.serviceWorker.controller, done = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () { if (had && !done) { done = true; location.reload(); } });
    });
  }
  boot();
})();
