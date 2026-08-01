/* ===========================================================================
   Cookie consent
   ---------------------------------------------------------------------------
   Google Analytics sets cookies on the visitor's device. Under PECR that needs
   opt-in consent, and analytics does not qualify as "strictly necessary", so
   nothing GA-related is loaded until the visitor accepts.

   Deliberately no tag manager and no third-party CMP: those load their own
   trackers before consent, which is the problem this is meant to solve.

   The stored value is one of 'accepted' | 'rejected'. Anything else (including
   a cleared store or a browser that blocks localStorage) is treated as "not
   asked yet", which fails safe: no analytics loads.
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'bts-cookie-consent';
  var GA_ID = 'G-ENSZNRQNLG';

  function read() {
    try { return window.localStorage.getItem(KEY); }
    catch (e) { return null; }          // private mode / storage disabled
  }
  function write(v) {
    try { window.localStorage.setItem(KEY, v); }
    catch (e) { /* choice just won't persist; banner reappears next visit */ }
  }

  var loaded = false;
  function loadAnalytics() {
    if (loaded || !GA_ID) return;
    loaded = true;

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    // anonymize_ip trims the last octet before storage — less personal data
    // for the same page-level numbers.
    gtag('config', GA_ID, { anonymize_ip: true });
  }

  /* Rejecting has to remove cookies already dropped, not merely stop new ones —
     otherwise anyone who accepts and later changes their mind keeps being
     tracked by the cookies still sitting on their device.

     GA writes _ga / _ga_<ID> / _gid. Expiring a cookie requires the same path
     and domain it was set with, and we cannot read those back, so we sweep the
     plausible combinations: current host, dot-prefixed host, and the
     registrable domain. */
  function clearAnalyticsCookies() {
    var host = window.location.hostname;
    var domains = ['', host, '.' + host];
    var parts = host.split('.');
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));

    document.cookie.split(';').forEach(function (raw) {
      var name = raw.split('=')[0].trim();
      if (!/^_ga|^_gid$|^_gat/.test(name)) return;
      domains.forEach(function (d) {
        document.cookie = name + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : '');
      });
    });
  }

  function build() {
    var bar = document.createElement('aside');
    bar.className = 'cookie-bar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-live', 'polite');
    bar.setAttribute('aria-label', 'Cookie choices');
    bar.innerHTML =
      '<p class="cookie-bar__title">Cookies</p>' +
      '<p class="cookie-bar__text">We use analytics cookies to understand how this site is ' +
      'used. Nothing is set unless you accept. ' +
      '<a href="/privacy">Privacy Policy</a>.</p>' +
      '<div class="cookie-bar__actions">' +
        '<button type="button" class="cookie-bar__btn cookie-bar__btn--accept" data-accept>Accept</button>' +
        '<button type="button" class="cookie-bar__btn cookie-bar__btn--reject" data-reject>Reject</button>' +
      '</div>';

    function close(choice) {
      write(choice);
      if (choice === 'accepted') loadAnalytics();
      else clearAnalyticsCookies();
      bar.remove();
    }
    bar.querySelector('[data-accept]').addEventListener('click', function () { close('accepted'); });
    bar.querySelector('[data-reject]').addEventListener('click', function () { close('rejected'); });

    document.body.appendChild(bar);
    // Move focus to the banner so keyboard and screen-reader users meet the
    // choice rather than having to hunt for it.
    bar.querySelector('[data-accept]').focus({ preventScroll: true });
  }

  function init() {
    var choice = read();
    if (choice === 'accepted') { loadAnalytics(); return; }
    if (choice === 'rejected') return;
    build();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
