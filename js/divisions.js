/* ===========================================================================
   js/divisions.js
   ---------------------------------------------------------------------------
   Accessible tablist for the divisions explorer. Implements the WAI-ARIA
   tabs pattern: one tab is focusable at a time (roving tabindex), arrow keys
   move between tabs (and activate on focus), Home/End jump to the ends, and
   the matching panel cross-fades in while the previous one fades out.
   ========================================================================== */
(function () {
  'use strict';

  var tablist = document.querySelector('[role="tablist"]');
  if (!tablist) return;

  var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
  if (!tabs.length) return;

  function panelFor(tab) {
    return document.getElementById(tab.getAttribute('aria-controls'));
  }

  function select(tab, setFocus) {
    // Find the currently active tab/panel
    var prev = null;
    tabs.forEach(function (t) {
      if (t.getAttribute('aria-selected') === 'true') prev = t;
    });

    if (prev === tab) return; // same tab — nothing to do

    var prevPanel = prev ? panelFor(prev) : null;
    var nextPanel = panelFor(tab);

    // Update ARIA + roving tabindex on all tabs immediately
    tabs.forEach(function (t) {
      var selected = t === tab;
      t.setAttribute('aria-selected', selected ? 'true' : 'false');
      t.tabIndex = selected ? 0 : -1;
    });

    // Start exit on the outgoing panel
    if (prevPanel) {
      prevPanel.classList.remove('is-active');
      prevPanel.classList.add('is-leaving');
    }

    // After the exit animation completes, swap panels
    setTimeout(function () {
      if (prevPanel) {
        prevPanel.hidden = true;
        prevPanel.classList.remove('is-leaving');
      }
      if (nextPanel) {
        nextPanel.hidden = false;
        void nextPanel.offsetWidth; // force reflow so enter animation fires fresh
        nextPanel.classList.add('is-active');
      }
    }, 160);

    if (setFocus) tab.focus();
  }

  tablist.addEventListener('click', function (e) {
    var tab = e.target.closest('[role="tab"]');
    if (tab) select(tab, false);
  });

  tablist.addEventListener('keydown', function (e) {
    var i = tabs.indexOf(document.activeElement);
    if (i === -1) return;
    var next = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown': next = tabs[(i + 1) % tabs.length]; break;
      case 'ArrowLeft':
      case 'ArrowUp':   next = tabs[(i - 1 + tabs.length) % tabs.length]; break;
      case 'Home':      next = tabs[0]; break;
      case 'End':       next = tabs[tabs.length - 1]; break;
      default: return;
    }
    e.preventDefault();
    select(next, true);
  });
})();
