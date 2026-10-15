/* ===========================================================================
   visit.js — the sign-up form on the link-only visit pages (/visits/...).

   Checks the form in the browser, then posts it to the Apps Script on the
   form's data-endpoint (apps-script/VisitCode.gs), which adds a row to the
   visit's Sheet and emails the analyst a confirmation.

   no-cors + text/plain keeps it a "simple" request Apps Script can read
   without a CORS preflight; the reply is opaque, so a resolved fetch counts
   as sent. ?demo=1 walks the form through to the thank-you without sending.
   ========================================================================== */
(function () {
  'use strict';

  var form = document.getElementById('visitForm');
  if (!form) return;
  var thanks = document.getElementById('visitThanks');
  var status = form.querySelector('[data-status]');
  var submit = form.querySelector('[data-submit]');
  var ENDPOINT = (form.getAttribute('data-endpoint') || '').trim();
  var DEMO = new URLSearchParams(location.search).get('demo') === '1';
  var EVENT = document.title.split(' — ')[0];
  // Sign-ups close at data-closes (js/promo.js also removes the form then);
  // this catches a page left open past the deadline.
  var CLOSES = Date.parse(form.getAttribute('data-closes') || '') || 0;

  var RULES = {
    firstName: function (v) { return v ? '' : 'Enter your first name.'; },
    lastName: function (v) { return v ? '' : 'Enter your last name.'; },
    uniEmail: function (v) {
      if (!v) return 'Enter your university email.';
      return /^[^@\s]+@bristol\.ac\.uk$/i.test(v) ? '' : 'Use your @bristol.ac.uk email.';
    },
    division: function (v) { return v ? '' : 'Choose your division.'; },
    consent: function (v, el) { return el.checked ? '' : 'Tick this to register.'; }
  };

  function check(name) {
    var el = form.elements[name];
    var msg = RULES[name](el.type === 'checkbox' ? '' : el.value.trim(), el);
    var field = el.closest('[data-field]');
    var err = field && field.querySelector('[data-error]');
    if (field) field.classList.toggle('is-invalid', !!msg);
    if (err) err.textContent = msg;
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return !msg;
  }

  // Check a field when you leave it, then live once it has shown an error.
  Object.keys(RULES).forEach(function (name) {
    var el = form.elements[name];
    el.addEventListener('blur', function () { if (el.type !== 'checkbox') check(name); });
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', function () {
      if (el.closest('[data-field]').classList.contains('is-invalid')) check(name);
    });
  });

  function setStatus(text, isError) {
    status.textContent = text || '';
    status.classList.toggle('is-error', !!isError);
  }

  function sending(on) {
    submit.disabled = on;
    submit.setAttribute('aria-busy', String(on));
  }

  function showThanks(email) {
    var slot = thanks.querySelector('[data-thanks-email]');
    if (slot && email) slot.textContent = email;
    form.hidden = true;
    thanks.hidden = false;
    thanks.focus({ preventScroll: true });
    thanks.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setStatus('');
    var bad = Object.keys(RULES).filter(function (n) { return !check(n); });
    if (bad.length) {
      // The red on each field says what is wrong; no summary line as well.
      form.elements[bad[0]].focus();
      return;
    }

    var email = form.uniEmail.value.trim().toLowerCase();
    var payload = {
      event: EVENT,
      firstName: form.firstName.value.trim(),
      lastName: form.lastName.value.trim(),
      uniEmail: email,
      division: form.division.value,
      dietary: form.dietary.value.trim(),
      access: form.access.value.trim(),
      consent: true,
      company: form.company.value,
      submittedAt: new Date().toISOString()
    };

    if (CLOSES && Date.now() >= CLOSES && !DEMO) {
      setStatus('Sign-ups have closed.', true);
      return;
    }

    sending(true);
    if (DEMO) { setTimeout(function () { showThanks(email); }, 500); return; }
    if (!ENDPOINT) {
      sending(false);
      setStatus('Sign-ups aren’t open yet. Message the committee to register your interest.', true);
      console.warn('[visit] data-endpoint is empty: deploy apps-script/VisitCode.gs (see apps-script/SETUP.md).');
      return;
    }
    setStatus('Sending…');
    fetch(ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function () {
      showThanks(email);
    }).catch(function () {
      sending(false);
      setStatus('That didn’t send. Check your connection and try again.', true);
    });
  });
})();
