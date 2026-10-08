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
  var desks = [], current = -1, currentBook = 'all';

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

  function demoBook(desk, b, i) {
    var X = window.BooksFlex;
    var xml = X.sampleFlex({ desk: desk.id, seed: b.id, account: 'DU' + (5100000 + i * 7919), analysts: ['Analyst A', 'Analyst B', 'Analyst C'] });
    return X.merge(X.parse(xml), null, { id: b.id, currency: 'USD' }).book;
  }

  function load() {
    var ready = DEMO ? loadScript('js/books-flex.js?v=4') : Promise.resolve();
    return ready.then(function () { return getJSON('books/data/index.json'); }).then(function (manifest) {
      if (!manifest || !manifest.desks) throw new Error('No manifest');
      var n = 0;
      return Promise.all(manifest.desks.map(function (d) {
        return Promise.all(d.books.map(function (b) {
          var i = n++;
          var got = DEMO ? Promise.resolve(demoBook(d, b, i)) : getJSON('books/data/' + b.id + '.json').catch(function () { return null; });
          // The demo never puts invented numbers next to a real person's name.
          var label = DEMO ? d.name + ' book ' + (d.books.indexOf(b) + 1) : (b.name || b.head);
          return got.then(function (data) { return C.computeBook(data || {}, { id: b.id, head: DEMO ? label : b.head, name: label }); });
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

  function start() {
    if (DEMO) main.querySelector('[data-demo]').hidden = false;
    load().then(function (d) { desks = d; current = -1; render(); }).catch(function (e) { console.error(e); fail(); });
  }

  window.addEventListener('hashchange', function () {
    var parts = location.hash.replace(/^#/, '').split('/');
    if (desks.some(function (d) { return d.id === parts[0]; })) fromHash();
  });

  start();
})();
