/* ===========================================================================
   books-import.js — /books/import/: a division head drops their IBKR Flex
   export, sees exactly what will be published, adds trade notes, and
   downloads books/data/<book>.json to send to the web team.

   Nothing leaves the browser. The published file for the chosen book is
   fetched first, so each export adds to the history rather than replacing it.
   ========================================================================== */
(function () {
  'use strict';

  var X = window.BooksFlex, C = window.BooksCore, UI = window.BooksUI, F = C.fmt;
  var main = document.getElementById('import');
  var $ = function (s) { return main.querySelector(s); };
  var bookSel = $('[data-book]'), drop = $('[data-drop]'), fileIn = $('[data-file]');
  var statusEl = $('[data-status]'), result = $('[data-result]');
  var summaryEl = $('[data-summary]'), warnEl = $('[data-warnings]'), previewEl = $('[data-preview]'), notesEl = $('[data-notes]');
  var books = {}, current = null; // { meta, book, report }

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function status(text, kind) {
    statusEl.textContent = '';
    if (!text) return;
    var p = el('p', 'bki-status__msg' + (kind ? ' is-' + kind : ''), text);
    statusEl.appendChild(p);
  }

  /* --- Book list from the manifest ------------------------------------------- */
  fetch('books/data/index.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (m) {
    bookSel.textContent = '';
    var ph = el('option', null, 'Choose your book');
    ph.value = '';
    bookSel.appendChild(ph);
    m.desks.forEach(function (d) {
      if (!d.books.length) return;
      var g = document.createElement('optgroup');
      g.label = d.name;
      d.books.forEach(function (b) {
        books[b.id] = { id: b.id, head: b.head, name: b.name || b.head, desk: d };
        var o = el('option', null, b.name || b.head);
        o.value = b.id;
        g.appendChild(o);
      });
      bookSel.appendChild(g);
    });
    try { var last = localStorage.getItem('bts-books-book'); if (last && books[last]) bookSel.value = last; } catch (e) { /* storage off */ }
  }).catch(function () { status('Couldn’t load the list of books. Refresh the page to try again.', 'error'); });

  bookSel.addEventListener('change', function () {
    try { localStorage.setItem('bts-books-book', bookSel.value); } catch (e) { /* storage off */ }
    if (current) { result.hidden = true; current = null; status(''); }
  });

  /* --- Getting files in ----------------------------------------------------- */
  ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
  ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove('is-over'); }); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer.files.length) readFiles(e.dataTransfer.files); });
  fileIn.addEventListener('change', function () { if (fileIn.files.length) readFiles(fileIn.files); fileIn.value = ''; });
  $('[data-sample]').addEventListener('click', function () {
    var meta = needBook(); if (!meta) return;
    var xml = X.sampleFlex({ desk: meta.desk.id, seed: meta.id + '-sample', account: 'DU0000000', analysts: ['AB', 'CD', 'EF'] });
    run([xml], true);
  });

  function needBook() {
    var meta = books[bookSel.value];
    if (!meta) { status('Choose your book first, so the export is added to the right one.', 'error'); bookSel.focus(); return null; }
    return meta;
  }

  function readFiles(list) {
    if (!needBook()) return;
    status('Reading ' + (list.length === 1 ? list[0].name : list.length + ' files') + '…');
    Promise.all(Array.prototype.map.call(list, function (f) { return f.text(); })).then(function (texts) { run(texts, false); });
  }

  function run(texts, sample) {
    var meta = needBook(); if (!meta) return;
    var statements = [];
    try {
      texts.forEach(function (t) { statements = statements.concat(X.parse(t)); });
    } catch (e) {
      status(e.message || 'This file couldn’t be read.', 'error');
      result.hidden = true;
      return;
    }
    var accounts = statements.map(function (s) { return s.account; }).filter(function (a, i, arr) { return a && arr.indexOf(a) === i; });
    if (accounts.length > 1) {
      status('This export covers ' + accounts.length + ' accounts. Run the Flex Query for your book’s account only, then drop it again.', 'error');
      return;
    }
    status('Loading the published history for ' + meta.name + '…');
    Promise.all([
      X.hashAccount(accounts[0] || ''),
      sample ? Promise.resolve(null) : fetch('books/data/' + meta.id + '.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (got) {
      var key = got[0], existing = got[1];
      var merged = X.merge(statements, existing, { id: meta.id, accountKey: key, currency: statements[0] && statements[0].currency });
      if (existing && existing.accountKey && key && existing.accountKey !== key) {
        merged.report.warnings.unshift({ level: 'serious', text: 'This export is from a different IBKR account from the one already published for ' + meta.name + '. If that’s a mistake, export from the right account. If the book has moved account, tell the web team before sending this.' });
      }
      if (sample) merged.report.warnings.unshift({ level: 'warning', text: 'This is the sample file: invented trades so you can see how it works. Don’t send it.' });
      current = { meta: meta, book: merged.book, report: merged.report, sample: sample };
      status('');
      show();
    });
  }

  /* --- Showing the result ------------------------------------------------------ */
  function show() {
    var r = current.report, b = current.book;
    summaryEl.textContent = '';
    [
      ['Book', current.meta.name],
      ['This export', r.from && r.to ? F.day(r.from, true) + ' – ' + F.day(r.to, true) : '–'],
      ['New fills', String(r.newTrades) + (r.knownTrades ? ' (' + r.knownTrades + ' already published)' : '')],
      ['Days of NAV', String(b.nav.length) + (r.newNavDays ? ' (' + r.newNavDays + ' new)' : '')],
      ['Open positions', String(r.positions)]
    ].forEach(function (f) { var d = el('div'); d.appendChild(el('dt', null, f[0])); d.appendChild(el('dd', null, f[1])); summaryEl.appendChild(d); });

    warnEl.textContent = '';
    if (!r.warnings.length) {
      var ok = el('li', 'bki-warn is-ok');
      ok.appendChild(el('strong', null, 'Looks complete.'));
      ok.appendChild(document.createTextNode(' Every section the books need is in this export.'));
      warnEl.appendChild(ok);
    }
    r.warnings.forEach(function (w) {
      var li = el('li', 'bki-warn is-' + w.level);
      li.appendChild(el('strong', null, w.level === 'serious' ? 'Check this.' : 'Note.'));
      li.appendChild(document.createTextNode(' ' + w.text));
      warnEl.appendChild(li);
    });

    preview();
    notes();
    result.hidden = false;
    result.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function preview() {
    var meta = current.meta;
    var computed = C.computeBook(current.book, { id: meta.id, head: meta.head, name: meta.name });
    var desk = C.computeDesk({ id: meta.desk.id, name: meta.desk.name }, [computed]);
    UI.deskPanel(previewEl, desk, { title: meta.name + '’s book' });
    current.computed = computed;
  }

  /* --- Notes: analyst and thesis per trade ------------------------------------- */
  function notes() {
    notesEl.textContent = '';
    var trips = current.computed.trips.slice().sort(function (a, b) { return (b.closed || '9') > (a.closed || '9') ? 1 : -1; });
    if (!trips.length) { notesEl.appendChild(el('p', 'bk-empty', 'No trades to note yet.')); return; }
    var LIMIT = 15, all = false;
    var wrap = el('div');
    notesEl.appendChild(wrap);
    function draw() {
      wrap.textContent = '';
      var list = el('ul', 'bki-notelist');
      (all ? trips : trips.slice(0, LIMIT)).forEach(function (t) {
        var k = C.tripKey(t);
        var n = current.book.notes[k] || {};
        var li = el('li', 'bki-note');
        var what = el('div', 'bki-note__what');
        what.appendChild(el('strong', null, t.symbol + ' · ' + t.side));
        what.appendChild(el('span', null, (t.open ? 'Open since ' + F.day(t.opened) : (t.opened ? F.day(t.opened) : 'Before export') + ' – ' + F.day(t.closed)) + (t.open ? '' : ' · ' + F.money(t.pnl, current.book.currency, { signed: true }))));
        li.appendChild(what);
        var id = 'n-' + Math.abs(hash(k));
        var a = field('Analyst', id + '-a', n.analyst || '', t.ref || 'Initials', 24);
        var th = field('Idea, in a line', id + '-t', n.thesis || '', 'e.g. Long into earnings on margin recovery', 160);
        a.input.addEventListener('input', function () { setNote(k, 'analyst', a.input.value); });
        th.input.addEventListener('input', function () { setNote(k, 'thesis', th.input.value); });
        li.appendChild(a.box);
        li.appendChild(th.box);
        list.appendChild(li);
      });
      wrap.appendChild(list);
      if (trips.length > LIMIT) {
        var more = el('button', 'bk-more', all ? 'Show the latest ' + LIMIT : 'Show all ' + trips.length + ' trades');
        more.type = 'button';
        more.addEventListener('click', function () { all = !all; draw(); });
        wrap.appendChild(more);
      }
    }
    draw();
  }
  function field(label, id, value, placeholder, max) {
    var box = el('div', 'bki-field');
    var l = el('label', null, label);
    l.htmlFor = id;
    var i = el('input');
    i.id = id; i.type = 'text'; i.value = value; i.placeholder = placeholder; i.maxLength = max; i.autocomplete = 'off';
    box.appendChild(l); box.appendChild(i);
    return { box: box, input: i };
  }
  function setNote(k, f, v) {
    var notes = current.book.notes;
    notes[k] = notes[k] || {};
    v = v.trim();
    if (v) notes[k][f] = v; else delete notes[k][f];
    if (!Object.keys(notes[k]).length) delete notes[k];
    clearTimeout(setNote.t);
    setNote.t = setTimeout(preview, 500);
  }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  /* --- Download ------------------------------------------------------------------ */
  $('[data-download]').addEventListener('click', function () {
    if (!current) return;
    if (current.sample && !confirm('This is the sample file with invented trades. Download it anyway?')) return;
    var blob = new Blob([JSON.stringify(current.book, null, 1) + '\n'], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = current.meta.id + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    $('[data-sent]').textContent = 'Downloaded ' + current.meta.id + '.json. Now email it to the web team or upload it on GitHub.';
  });
})();
