/* ===========================================================================
   creed.js — the home page's pinned line (section.creed).

   The section gets enough height for one screen-and-a-bit of scrolling per
   language; the stage inside it sticks to the viewport meanwhile. Scroll
   position decides how much of the current language's line is written, so
   scrolling back un-writes it. Each language types out over the first part
   of its stretch and holds for the rest.

   With reduced motion (or no JS) none of this runs: the section is a plain
   statement in English.
   ========================================================================== */
(function () {
  'use strict';

  // The "Scroll" cue under the sponsors wall: it shows as it comes into
  // view, then fades on its own after a moment rather than staying put.
  var scrollCue = document.querySelector('[data-scroll-cue]');
  if (scrollCue && 'IntersectionObserver' in window) {
    var cueTimer = 0;
    scrollCue.hidden = false;
    new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      clearTimeout(cueTimer);
      scrollCue.classList.add('is-on');
      cueTimer = setTimeout(function () { scrollCue.classList.remove('is-on'); }, 1600);
    }, { threshold: 1 }).observe(scrollCue);
  }

  var section = document.querySelector('[data-creed]');
  if (!section) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var line = section.querySelector('[data-creed-line]');
  var items = Array.prototype.slice.call(section.querySelectorAll('[data-creed-langs] li'));
  if (!line || !items.length) return;

  // Split by what a reader sees as one character, so Hindi and Korean
  // syllables never come out half-drawn.
  var seg = window.Intl && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  var langs = items.map(function (li) {
    var text = li.textContent;
    return {
      lang: li.getAttribute('lang') || 'en',
      dir: li.getAttribute('dir') || 'ltr',
      chars: seg ? Array.from(seg.segment(text), function (s) { return s.segment; }) : Array.from(text)
    };
  });

  var TYPE = 0.72;   // share of each language's stretch spent writing
  var EASE = 0.085;  // share of the remaining gap the text catches up each frame
  section.style.setProperty('--creed-steps', langs.length);
  section.classList.add('is-live');

  // The line is the written part plus one letter fading in.
  line.textContent = '';
  var solidNode = document.createTextNode('');
  var ink = document.createElement('span');
  ink.className = 'creed__ink';
  line.appendChild(solidNode);
  line.appendChild(ink);


  var shown = { i: -1, k: -1, f: -1 }, active = false, raf = 0;
  var target = 0, cur = 0;

  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // Where the scroll says the writing should be, from 0 to 1. It starts while
  // the section is still sliding in, so the stage is never empty for long.
  function measure() {
    var rect = section.getBoundingClientRect();
    var vh = window.innerHeight;
    var travel = section.offsetHeight - vh;
    target = clamp((vh * 0.45 - rect.top) / (travel + vh * 0.45));
  }

  function draw(p) {
    var n = langs.length;
    var pos = p * n;
    var i = Math.min(n - 1, Math.floor(pos));
    var u = i === n - 1 && p >= 0.999 ? 1 : pos - i;
    var L = langs[i];
    var w = clamp(u / TYPE);
    var kf = w * L.chars.length;
    var k = Math.min(L.chars.length, Math.floor(kf));
    var f = k < L.chars.length ? Math.round((kf - k) * 50) / 50 : 0;

    if (i !== shown.i) {
      line.setAttribute('lang', L.lang);
      line.setAttribute('dir', L.dir);
    }
    if (i !== shown.i || k !== shown.k) {
      solidNode.data = L.chars.slice(0, k).join('');
      ink.textContent = k < L.chars.length ? L.chars[k] : '';
      // No caret on an empty line: it appears with the first whole letter.
      line.classList.toggle('is-typing', k > 0 && k < L.chars.length);
    }
    if (i !== shown.i || k !== shown.k || f !== shown.f) ink.style.opacity = f;
    shown.i = i; shown.k = k; shown.f = f;

  }

  // The text eases toward the scroll position rather than jumping to it, so
  // a flick of the wheel writes a few letters at a time instead of a word.
  function tick() {
    cur += (target - cur) * EASE;
    if (Math.abs(target - cur) < 0.0002) cur = target;
    draw(cur);
    raf = cur !== target ? requestAnimationFrame(tick) : 0;
  }

  function onScroll() {
    if (!active) return;
    measure();
    if (!raf) raf = requestAnimationFrame(tick);
  }

  // Only listen while the section is anywhere near the screen.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      active = entries[0].isIntersecting;
      if (active) onScroll();
    }, { rootMargin: '50% 0px' }).observe(section);
  } else {
    active = true;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  // Arriving mid-section (a reload, a link) starts where the page is.
  measure();
  cur = target;
  draw(cur);
})();
