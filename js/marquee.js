(function () {
  'use strict';

  var NORMAL_FWD_MS = 48000;
  var NORMAL_REV_MS = 38000;
  var HOVER_MULT    = 5;

  var stage = document.querySelector('.partners__stage');
  if (!stage) return;

  var fwd = stage.querySelector('.partners__row--fwd .partners__inner');
  var rev = stage.querySelector('.partners__row--rev .partners__inner');

  function getX(el) {
    var t = window.getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    return new DOMMatrix(t).m41;
  }

  function applySpeed(el, isForward, durationMs) {
    var x     = getX(el);
    var halfW = el.scrollWidth * 0.5;
    if (halfW === 0) return;
    var fraction = isForward
      ? Math.abs(x) / halfW
      : (x + halfW) / halfW;
    fraction = Math.max(0, Math.min(1, fraction));
    el.style.animationDuration = durationMs + 'ms';
    el.style.animationDelay   = -(fraction * durationMs) + 'ms';
  }

  stage.addEventListener('mouseenter', function () {
    if (fwd) applySpeed(fwd, true,  NORMAL_FWD_MS * HOVER_MULT);
    if (rev) applySpeed(rev, false, NORMAL_REV_MS * HOVER_MULT);
  });
  stage.addEventListener('mouseleave', function () {
    if (fwd) applySpeed(fwd, true,  NORMAL_FWD_MS);
    if (rev) applySpeed(rev, false, NORMAL_REV_MS);
  });
})();
