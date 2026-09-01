/* ===========================================================================
   Research page — preview mode.

   /research/?preview=live flips the page out of its coming-soon state and fills
   the tables with sample rows, so the committee can see the finished layout
   before there is anything real to publish. Without the parameter this file
   does nothing at all.

   The sample data lives here rather than in the HTML deliberately: the
   committed page stays genuinely empty, so there is no chance of placeholder
   rows going live by accident. Delete this file once the archive has real
   entries.

   This is not access control. Anyone who knows the parameter can see the
   preview — it exists to keep placeholder data out of the public page, not to
   protect anything.
   ========================================================================== */
(function () {
  'use strict';

  if (new URLSearchParams(location.search).get('preview') !== 'live') return;

  var main = document.getElementById('research');
  if (!main) return;

  /* --- Banner, so a preview is never mistaken for the real archive ------- */
  var banner = document.createElement('p');
  banner.className = 'preview-flag';
  banner.textContent =
    'Preview — sample data for layout only. None of these entries are real.';
  main.insertBefore(banner, main.firstElementChild);

  main.setAttribute('data-state', 'live');

  function fill(selector, rows) {
    var body = document.querySelector(selector);
    if (!body) return;
    body.innerHTML = rows.map(function (cells) {
      var attrs = cells.attrs || '';
      return '<tr ' + attrs + '>' +
        cells.tds.map(function (t) { return '<td' + (t.cls ? ' class="' + t.cls + '"' : '') +
          (t.attr ? ' ' + t.attr : '') + '>' + t.v + '</td>'; }).join('') +
        '</tr>';
    }).join('');
  }

  /* --- Notes ------------------------------------------------------------- */
  fill('.tbl:not(.tbl--trades) tbody', [
    { tds: [{ v: '14 Oct 2026' }, { v: 'Macro' }, { v: 'The gilt curve after the Autumn Budget' },
            { v: 'Sample author, 2nd year' }, { v: '<a href="#">PDF</a>' }] },
    { tds: [{ v: '09 Oct 2026' }, { v: 'Equities' }, { v: 'Greggs: what the market is pricing in' },
            { v: 'Sample author, 3rd year' }, { v: '<a href="#">PDF</a>' }] },
    { tds: [{ v: '02 Oct 2026' }, { v: 'Quant' }, { v: 'Pricing options with gradient boosting' },
            { v: 'Sample author, 4th year' }, { v: '<a href="#">PDF</a>' }] }
  ]);

  /* --- Trades ------------------------------------------------------------ */
  fill('.tbl--trades tbody', [
    { attrs: 'data-entry="2412.00" data-last="2588.50" data-side="long"',
      tds: [{ v: 'Equities' }, { v: 'GRG LN' }, { v: 'Long' }, { v: '2412.00', cls: 'num' },
            { v: '09 Oct 2026' }, { v: '2588.50', cls: 'num' },
            { v: '&mdash;', cls: 'num', attr: 'data-return' }, { v: 'Open' }] },
    { attrs: 'data-entry="4.21" data-last="4.44" data-side="short"',
      tds: [{ v: 'FICC' }, { v: 'UKT 10y' }, { v: 'Short' }, { v: '4.21', cls: 'num' },
            { v: '14 Oct 2026' }, { v: '4.44', cls: 'num' },
            { v: '&mdash;', cls: 'num', attr: 'data-return' }, { v: 'Open' }] },
    { attrs: 'data-entry="1.0850" data-last="1.0710" data-side="long"',
      tds: [{ v: 'Macro' }, { v: 'EURUSD' }, { v: 'Long' }, { v: '1.0850', cls: 'num' },
            { v: '21 Oct 2026' }, { v: '1.0710', cls: 'num' },
            { v: '&mdash;', cls: 'num', attr: 'data-return' }, { v: 'Closed' }] }
  ]);

  /* --- Books ------------------------------------------------------------- */
  var states = [
    { s: 'October reviewed', l: 'Latest review +2.4%' },
    { s: 'October reviewed', l: 'Latest review &minus;1.1%' },
    { s: 'October reviewed', l: 'Latest review +0.8%' },
    { s: 'October reviewed', l: 'Latest review +3.6%' }
  ];
  var books = document.querySelectorAll('.book');
  Array.prototype.forEach.call(books, function (b, i) {
    if (!states[i]) return;
    b.querySelector('.book__state').textContent = states[i].s;
    b.querySelector('.book__last').innerHTML = states[i].l;
  });
  var rollup = document.querySelector('.rollup__v');
  if (rollup) rollup.textContent = '+1.4%';

  /* Tracker runs on DOMContentLoaded and these rows arrive after it, so the
     percentages are computed here instead. */
  var rows = document.querySelectorAll('.tbl--trades tbody tr[data-entry]');
  Array.prototype.forEach.call(rows, function (row) {
    var entry = parseFloat(row.getAttribute('data-entry'));
    var last = parseFloat(row.getAttribute('data-last'));
    var side = row.getAttribute('data-side');
    var cell = row.querySelector('[data-return]');
    if (!cell || !isFinite(entry) || !isFinite(last) || entry === 0) return;
    var raw = ((last - entry) / entry) * 100;
    if (side === 'short') raw = -raw;
    var v = Math.round(raw * 10) / 10;
    cell.textContent = (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    cell.className = 'num tbl__ret--' + (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
  });
})();
