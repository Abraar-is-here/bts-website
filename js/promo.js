;(function () {
  'use strict'

  /* Everything on the site that depends on the time runs off this one clock.

     data-until="<ISO time>"     removed at that moment (an expired promo, a
                                 form that has closed)
     data-after="<ISO time>"     ships hidden, revealed at that moment (what
                                 replaced the thing that expired)
     data-countdown="<ISO time>" a live countdown; writes "1d 04h 12m 09s" into
                                 its [data-cd-clock] child, or its own text

     Elements change on the second, including on a page that was left open,
     not just on the next load. With JS off everything shows as written, so the
     live version stays up rather than both versions at once.

     A visitor's device clock can be wrong by minutes. The server's Date header
     is used to correct it when the gap is more than a couple of seconds, so a
     deadline closes when it actually passes, not when someone's laptop thinks
     it has. Other scripts read the same corrected time from window.BTSClock. */

  var offset = 0
  function now () { return Date.now() + offset }
  window.BTSClock = { now: now }

  function times (attr) {
    return Array.prototype.map.call(document.querySelectorAll('[' + attr + ']'), function (el) {
      return { el: el, at: Date.parse(el.getAttribute(attr)) }
    }).filter(function (item) { return !isNaN(item.at) })
  }

  var untils = times('data-until')
  var afters = times('data-after')
  var clocks = times('data-countdown')

  var pad = function (n) { return (n < 10 ? '0' : '') + n }

  function render (item, t) {
    var out = item.el.querySelector('[data-cd-clock]') || item.el
    var left = Math.max(0, Math.ceil((item.at - t) / 1000))
    var d = Math.floor(left / 86400)
    var text = pad(Math.floor(left / 3600) % 24) + 'h ' + pad(Math.floor(left / 60) % 60) + 'm ' + pad(left % 60) + 's'
    out.textContent = (d > 0 ? d + 'd ' : '') + text
  }

  var timer = 0

  function update () {
    clearTimeout(timer)
    var t = now()

    untils = untils.filter(function (item) {
      if (t >= item.at) { item.el.remove(); return false }
      return true
    })
    afters = afters.filter(function (item) {
      if (t >= item.at) { item.el.hidden = false; return false }
      return true
    })
    clocks = clocks.filter(function (item) {
      if (!item.el.isConnected) return false
      render(item, t)
      return t < item.at
    })

    /* A running clock ticks on each whole second. Otherwise sleep until the
       next change is due (timers cap at ~24 days, and that is plenty). */
    var next = Infinity
    untils.concat(afters).forEach(function (item) { next = Math.min(next, item.at) })
    if (clocks.length) next = Math.min(next, t + 1000 - (t % 1000))
    if (next !== Infinity && next - t < 2147483647) timer = setTimeout(update, Math.max(0, next - t))
  }

  update()

  /* Background tabs throttle timers, so catch up on return. */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) update()
  })

  /* Correct a wrong device clock from the server's own time. Only when there
     is something timed on the page, and only by gaps the header can measure
     (it is accurate to the second). */
  if (!(untils.length || afters.length || clocks.length) || !window.fetch) return
  var sent = Date.now()
  fetch('/', { method: 'HEAD', cache: 'no-store' }).then(function (res) {
    var server = Date.parse(res.headers.get('Date'))
    if (isNaN(server)) return
    var received = Date.now()
    var gap = server + 500 - (sent + received) / 2
    if (Math.abs(gap) > 2000) {
      offset = gap
      update()
    }
  }).catch(function () {})
}())
