/* ===========================================================================
   Trade tracker — research page.

   Each trade row carries its own numbers as data attributes:

     <tr data-entry="187.40" data-last="201.10" data-side="long">

   and this fills in the Return cell from them. The committee therefore only
   ever edits two numbers when marking the book; the percentage, its sign and
   its colour follow.

   Prices are marked by hand when the monthly review is written. There is no
   live feed: this is a static site, and any market data key shipped to the
   browser would be public. Marking monthly is also how the books are actually reviewed.
   ========================================================================== */
(function () {
  'use strict';

  var tables = document.querySelectorAll('[data-tracker]');
  if (!tables.length) return;

  function pct(entry, last, side) {
    var raw = ((last - entry) / entry) * 100;
    return side === 'short' ? -raw : raw;
  }

  Array.prototype.forEach.call(tables, function (table) {
    var rows = table.querySelectorAll('tbody tr[data-entry][data-last]');

    Array.prototype.forEach.call(rows, function (row) {
      var entry = parseFloat(row.getAttribute('data-entry'));
      var last = parseFloat(row.getAttribute('data-last'));
      var side = (row.getAttribute('data-side') || 'long').toLowerCase();
      var cell = row.querySelector('[data-return]');
      if (!cell || !isFinite(entry) || !isFinite(last) || entry === 0) return;

      var value = pct(entry, last, side);
      var rounded = Math.round(value * 10) / 10;

      cell.textContent = (rounded > 0 ? '+' : '') + rounded.toFixed(1) + '%';
      cell.className = 'num tbl__ret--' +
        (rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat');
    });
  });
})();
