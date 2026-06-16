(function () {
  'use strict';

  var HOVER_RATE = 0.2; // 5× slower on hover, still visibly moving

  var stage = document.querySelector('.partners__stage');
  if (!stage) return;

  var fwd = stage.querySelector('.partners__row--fwd .partners__inner');
  var rev = stage.querySelector('.partners__row--rev .partners__inner');

  function setRate(el, rate) {
    if (!el) return;
    var anims = el.getAnimations();
    if (anims.length) anims[0].playbackRate = rate;
  }

  stage.addEventListener('mouseenter', function () {
    setRate(fwd, HOVER_RATE);
    setRate(rev, HOVER_RATE);
  });

  stage.addEventListener('mouseleave', function () {
    setRate(fwd, 1);
    setRate(rev, 1);
  });
})();
