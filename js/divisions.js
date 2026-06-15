/* ===========================================================================
   js/divisions.js
   ---------------------------------------------------------------------------
   Accessible tablist for the divisions explorer. Implements the WAI-ARIA
   tabs pattern: one tab is focusable at a time (roving tabindex), arrow keys
   move between tabs (and activate on focus), Home/End jump to the ends, and
   the matching panel is shown while the others are hidden.

   No dependencies. Honours the markup: each [role="tab"] has aria-controls
   pointing at its [role="tabpanel"]; the active panel carries .is-active.
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
    tabs.forEach(function (t) {
      var selected = t === tab;
      t.setAttribute('aria-selected', selected ? 'true' : 'false');
      t.tabIndex = selected ? 0 : -1;            // roving tabindex
      var panel = panelFor(t);
      if (!panel) return;
      panel.hidden = !selected;
      panel.classList.toggle('is-active', selected);
    });
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
