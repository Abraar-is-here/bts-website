/* ===========================================================================
   books-method.js — /books/method/: marks the section being read in the
   "On this page" rail, so it follows the reader down the page.
   ========================================================================== */
(function () {
  'use strict';

  var links = Array.prototype.slice.call(document.querySelectorAll('.bkm__toc a'));
  var groups = links.map(function (a) { return document.getElementById(a.hash.slice(1)); });
  if (!links.length || groups.some(function (g) { return !g; })) return;
  var shown = -1, raf = 0;

  // The current section is the last one whose heading has passed the upper
  // third of the screen; before the first gets there, the first.
  function mark() {
    raf = 0;
    var line = window.innerHeight * 0.35, i = 0;
    groups.forEach(function (g, k) { if (g.getBoundingClientRect().top <= line) i = k; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) i = groups.length - 1;
    if (i === shown) return;
    shown = i;
    links.forEach(function (a, k) { if (k === i) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
  }
  function queue() { if (!raf) raf = requestAnimationFrame(mark); }
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  mark();
})();
