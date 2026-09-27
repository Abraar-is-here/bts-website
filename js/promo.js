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

  /* The mirror image: data-after elements ship hidden and are revealed once
     that moment has passed, so a page can state what replaced the thing that
     expired. Hidden rather than removed in the markup, so with JS off the page
     keeps the live version rather than showing both at once. */
  document.querySelectorAll('[data-after]').forEach(function (el) {
    var after = Date.parse(el.getAttribute('data-after'))
    if (!isNaN(after) && now >= after) el.hidden = false
  })
}())
