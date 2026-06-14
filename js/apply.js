/* ===========================================================================
   js/apply.js
   ---------------------------------------------------------------------------
   Division Head application form: client-side validation, 1st/2nd-choice
   exclusion, PDF handling, and submission to a Google Apps Script web app
   (which writes to a Google Sheet + Drive and emails the committee).

   SETUP: paste your deployed Apps Script URL into CONFIG.APPS_SCRIPT_URL
   below (see apps-script/SETUP.md). Until it's set, the form refuses to submit
   so applications are never silently lost. Append ?demo=1 to the URL to walk
   through the success state without sending anything.
   ========================================================================== */
(function () {
  'use strict';

  var CONFIG = {
    APPS_SCRIPT_URL: '',                 // <-- paste your /exec URL here
    MAX_FILE_MB: 5,
    UNI_EMAIL_RE: /^[^@\s]+@bristol\.ac\.uk$/i,
    EMAIL_RE: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
    URL_RE: /^https?:\/\/.+/i
  };

  var form = document.getElementById('applyForm');
  if (!form) return;
  var thanks = document.getElementById('applyThanks');
  var DEMO = new URLSearchParams(location.search).get('demo') === '1';

  var choice1 = form.choice1;
  var choice2 = form.choice2;
  var cvInput = form.cv;
  var fileNameEl = form.querySelector('[data-filename]');
  var fileMainEl = form.querySelector('.file-field__main');
  var statusEl = form.querySelector('[data-status]');
  var submitBtn = form.querySelector('[data-submit]');
  var submitLabel = form.querySelector('[data-submit-label]');

  /* --- Field error helpers ---------------------------------------------- */
  function fieldOf(input) { return input.closest('[data-field]'); }
  function setError(input, msg) {
    var f = fieldOf(input);
    if (!f) return;
    f.classList.add('is-invalid');
    var e = f.querySelector('[data-error]');
    if (e) {
      // Link the message to the input so screen readers announce it.
      if (!e.id) e.id = (input.id || input.name) + '-error';
      e.textContent = msg || '';
      input.setAttribute('aria-describedby', e.id);
    }
    input.setAttribute('aria-invalid', 'true');
  }
  function clearError(input) {
    var f = fieldOf(input);
    if (!f) return;
    f.classList.remove('is-invalid');
    var e = f.querySelector('[data-error]');
    if (e) e.textContent = '';
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }

  /* Validate a single field (used on blur for early, gentle feedback). */
  function validateOne(input) {
    var name = input.name, v = (input.value || '').trim();
    var required = ['firstName', 'lastName', 'uniEmail', 'phone', 'year', 'course',
                    'choice1', 'choice2'].indexOf(name) !== -1;
    clearError(input);
    if (required && !v) { setError(input, 'This field is required.'); return; }
    if (!v) return; // optional + empty
    if (name === 'uniEmail' && !CONFIG.UNI_EMAIL_RE.test(v))
      setError(input, 'Use your University of Bristol email (ending @bristol.ac.uk).');
    else if (name === 'personalEmail' && !CONFIG.EMAIL_RE.test(v))
      setError(input, 'Enter a valid email address.');
    else if (name === 'linkedin' && !CONFIG.URL_RE.test(v))
      setError(input, 'Enter a full link starting with http(s)://');
    else if (name === 'phone' && v.replace(/\D/g, '').length < 7)
      setError(input, 'Enter a valid phone number.');
    else if (name === 'choice2' && choice1.value && v === choice1.value)
      setError(input, 'Pick a different division from your 1st choice.');
  }

  /* --- Validation -------------------------------------------------------- */
  function validate() {
    var firstInvalid = null;
    function fail(input, msg) { setError(input, msg); if (!firstInvalid) firstInvalid = input; }

    var req = ['firstName', 'lastName', 'uniEmail', 'phone', 'year', 'course', 'choice1', 'choice2'];
    req.forEach(function (name) {
      var input = form[name];
      clearError(input);
      if (!input.value.trim()) fail(input, 'This field is required.');
    });

    // University email must be a @bristol.ac.uk address.
    if (form.uniEmail.value.trim() && !CONFIG.UNI_EMAIL_RE.test(form.uniEmail.value.trim())) {
      fail(form.uniEmail, 'Use your University of Bristol email (ending @bristol.ac.uk).');
    }
    // Optional fields: validate only if filled.
    clearError(form.personalEmail);
    if (form.personalEmail.value.trim() && !CONFIG.EMAIL_RE.test(form.personalEmail.value.trim())) {
      fail(form.personalEmail, 'Enter a valid email address.');
    }
    clearError(form.linkedin);
    if (form.linkedin.value.trim() && !CONFIG.URL_RE.test(form.linkedin.value.trim())) {
      fail(form.linkedin, 'Enter a full link starting with http(s)://');
    }
    // Phone: at least 7 digits.
    if (form.phone.value.trim() && (form.phone.value.replace(/\D/g, '').length < 7)) {
      fail(form.phone, 'Enter a valid phone number.');
    }
    // Two distinct divisions.
    if (choice1.value && choice2.value && choice1.value === choice2.value) {
      fail(choice2, 'Pick a different division from your 1st choice.');
    }
    // CV: required, PDF, within size.
    clearError(cvInput);
    var file = cvInput.files && cvInput.files[0];
    if (!file) {
      fail(cvInput, 'Please attach your CV as a PDF.');
    } else if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      fail(cvInput, 'The CV must be a PDF file.');
    } else if (file.size > CONFIG.MAX_FILE_MB * 1024 * 1024) {
      fail(cvInput, 'That file is over ' + CONFIG.MAX_FILE_MB + ' MB. Please upload a smaller PDF.');
    }

    return firstInvalid;
  }

  /* --- 1st / 2nd choice exclusion --------------------------------------- */
  function syncChoices() {
    // Re-enable everything, then disable the 1st pick inside the 2nd menu.
    Array.prototype.forEach.call(choice2.options, function (o) {
      o.disabled = (o.value !== '' && o.value === choice1.value);
    });
    if (choice2.value && choice2.value === choice1.value) choice2.value = '';
  }
  choice1.addEventListener('change', function () { syncChoices(); clearError(choice2); });

  /* --- File field: reflect the chosen filename -------------------------- */
  cvInput.addEventListener('change', function () {
    clearError(cvInput);
    var file = cvInput.files && cvInput.files[0];
    if (file) {
      fileNameEl.hidden = false;
      fileNameEl.textContent = file.name;
      fileMainEl.textContent = 'PDF attached';
    } else {
      fileNameEl.hidden = true;
      fileMainEl.textContent = 'Choose a PDF file';
    }
  });

  // Clear a field's error as soon as the user edits it.
  form.addEventListener('input', function (e) {
    if (e.target.matches('input, select')) clearError(e.target);
  });

  // Validate a field when the user leaves it (gentle early feedback, not on
  // every keystroke). focusout bubbles, so one delegated listener covers all.
  form.addEventListener('focusout', function (e) {
    var el = e.target;
    if (!el.matches || !el.matches('input, select')) return;
    if (el.name === 'company' || el.type === 'file') return;
    validateOne(el);
  });

  /* --- Helpers ----------------------------------------------------------- */
  function readFileBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        // strip the "data:application/pdf;base64," prefix
        var s = String(reader.result);
        resolve(s.slice(s.indexOf(',') + 1));
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  function setStatus(msg, isError) {
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('is-error', !!isError);
  }
  function sending(on) {
    submitBtn.disabled = on;
    // Swap the arrow <-> spinner and restore the label, both ways, so the
    // button never gets stuck on "Sending…" after an error.
    var icon = submitBtn.querySelector('.btn__arrow, .spinner');
    if (on) {
      submitLabel.textContent = 'Sending…';
      if (icon) icon.outerHTML = '<span class="spinner" aria-hidden="true"></span>';
    } else {
      submitLabel.textContent = 'Submit application';
      if (icon) icon.outerHTML = '<span class="btn__arrow" aria-hidden="true">→</span>';
    }
  }
  function showThanks() {
    form.hidden = true;
    thanks.hidden = false;
    thanks.focus && thanks.setAttribute('tabindex', '-1');
    thanks.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* --- Submit ------------------------------------------------------------ */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setStatus('');

    // Honeypot: a real person never fills this; bots do.
    if (form.company && form.company.value) { showThanks(); return; }

    var firstInvalid = validate();
    if (firstInvalid) {
      setStatus('Please fix the highlighted fields.', true);
      firstInvalid.focus();
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    var file = cvInput.files[0];
    sending(true);
    setStatus('Sending your application…');

    readFileBase64(file).then(function (b64) {
      var payload = {
        firstName: form.firstName.value.trim(),
        lastName: form.lastName.value.trim(),
        uniEmail: form.uniEmail.value.trim(),
        personalEmail: form.personalEmail.value.trim(),
        phone: form.phone.value.trim(),
        year: form.year.value,
        course: form.course.value.trim(),
        linkedin: form.linkedin.value.trim(),
        choice1: choice1.value,
        choice2: choice2.value,
        cvName: file.name,
        cvType: file.type || 'application/pdf',
        cvBase64: b64,
        company: form.company ? form.company.value : '',
        submittedAt: new Date().toISOString()
      };

      if (DEMO) {                              // walk the UI without sending
        setTimeout(showThanks, 600);
        return;
      }
      if (!CONFIG.APPS_SCRIPT_URL) {
        sending(false);
        setStatus('This form isn’t connected yet. Please email us instead.', true);
        console.warn('[apply] CONFIG.APPS_SCRIPT_URL is empty — set it (see apps-script/SETUP.md).');
        return;
      }

      // no-cors + text/plain = a "simple" request: it reaches Apps Script
      // (which can read it) without a blocked CORS preflight. The response is
      // opaque, so we treat a resolved fetch as success.
      fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      }).then(function () {
        showThanks();
      }).catch(function () {
        sending(false);
        setStatus('Something went wrong sending your application. Please try again.', true);
      });
    }).catch(function () {
      sending(false);
      setStatus('Couldn’t read your CV file. Please re-attach it and try again.', true);
    });
  });

  // Initialise the choice menus on load.
  syncChoices();
})();
