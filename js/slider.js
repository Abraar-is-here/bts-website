(function () {
  'use strict';

  var DURATION = 650;
  var INTERVAL = 6000;

  var slider  = document.querySelector('.hero-slider');
  if (!slider) return;

  var slides  = Array.from(slider.querySelectorAll('.hero-slide'));
  var dots    = Array.from(slider.querySelectorAll('.hero-dot'));
  var prevBtn = slider.querySelector('.hero-ctrl--prev');
  var nextBtn = slider.querySelector('.hero-ctrl--next');
  var current = 0;
  var timer   = null;
  var busy    = false;

  /* direction: 'left'  → exit left,  enter from right  (left arrow / auto)
                'right' → exit right, enter from left   (right arrow)       */
  function goTo(index, direction) {
    if (busy) return;

    var next = ((index % slides.length) + slides.length) % slides.length;
    if (next === current) return;

    busy = true;

    var prev     = current;
    current      = next;
    var entering = slides[next];
    var exiting  = slides[prev];

    var enterFrom = direction === 'right' ? '-100%' : '100%';
    var exitTo    = direction === 'right' ? '100%'  : '-100%';

    // Update dots & ARIA immediately
    dots[prev].classList.remove('hero-dot--active');
    dots[prev].setAttribute('aria-selected', 'false');
    slides[prev].setAttribute('aria-hidden', 'true');
    dots[next].classList.add('hero-dot--active');
    dots[next].setAttribute('aria-selected', 'true');
    slides[next].setAttribute('aria-hidden', 'false');

    // Place entering slide off-screen with no transition yet
    entering.style.transform = 'translateX(' + enterFrom + ')';
    entering.style.opacity   = '1';

    // Force layout so the initial position is committed before we add transition
    entering.getBoundingClientRect();

    // Arm transitions on both slides
    entering.classList.add('hero-slide--in-transit');
    exiting.classList.add('hero-slide--in-transit');

    // Trigger the slide
    entering.style.transform = 'translateX(0)';
    exiting.style.transform  = 'translateX(' + exitTo + ')';

    setTimeout(function () {
      // Settle entering
      entering.classList.add('hero-slide--active');
      entering.classList.remove('hero-slide--in-transit');
      entering.style.transform = '';
      entering.style.opacity   = '';

      // Reset exiting (now off-screen & invisible)
      exiting.classList.remove('hero-slide--active', 'hero-slide--in-transit');
      exiting.style.transform = '';

      busy = false;
    }, DURATION);
  }

  function advance() { goTo(current + 1, 'left'); }

  function startTimer() {
    clearInterval(timer);
    timer = setInterval(advance, INTERVAL);
  }

  function resetTimer() {
    clearInterval(timer);
    startTimer();
  }

  // Left arrow  → exit left,  enter from right
  if (prevBtn) prevBtn.addEventListener('click', function () {
    goTo(current - 1, 'left');
    resetTimer();
  });

  // Right arrow → exit right, enter from left
  if (nextBtn) nextBtn.addEventListener('click', function () {
    goTo(current + 1, 'right');
    resetTimer();
  });

  // Dots
  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () {
      goTo(i, i > current ? 'left' : 'right');
      resetTimer();
    });
  });

  // Pause on hover
  slider.addEventListener('mouseenter', function () { clearInterval(timer); });
  slider.addEventListener('mouseleave', startTimer);

  // Touch swipe — swipe left → advance left, swipe right → go right
  var touchX = 0;
  slider.addEventListener('touchstart', function (e) {
    touchX = e.changedTouches[0].clientX;
  }, { passive: true });
  slider.addEventListener('touchend', function (e) {
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) {
      dx < 0 ? goTo(current + 1, 'left') : goTo(current - 1, 'right');
      resetTimer();
    }
  }, { passive: true });

  // Keyboard
  slider.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft')  { goTo(current - 1, 'left');  resetTimer(); }
    if (e.key === 'ArrowRight') { goTo(current + 1, 'right'); resetTimer(); }
  });

  // Auto-advance (respects prefers-reduced-motion)
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    startTimer();
  }
}());
