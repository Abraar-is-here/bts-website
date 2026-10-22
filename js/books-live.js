/* ===========================================================================
   books-live.js — live marks for the open positions on /books/.

   The positions come from each book's latest IBKR export, marked at IBKR's
   close on that day. While markets are open this moves each one on with the
   live price from Yahoo Finance, fetched through the relay in
   apps-script/QuotesCode.gs (its URL is "live.endpoint" in
   books/data/index.json; empty means live marks are off).

   A position is moved by Yahoo's own change since that same close:
     live mark = IBKR mark × (Yahoo now ÷ Yahoo close on the IBKR date)
   so quoting differences (pence against pounds, a continuous future against
   the contract held) cancel out. P&L moves by (live mark − IBKR mark) ×
   quantity × multiplier, in the book's currency at the statement's FX rate.
   Anything Yahoo can't price, or a move too large to be believable, keeps its
   IBKR mark.

   Prices refresh every minute while any held market is open, every fifteen
   minutes otherwise, and not at all while the tab is hidden.
   ========================================================================== */
(function () {
  'use strict';

  var C = window.BooksCore, F = C.fmt;
  var main = document.getElementById('books');

  // IBKR listing exchange → Yahoo suffix.
  var SUFFIX = {
    NASDAQ: '', NYSE: '', ARCA: '', AMEX: '', BATS: '', NYSEARCA: '', ISLAND: '', IEX: '',
    LSE: '.L', LSEETF: '.L', IBIS: '.DE', IBIS2: '.DE', XETRA: '.DE', FWB: '.F', FWB2: '.F',
    SBF: '.PA', AEB: '.AS', ENEXT_BE: '.BR', 'ENEXT.BE': '.BR', EBS: '.SW', SWX: '.SW', VIRTX: '.SW',
    BVME: '.MI', BM: '.MC', SFB: '.ST', KFB: '.CO', OSE: '.OL', VSE: '.VI',
    SEHK: '.HK', TSEJ: '.T', ASX: '.AX', TSE: '.TO', SGX: '.SI'
  };
  // Without an exchange, the currency is usually enough (not for euros).
  var BY_CURRENCY = { USD: '', GBP: '.L', JPY: '.T', HKD: '.HK', AUD: '.AX', CAD: '.TO', CHF: '.SW' };
  // Futures Yahoo carries as a continuous front month.
  var FUTURES = ['ES', 'NQ', 'YM', 'RTY', 'MES', 'MNQ', 'MYM', 'M2K', 'CL', 'BZ', 'NG', 'RB', 'HO', 'GC', 'SI', 'HG', 'PL', 'PA',
    'ZN', 'ZB', 'ZF', 'ZT', 'UB', 'ZC', 'ZS', 'ZW', 'ZL', 'ZM', 'LE', 'HE', '6E', '6B', '6J', '6A', '6C', '6S', '6M', 'MGC', 'MCL'];

  var S = { endpoint: '', overrides: {}, rows: [], desks: [], cur: {}, quotes: {}, live: {}, at: 0, timer: 0, failed: false };

  function yahooSymbol(r) {
    var o = S.overrides[r.symbol] || S.overrides[r.book + '|' + r.symbol];
    if (o) return o;
    var s = String(r.symbol || '').trim().toUpperCase();
    var a = String(r.asset || '').toUpperCase();
    if (!s) return null;
    if (a === 'CASH') { var fx = s.match(/^([A-Z]{3})\.([A-Z]{3})$/); return fx ? fx[1] + fx[2] + '=X' : null; }
    if (a === 'CRYPTO') return s.split('.')[0] + '-' + (r.currency || 'USD');
    if (a === 'FUT') {
      var root = FUTURES.indexOf(s) >= 0 ? s : (s.match(/^(.+?)[FGHJKMNQUVXZ]\d{1,2}$/) || [])[1];
      return root && FUTURES.indexOf(root) >= 0 ? root + '=F' : null;
    }
    if (a !== 'STK' && a !== 'ETF' && a !== 'FUND') return null;
    var ex = String(r.exchange || '').toUpperCase();
    var suf = ex in SUFFIX ? SUFFIX[ex] : BY_CURRENCY[r.currency];
    if (suf == null) return null;
    var t = s.replace(/\s+/g, '-');
    if (suf === '' || suf === '.L') t = t.replace(/\.$/, '').replace(/\./g, '-');
    if (suf === '.HK') t = ('0000' + t).slice(-4);
    return t + suf;
  }

  // The close on the IBKR date, or the last one before it (a holiday).
  function closeOn(closes, date) {
    var v = null;
    for (var i = 0; i < closes.length; i++) { if (closes[i][0] <= date) v = closes[i][1]; else break; }
    return v;
  }
  function closeBefore(closes, date) {
    var v = null;
    for (var i = 0; i < closes.length; i++) { if (closes[i][0] < date) v = closes[i][1]; else break; }
    return v;
  }
  function inSession(q, t) { return !!(q && q.session && t / 1000 >= q.session[0] && t / 1000 < q.session[1]); }
  function now() { return window.BTSClock ? window.BTSClock.now() : Date.now(); }

  function compute() {
    var t = now();
    S.live = {};
    S.rows.forEach(function (r) {
      var q = r.ys && S.quotes[r.ys];
      if (!q || !q.closes || !r.mark || !r.date) return;
      var ref = closeOn(q.closes, r.date);
      if (!ref) return;
      var ratio = q.price / ref;
      if (!(ratio > 0.5 && ratio < 2)) return; // a mapping gone wrong, not a market move
      var mark = r.mark * ratio;
      var delta = (mark - r.mark) * r.quantity * (r.multiplier || 1) * (r.fx || 1);
      var prev = closeBefore(q.closes, q.date);
      S.live[r.book + '|' + r.key] = {
        mark: mark,
        delta: delta,
        upl: (r.unrealized || 0) + delta,
        day: prev ? q.price / prev - 1 : null,
        open: inSession(q, t),
        // Only once the market has traded past the statement's date; an export
        // already marked to the latest close has nothing to move by.
        moved: q.date > r.date
      };
    });
  }

  function anyOpen() {
    var t = now();
    return Object.keys(S.quotes).some(function (k) { return inSession(S.quotes[k], t); });
  }

  // Writes only what changed: the redraw watcher below sees every write.
  function setText(el, t) { if (el.textContent !== t) el.textContent = t; }
  function setTone(cell, x) {
    var k = x > 0 ? 'is-up' : x < 0 ? 'is-down' : '';
    if (k !== 'is-up' && cell.classList.contains('is-up')) cell.classList.remove('is-up');
    if (k !== 'is-down' && cell.classList.contains('is-down')) cell.classList.remove('is-down');
    if (k && !cell.classList.contains(k)) cell.classList.add(k);
  }

  function apply() {
    var keys = Object.keys(S.live);
    main.classList.toggle('has-live', keys.length > 0);
    Array.prototype.forEach.call(main.querySelectorAll('[data-lk]'), function (el) {
      var l = S.live[el.getAttribute('data-lk')];
      var kind = el.getAttribute('data-lv');
      var cell = el.closest('td');
      if (!l) { if (kind !== 'upl') setText(el, '–'); return; }
      if (kind === 'px') {
        setText(el, F.price(l.mark));
        if (el.classList.contains('bk-live-on') !== l.open) el.classList.toggle('bk-live-on', l.open);
      } else if (kind === 'day') {
        setText(el, l.day == null ? '–' : F.pct(l.day));
        setTone(cell, l.day);
      } else if (kind === 'upl' && l.moved) {
        var book = el.getAttribute('data-lk').split('|')[0];
        setText(el, F.money(l.upl, S.cur[book], { signed: true }));
        setTone(cell, l.upl);
      }
    });

    // Each desk card: the move since the last IBKR close, as a share of capital.
    S.desks.forEach(function (d) {
      var el = main.querySelector('[data-lv-desk="' + d.id + '"]');
      if (!el) return;
      var rows = S.rows.filter(function (r) { return r.desk === d.id; });
      var hits = rows.filter(function (r) { var l = S.live[r.book + '|' + r.key]; return l && l.moved; });
      if (!hits.length || !d.capital) { if (!el.hidden) el.hidden = true; return; }
      var delta = hits.reduce(function (s, r) { return s + S.live[r.book + '|' + r.key].delta; }, 0);
      var open = hits.some(function (r) { return S.live[r.book + '|' + r.key].open; });
      var pct = F.pct(delta / d.capital, 2);
      var rest = (open ? ' live since ' : ' since ') + F.day(d.asOf) + ' close';
      if (el.getAttribute('data-shown') !== pct + rest) {
        el.setAttribute('data-shown', pct + rest);
        el.textContent = '';
        var v = document.createElement('strong');
        v.className = F.upDown(delta);
        v.textContent = pct;
        el.appendChild(v);
        el.appendChild(document.createTextNode(rest));
      }
      if (el.hidden) el.hidden = false;
      if (el.classList.contains('is-open') !== open) el.classList.toggle('is-open', open);
    });

    var stamp = 'Live prices from Yahoo Finance, ' + (anyOpen() ? 'updated ' : 'last checked ') +
      new Date(S.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) +
      '. Some exchanges are delayed by up to 15 minutes. P&L moves at the statement’s exchange rates.';
    Array.prototype.forEach.call(main.querySelectorAll('[data-lv-note]'), function (el) {
      if (el.hidden !== !keys.length) el.hidden = !keys.length;
      setText(el, stamp);
    });
  }

  function schedule() {
    clearTimeout(S.timer);
    if (document.hidden) return;
    S.timer = setTimeout(poll, anyOpen() ? 60000 : 15 * 60000);
  }

  function poll() {
    var syms = S.rows.map(function (r) { return r.ys; }).filter(function (s, i, a) { return s && a.indexOf(s) === i; });
    if (!syms.length) return;
    var url = S.endpoint + (S.endpoint.indexOf('?') < 0 ? '?' : '&') + 's=' + encodeURIComponent(syms.join(','));
    fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
      if (!d || !d.ok || !d.quotes) throw new Error('Bad reply');
      S.quotes = d.quotes;
      S.at = d.at || Date.now();
      S.failed = false;
      compute();
      apply();
    }).catch(function (e) {
      // Leave the IBKR marks showing; try again on the next round.
      S.failed = true;
      console.warn('[books] live prices unavailable', e);
    }).then(schedule);
  }

  function start(desks, manifest) {
    var cfg = (manifest && manifest.live) || {};
    S.endpoint = String(cfg.endpoint || '').trim();
    S.overrides = cfg.yahoo || {};
    if (!S.endpoint) return;
    S.desks = desks;
    S.rows = [];
    desks.forEach(function (d) {
      (d.live || []).forEach(function (b) {
        S.cur[b.id] = b.currency || d.currency;
        b.exposure.rows.forEach(function (r) { S.rows.push(Object.assign({ desk: d.id, ys: yahooSymbol(r) }, r)); });
      });
    });
    if (!S.rows.some(function (r) { return r.ys; })) return;

    // The desk panel is redrawn when the desk or book changes: fill it in again.
    var raf = 0;
    new MutationObserver(function () {
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = 0; if (Object.keys(S.live).length) apply(); });
    }).observe(main, { childList: true, subtree: true });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clearTimeout(S.timer);
      else if (now() - S.at > 60000) poll(); else schedule();
    });
    poll();
  }

  window.BooksLive = { start: start, yahooSymbol: yahooSymbol };
})();
