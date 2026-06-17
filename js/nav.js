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
