;(function () {
  'use strict'

  const btn  = document.querySelector('.nav__menu-btn')
  const menu = document.querySelector('.nav__dropdown')
  if (!btn || !menu) return

  function close () {
    btn.setAttribute('aria-expanded', 'false')
    menu.classList.remove('nav__dropdown--open')
  }

  function open () {
    btn.setAttribute('aria-expanded', 'true')
    menu.classList.add('nav__dropdown--open')
  }

  btn.addEventListener('click', e => {
    e.stopPropagation()
    btn.getAttribute('aria-expanded') === 'true' ? close() : open()
  })

  // Close on outside tap / click
  document.addEventListener('click', close)

  // Close on Escape
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close() })

  // Close when a dropdown link is followed
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', close))
}())

// "The Floor" carries a green dot while London or New York is trading
// (Mon–Fri, LSE 08:00–16:30, NYSE 09:30–16:00 local time). Holidays aren't
// known, so on one the dot shows during the usual hours.
;(function () {
  'use strict'
  const link = document.querySelector('.nav__floor')
  if (!link || !window.Intl) return
  const MARKETS = [['Europe/London', 480, 990], ['America/New_York', 570, 960]]
  // Said after the name for screen readers; the dot itself is hidden from them.
  const note = document.createElement('span')
  note.className = 'visually-hidden'
  link.appendChild(note)
  const fmts = MARKETS.map(m => new Intl.DateTimeFormat('en-GB', { timeZone: m[0], weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))

  function check () {
    const now = window.BTSClock ? window.BTSClock.now() : Date.now()
    const open = MARKETS.some((m, i) => {
      const p = {}
      fmts[i].formatToParts(now).forEach(x => { p[x.type] = x.value })
      const mins = +p.hour * 60 + +p.minute
      return p.weekday !== 'Sat' && p.weekday !== 'Sun' && mins >= m[1] && mins < m[2]
    })
    link.classList.toggle('is-live', open)
    note.textContent = open ? ', markets open' : ''
  }
  check()
  setInterval(check, 60000)
}())
