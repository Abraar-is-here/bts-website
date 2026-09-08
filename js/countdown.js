;(function () {
  'use strict'

  const el = document.querySelector('[data-countdown]')
  if (!el) return

  const deadline = new Date(el.getAttribute('data-countdown'))
  if (isNaN(deadline.getTime())) return

  const slot = {
    d: el.querySelector('[data-cd="d"]'),
    h: el.querySelector('[data-cd="h"]'),
    m: el.querySelector('[data-cd="m"]'),
    s: el.querySelector('[data-cd="s"]')
  }
  if (!slot.h || !slot.m || !slot.s) return

  const days = el.querySelector('[data-cd-days]')
  const pad  = n => String(n).padStart(2, '0')

  let timer = null

  function tick () {
    const left = deadline.getTime() - Date.now()

    if (left <= 0) {
      if (timer) clearInterval(timer)
      el.classList.add('hero__deadline--closed')
      el.textContent = 'Applications have closed'
      return
    }

    const total = Math.floor(left / 1000)
    const d     = Math.floor(total / 86400)

    if (slot.d) slot.d.textContent = d
    slot.h.textContent = pad(Math.floor(total / 3600) % 24)
    slot.m.textContent = pad(Math.floor(total / 60) % 60)
    slot.s.textContent = pad(total % 60)

    /* "0d" is noise on the last day, so the slot leaves rather than sits at zero. */
    if (days) days.hidden = d === 0
  }

  tick()
  timer = setInterval(tick, 1000)

  /* A backgrounded tab throttles the interval, so resync on return. */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) tick()
  })
}())
