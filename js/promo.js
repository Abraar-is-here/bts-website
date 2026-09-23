;(function () {
  'use strict'

  /* Time-limited promos remove themselves. Any element with data-until is
     dropped once that moment has passed, so a "next event" banner cannot sit
     on the site advertising something that already happened. Everything stays
     in the HTML, so with JS off the promo simply shows as written. */
  var now = Date.now()
  document.querySelectorAll('[data-until]').forEach(function (el) {
    var until = Date.parse(el.getAttribute('data-until'))
    if (!isNaN(until) && now > until) el.remove()
  })
}())
