/* Cursor light for the home sponsors wall. Each sponsor tile and the partner
   grid get one glow element, moved with transform (no inherited CSS variables,
   so the cells underneath never restyle) and eased toward the pointer so it
   has a little weight. Fine pointers only, and off under reduced motion. */
(function () {
  'use strict';

  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var EASE = 0.2;   // share of the remaining distance covered each frame

  function attach(host) {
    // A list may only contain li, so the grid's glow is an li too.
    var glow = document.createElement(host.tagName === 'UL' ? 'li' : 'span');
    glow.className = 'partners__glow';
    glow.setAttribute('aria-hidden', 'true');
    host.insertBefore(glow, host.firstChild);

    var size = 0;
    var x = 0, y = 0, tx = 0, ty = 0;
    var raf = 0;

    function place() {
      glow.style.transform = 'translate3d(' + (x - size / 2) + 'px,' + (y - size / 2) + 'px,0)';
    }
    function tick() {
      x += (tx - x) * EASE;
      y += (ty - y) * EASE;
      place();
      raf = (Math.abs(tx - x) > 0.5 || Math.abs(ty - y) > 0.5) ? requestAnimationFrame(tick) : 0;
    }
    function target(e) {
      var r = host.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
    }

    host.addEventListener('pointerenter', function (e) {
      size = glow.offsetWidth;
      target(e);
      x = tx; y = ty;   // start where the pointer came in, not where it last left
      place();
    });
    host.addEventListener('pointermove', function (e) {
      target(e);
      if (!raf) raf = requestAnimationFrame(tick);
    });
  }

  Array.prototype.forEach.call(
    document.querySelectorAll('.partners__lead li, .partners__grid'),
    attach
  );
})();
