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

    // Same-page anchors are not navigations. These pages carry <base href="/">,
    // so a bare "#id" would resolve against the base rather than the current
    // document — the in-page links therefore have to be written as
    // "/privacy/#id", which no longer matches the startsWith('#') test above.
    // Compare the resolved URL instead and let the browser scroll natively.
    if (link.hash && link.pathname === window.location.pathname
        && link.host === window.location.host) return;

    e.preventDefault();
    document.body.classList.add('is-leaving');

    setTimeout(function () {
      window.location.href = href;
    }, 160);
  });
})();
