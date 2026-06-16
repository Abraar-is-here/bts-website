(function () {
  'use strict';

  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href]');
    if (!link) return;

    var href = link.getAttribute('href');

    // Only intercept internal page navigations — not anchors, external URLs,
    // mailto/tel links, or links that open in a new tab.
    if (
      !href ||
      href.startsWith('#') ||
      href.startsWith('http') ||
      href.startsWith('mailto') ||
      href.startsWith('tel') ||
      link.target === '_blank'
    ) return;

    e.preventDefault();
    document.body.classList.add('is-leaving');

    setTimeout(function () {
      window.location.href = href;
    }, 230);
  });
})();
