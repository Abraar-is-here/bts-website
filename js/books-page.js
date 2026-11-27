/* ===========================================================================
   books-page.js — starts /books/: reads books/data/index.json and each book's
   file, then draws the desk cards and the chosen desk.

   ?demo=1 swaps every book for a generated sample export, run through the
   same IBKR parser as real data (js/books-flex.js, loaded only then).
   The address keeps the choice: /books/#ficc, /books/#ficc/ficc-anay.
   ========================================================================== */
(function () {
  'use strict';

  var C = window.BooksCore, UI = window.BooksUI, F = C.fmt;
  var main = document.getElementById('books');
  var desksEl = main.querySelector('[data-desks]');
  var panel = main.querySelector('[data-panel]');
  var stampEl = main.querySelector('[data-stamp]');
  var DEMO = new URLSearchParams(location.search).get('demo') === '1';
  var desks = [], current = -1, currentBook = 'all', manifest = null;

  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }

  function loadScript(src) {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = fail;
      document.head.appendChild(s);
    });
  }

  // Exports are run after a close, so the sample is marked to the last weekday before today.
  function lastClose() {
    var d = new Date();
    do { d.setUTCDate(d.getUTCDate() - 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    return d.toISOString().slice(0, 10);
  }

  function demoBook(desk, b, i) {
    var X = window.BooksFlex;
    var xml = X.sampleFlex({ desk: desk.id, seed: b.id, end: lastClose(), account: 'DU' + (5100000 + i * 7919), analysts: ['Analyst A', 'Analyst B', 'Analyst C'] });
    return X.merge(X.parse(xml), null, { id: b.id, currency: 'USD' }).book;
  }

  function load() {
    var ready = DEMO ? loadScript('js/books-flex.js?v=5') : Promise.resolve();
    var benches = DEMO ? Promise.resolve({}) : getJSON('books/data/benchmarks.json').then(function (b) { return (b && b.benchmarks) || {}; }).catch(function () { return {}; });
    return ready.then(function () { return Promise.all([getJSON('books/data/index.json'), benches]); }).then(function (got) {
      var m = got[0], bms = got[1];
      C.setCash(bms.cash && bms.cash.series);
      manifest = m;
      if (!manifest || !manifest.desks) throw new Error('No manifest');
      var n = 0;
      return Promise.all(manifest.desks.map(function (d) {
        return Promise.all(d.books.map(function (b) {
          var i = n++;
          var got = DEMO ? Promise.resolve(demoBook(d, b, i)) : getJSON('books/data/' + b.id + '.json').catch(function () { return null; });
          // The demo never puts invented numbers next to a real person's name.
          var label = DEMO ? d.name + ' book ' + (d.books.indexOf(b) + 1) : (b.name || b.head);
          return got.then(function (data) {
            var book = C.computeBook(data || {}, { id: b.id, head: DEMO ? label : b.head, name: label });
            book.bench = b.benchmark ? C.benchmark(book, bms[b.benchmark]) : null;
            return book;
          });
        })).then(function (books) { return C.computeDesk(d, books); });
      }));
    });
  }

  function stamp() {
    var live = desks.filter(function (d) { return d.hasData; });
    stampEl.textContent = '';
    if (!live.length) return;
    var asOf = live.reduce(function (m, d) { return d.asOf > m ? d.asOf : m; }, '');
    var upd = live.reduce(function (m, d) { return d.updated > m ? d.updated : m; }, '');
    var s = document.createElement('strong');
    s.textContent = 'Marked to ' + F.day(asOf, true);
    stampEl.appendChild(s);
    if (upd) {
      var u = new Date(upd);
      stampEl.appendChild(document.createTextNode('Published ' + u.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + u.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })));
    }
  }

  function select(i, focus, fromHash) {
    if (i === current && !fromHash) return;
    var first = current === -1;
    current = i;
    var buttons = desksEl.querySelectorAll('[role="tab"]');
    Array.prototype.forEach.call(buttons, function (b, k) {
      b.setAttribute('aria-selected', String(k === i));
      b.tabIndex = k === i ? 0 : -1;
      if (k === i && focus) b.focus();
    });
    var desk = desks[i];
    panel.hidden = false;
    panel.setAttribute('aria-labelledby', 'desk-tab-' + desk.id);
    var draw = function () {
      UI.deskPanel(panel, desk, {
        book: fromHash ? currentBook : 'all',
        onBook: function (id) { currentBook = id; writeHash(); }
      });
      panel.classList.remove('is-switching');
    };
    if (first || focus) draw(); // keyboard switching is never delayed
    else { panel.classList.add('is-switching'); setTimeout(draw, 120); }
    if (!fromHash) { currentBook = 'all'; writeHash(); }
  }

  function writeHash() {
    var d = desks[current];
    if (!d) return;
    var h = '#' + d.id + (currentBook && currentBook !== 'all' ? '/' + currentBook : '');
    if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h);
  }

  function fromHash() {
    var parts = location.hash.replace(/^#/, '').split('/');
    var i = desks.findIndex(function (d) { return d.id === parts[0]; });
    if (i < 0) return false;
    currentBook = parts[1] || 'all';
    select(i, false, true);
    return true;
  }

  function render() {
    UI.deskCards(desksEl, desks, 0, function (i, focus) { select(i, focus); });
    stamp();
    if (!fromHash()) {
      var firstLive = desks.findIndex(function (d) { return d.hasData; });
      select(firstLive < 0 ? 0 : firstLive, false);
    }
  }

  function fail() {
    desksEl.textContent = '';
    var p = document.createElement('div');
    p.className = 'bk-error';
    p.appendChild(document.createTextNode('Couldn’t load the books.'));
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Try again';
    b.addEventListener('click', start);
    p.appendChild(b);
    desksEl.appendChild(p);
  }

  /* --- Sealed for the competition -----------------------------------------------
     During the Bristol Trading Competition every book's figures are held back until
     after the stock pitch, so no desk pitches knowing where it stands. The Floor opens
     by itself at "floorRevealAt" in books/data/competition.json (or when "reveal" is
     set); ?preview=1 shows it anyway, for the committee. */
  var PREVIEW = new URLSearchParams(location.search).get('preview') === '1';
  function sealedBy(cfg) {
    if (DEMO || PREVIEW || !cfg || cfg.reveal) return false;
    var at = Date.parse(cfg.floorRevealAt || '');
    return !(at && Date.now() >= at) ? at || true : false;
  }
  function sealed(cfg, at) {
    desksEl.textContent = '';
    panel.hidden = true;
    stampEl.textContent = '';
    var box = document.createElement('div');
    box.className = 'bk-sealed';
    var h = document.createElement('p'); h.className = 'bk-sealed__title';
    h.textContent = 'Performance is under wraps until the pitch';
    var t = document.createElement('p'); t.className = 'bk-sealed__text';
    t.textContent = 'The Floor is paused for the Bristol Trading Competition, so every desk pitches on equal terms. Each book\u2019s performance is revealed after the stock pitch, ' + (cfg.revealLabel || 'after the pitch') + '.';
    var a = document.createElement('a'); a.className = 'bk-sealed__link'; a.href = '/books/competition/';
    a.innerHTML = 'About the competition <span aria-hidden="true">&rarr;</span>';
    box.appendChild(h); box.appendChild(t); box.appendChild(a);
    desksEl.appendChild(box);
    // Open by itself at the reveal if the page is left open.
    if (typeof at === 'number') {
      var wait = at - Date.now();
      if (wait > 0 && wait < 864e5) setTimeout(function () { location.reload(); }, wait + 2000);
    }
  }

  function start() {
    if (DEMO) main.querySelector('[data-demo]').hidden = false;
    getJSON('books/data/competition.json').catch(function () { return null; }).then(function (cfg) {
      var at = sealedBy(cfg);
      if (at) { sealed(cfg, at); return; }
      if (PREVIEW && cfg && !cfg.reveal) {
        var note = document.createElement('p'); note.className = 'cp-preview';
        note.textContent = 'Preview: The Floor is hidden from everyone else until the reveal.';
        desksEl.parentNode.insertBefore(note, desksEl);
      }
      go();
    });
  }
  function go() {
    load().then(function (d) {
      desks = d; current = -1; render();
      // Live marks on the open positions while markets trade (js/books-live.js).
      if (window.BooksLive) window.BooksLive.start(desks, manifest);
    }).catch(function (e) { console.error(e); fail(); });
  }

  window.addEventListener('hashchange', function () {
    var parts = location.hash.replace(/^#/, '').split('/');
    if (desks.some(function (d) { return d.id === parts[0]; })) fromHash();
  });

  start();
})();
