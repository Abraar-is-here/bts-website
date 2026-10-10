/* About page: the history timeline. Click a stop, drag along the rail, or use
   the arrow keys. Without JS every stage shows, stacked, as plain content. */
(function () {
  var root = document.querySelector('[data-timeline]');
  if (!root) return;
  var rail = root.querySelector('.tl__rail');
  var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
  var panels = Array.prototype.slice.call(root.querySelectorAll('[role="tabpanel"]'));
  if (!rail || tabs.length < 2 || tabs.length !== panels.length) return;

  var current = -1;
  var last = tabs.length - 1;

  function select(i, focus) {
    i = Math.max(0, Math.min(last, i));
    if (i === current) return;
    current = i;
    tabs.forEach(function (t, n) {
      var on = n === i;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      t.classList.toggle('is-passed', n < i);
    });
    panels.forEach(function (p, n) { p.hidden = n !== i; });
    rail.style.setProperty('--p', String(i / last));
    if (focus) tabs[i].focus();
  }

  root.classList.add('is-js');
  select(last);

  tabs.forEach(function (t, n) {
    t.addEventListener('click', function () { select(n); });
    t.addEventListener('keydown', function (e) {
      var k = e.key, to = null;
      if (k === 'ArrowRight' || k === 'ArrowDown') to = n + 1;
      else if (k === 'ArrowLeft' || k === 'ArrowUp') to = n - 1;
      else if (k === 'Home') to = 0;
      else if (k === 'End') to = last;
      if (to === null) return;
      e.preventDefault();
      select(to, true);
    });
  });

  /* Dragging along the rail snaps to the nearest stop. */
  var dragging = false;
  function nearest(e) {
    var r = rail.getBoundingClientRect();
    var first = tabs[0].getBoundingClientRect();
    var end = tabs[last].getBoundingClientRect();
    var x0 = first.left + first.width / 2, x1 = end.left + end.width / 2;
    var f = (e.clientX - x0) / (x1 - x0);
    return Math.round(Math.max(0, Math.min(1, f)) * last);
  }
  rail.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    select(nearest(e));
  });
  rail.addEventListener('pointermove', function (e) {
    if (dragging) select(nearest(e));
  });
  function stop() { dragging = false; }
  rail.addEventListener('pointerup', stop);
  rail.addEventListener('pointercancel', stop);
  rail.addEventListener('pointerleave', stop);
})();
