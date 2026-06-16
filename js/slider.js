(function () {
  'use strict';

  var INTERVAL = 6000;

  var slider = document.querySelector('.hero-slider');
  if (!slider) return;

  var slides  = Array.from(slider.querySelectorAll('.hero-slide'));
  var dots    = Array.from(slider.querySelectorAll('.hero-dot'));
  var prevBtn = slider.querySelector('.hero-ctrl--prev');
  var nextBtn = slider.querySelector('.hero-ctrl--next');
  var current = 0;
  var timer   = null;

  function goTo(index) {
    var prev = current;
    current = ((index % slides.length) + slides.length) % slides.length;
    if (current === prev) return;

    slides[prev].classList.remove('hero-slide--active');
    slides[prev].setAttribute('aria-hidden', 'true');
    dots[prev].classList.remove('hero-dot--active');
    dots[prev].setAttribute('aria-selected', 'false');

    slides[current].classList.add('hero-slide--active');
    slides[current].setAttribute('aria-hidden', 'false');
    dots[current].classList.add('hero-dot--active');
    dots[current].setAttribute('aria-selected', 'true');
  }

  function advance() { goTo(current + 1); }

  function startTimer() {
    clearInterval(timer);
    timer = setInterval(advance, INTERVAL);
  }

  function resetTimer() {
    clearInterval(timer);
    startTimer();
  }

  if (nextBtn) nextBtn.addEventListener('click', function () { goTo(current + 1); resetTimer(); });
  if (prevBtn) prevBtn.addEventListener('click', function () { goTo(current - 1); resetTimer(); });

  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () { goTo(i); resetTimer(); });
  });

  // Pause auto-advance while the user hovers
  slider.addEventListener('mouseenter', function () { clearInterval(timer); });
  slider.addEventListener('mouseleave', startTimer);

  // Touch swipe (50 px threshold)
  var touchX = 0;
  slider.addEventListener('touchstart', function (e) {
    touchX = e.changedTouches[0].clientX;
  }, { passive: true });
  slider.addEventListener('touchend', function (e) {
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) {
      dx < 0 ? goTo(current + 1) : goTo(current - 1);
      resetTimer();
    }
  }, { passive: true });

  // Keyboard navigation when the slider is focused
  slider.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { goTo(current + 1); resetTimer(); }
    if (e.key === 'ArrowLeft')  { goTo(current - 1); resetTimer(); }
  });

  // Only auto-advance if the user hasn't opted out of motion
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    startTimer();
  }
}());
