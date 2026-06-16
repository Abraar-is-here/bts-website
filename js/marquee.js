(function () {
  'use strict';

  var HOVER_RATE = 0.2;

  var inner = document.querySelector('.partners__inner');
  if (!inner) return;

  function setRate(rate) {
    var anims = inner.getAnimations();
    if (anims.length) anims[0].playbackRate = rate;
  }

  var stage = inner.closest('.partners__stage');
  if (stage) {
    stage.addEventListener('mouseenter', function () { setRate(HOVER_RATE); });
    stage.addEventListener('mouseleave', function () { setRate(1); });
  }
})();
