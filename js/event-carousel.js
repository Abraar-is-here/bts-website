/* Home page: the upcoming-events carousel. One event per slide; it moves on
   by itself every 10 seconds and pauses while the pointer, focus or a touch is
   on it, while the tab is hidden, and entirely under reduced motion. Slides
   that expire (js/promo.js removes them) drop out of the dots on their own. */
(function () {
  var root = document.querySelector('[data-carousel]');
  if (!root) return;
  var track = root.querySelector('.evc__track');
  var dotsBox = root.querySelector('.evc__dots');
  var prev = root.querySelector('[data-evc-prev]');
  var next = root.querySelector('[data-evc-next]');
  if (!track || !dotsBox || !prev || !next) return;

  var DELAY = 10000;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var slides = [];
  var current = 0;
  var timer = null;
  var holds = 0;

  function slideList() {
    return Array.prototype.slice.call(track.children).filter(function (el) {
      return el.classList.contains('evc__slide');
    });
  }

  function build() {
    slides = slideList();
    root.hidden = slides.length === 0;
    root.classList.toggle('is-single', slides.length < 2);
    dotsBox.textContent = '';
    slides.forEach(function (s, i) {
      s.setAttribute('aria-label', (i + 1) + ' of ' + slides.length);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'evc__dot';
      b.setAttribute('aria-label', 'Show event ' + (i + 1) + ' of ' + slides.length);
      b.innerHTML = '<span class="evc__fill"></span>';
      b.addEventListener('click', function () { go(i, true); });
      dotsBox.appendChild(b);
    });
    if (current >= slides.length) current = 0;
    mark();
    restart();
  }

  function mark() {
    var dots = dotsBox.children;
    for (var i = 0; i < dots.length; i++) {
      var on = i === current;
      dots[i].classList.toggle('is-active', on);
      if (on) dots[i].setAttribute('aria-current', 'true');
      else dots[i].removeAttribute('aria-current');
    }
    slides.forEach(function (s, i) { s.setAttribute('aria-hidden', i === current ? 'false' : 'true'); s.inert = i !== current; });
  }

  function go(i, user) {
    if (!slides.length) return;
    current = (i + slides.length) % slides.length;
    track.scrollTo({ left: slides[current].offsetLeft - track.offsetLeft, behavior: reduce.matches ? 'auto' : 'smooth' });
    mark();
    if (user) restart();
  }

  function restart() {
    clearTimeout(timer);
    var run = slides.length > 1 && !reduce.matches && holds === 0 && !document.hidden;
    root.classList.toggle('is-playing', run);
    // Restart the progress fill on the active dot.
    var active = dotsBox.querySelector('.is-active .evc__fill');
    if (active) { active.style.animation = 'none'; void active.offsetWidth; active.style.animation = ''; }
    if (run) timer = setTimeout(function () { go(current + 1); restart(); }, DELAY);
  }

  function hold() { holds++; restart(); }
  function release() { holds = Math.max(0, holds - 1); restart(); }

  prev.addEventListener('click', function () { go(current - 1, true); });
  next.addEventListener('click', function () { go(current + 1, true); });

  root.addEventListener('mouseenter', hold);
  root.addEventListener('mouseleave', release);
  root.addEventListener('focusin', function (e) { if (!root.contains(e.relatedTarget)) hold(); });
  root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) release(); });
  document.addEventListener('visibilitychange', restart);
  if (reduce.addEventListener) reduce.addEventListener('change', restart);

  // A swipe moves the track by itself: follow it to the nearest slide.
  var settle;
  track.addEventListener('scroll', function () {
    clearTimeout(settle);
    settle = setTimeout(function () {
      var x = track.scrollLeft, best = 0, bestD = Infinity;
      slides.forEach(function (s, i) {
        var d = Math.abs(s.offsetLeft - track.offsetLeft - x);
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best !== current) { current = best; mark(); restart(); }
    }, 120);
  }, { passive: true });

  root.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('a, input, textarea')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(current + 1, true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1, true); }
  });

  new MutationObserver(build).observe(track, { childList: true });
  build();
})();
