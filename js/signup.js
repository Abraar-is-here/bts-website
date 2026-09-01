/* ===========================================================================
   Mailing list signup — footer, every page.

   Posts to the same Apps Script deployment as the committee applications, with
   type:'subscribe' so the script routes it to the mailing-list sheet instead of
   the applications sheet. One deployment, two destinations: adding a second
   web app would have meant a second URL to keep in sync.

   no-cors keeps this a "simple" request, so there is no CORS preflight to be
   blocked. The trade-off is that the response is opaque, so a submission that
   reaches Apps Script and fails validation there still reports success here.
   Validation that matters to the user therefore happens before sending.
   ========================================================================== */
(function () {
  'use strict';

  var form = document.getElementById('signupForm');
  if (!form) return;

  var ENDPOINT = form.hasAttribute('data-endpoint')
    ? form.getAttribute('data-endpoint').trim()
    : '';
  var input = document.getElementById('signupEmail');
  var status = form.querySelector('.signup__status');
  var btn = form.querySelector('.signup__btn');
  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  function say(msg, kind) {
    status.textContent = msg;
    status.className = 'signup__status' + (kind ? ' signup__status--' + kind : '');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var email = (input.value || '').trim();
    if (!EMAIL_RE.test(email)) {
      say('Enter a valid email address.', 'err');
      input.focus();
      return;
    }

    if (!ENDPOINT) {
      say('Not connected yet — email us instead.', 'err');
      return;
    }

    btn.disabled = true;
    say('Adding you…');

    fetch(ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'subscribe', email: email, page: location.pathname })
    }).then(function () {
      form.reset();
      say('Done. We will be in touch.', 'ok');
    })['catch'](function () {
      say('That did not send. Please try again.', 'err');
    })['finally'](function () {
      btn.disabled = false;
    });
  });
})();
