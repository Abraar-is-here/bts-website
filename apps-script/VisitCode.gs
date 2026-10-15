/**
 * Bristol Trading Society — firm visit sign-ups (link-only pages under /visits/)
 * ---------------------------------------------------------------------------
 * Receives JSON POSTs from a visit page's form (js/visit.js), adds a row to
 * this spreadsheet, and emails the analyst to say their interest is in.
 * Places are confirmed by the committee separately, so the email says so.
 *
 * One Sheet can take several visits: each visit gets its own tab, named from
 * the page title (e.g. "Futures First, Swansea").
 *
 * SETUP: see SETUP.md ("Firm visit sign-ups"). In short: new Google Sheet ▸
 * Extensions ▸ Apps Script ▸ paste this file ▸ Deploy ▸ New deployment ▸
 * Web app (Execute as: Me, Who has access: Anyone) ▸ paste the /exec URL into
 * data-endpoint on the form in visits/futures-first/index.html.
 */

var CONFIG = {
  // The BTS visits Sheet. Set, so the script works whether it lives inside the
  // Sheet (Extensions ▸ Apps Script) or on its own.
  SHEET_ID: '1Y6_h61seaRAWdjVNdrlg9U8n-N-ZeJ3LARzfGPVomlE',
  SENDER_NAME: 'Bristol Trading Society',
  // Committee addresses told about each new sign-up. Leave empty for none.
  NOTIFY: [],
  // Optional closing time for sign-ups, per visit tab name. Empty = open.
  // e.g. { 'Futures First, Swansea': '2026-11-01T00:00:00Z' }
  CLOSES: { 'Futures First, Swansea': '2026-10-21T00:00:00+01:00' }
};

var HEADERS = ['Submitted', 'First name', 'Last name', 'University email',
  'Division', 'Dietary requirements', 'Access needs', 'Consent to share name', 'Status'];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Honeypot: people leave it empty, bots fill it in. Drop quietly.
    if (data.company) return json({ ok: true });

    var event = String(data.event || 'Visit').slice(0, 90);
    var closes = CONFIG.CLOSES[event];
    if (closes && Date.now() > new Date(closes).getTime()) {
      return json({ ok: false, error: 'Sign-ups have closed' });
    }

    // The same checks as the page, here where they can't be skipped.
    var email = String(data.uniEmail || '').trim().toLowerCase();
    if (!data.firstName || !data.lastName || !/^[^@\s]+@bristol\.ac\.uk$/.test(email) ||
        ['FICC', 'Equities', 'Macro', 'Quant'].indexOf(data.division) < 0 || data.consent !== true) {
      return json({ ok: false, error: 'Invalid submission' });
    }

    var row = [new Date(), clean(data.firstName), clean(data.lastName), email,
      data.division, clean(data.dietary), clean(data.access), 'Yes', 'Interested'];

    // Signing up twice updates the first row rather than adding another, and
    // keeps whatever Status the committee has already set.
    var sheet = tab(event);
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var last = sheet.getLastRow();
      var found = 0;
      if (last > 1) {
        var emails = sheet.getRange(2, 4, last - 1, 1).getValues();
        for (var i = 0; i < emails.length; i++) {
          if (String(emails[i][0]).toLowerCase() === email) { found = i + 2; break; }
        }
      }
      if (found) {
        row[8] = sheet.getRange(found, 9).getValue() || 'Interested';
        sheet.getRange(found, 1, 1, row.length).setValues([row]);
      } else {
        sheet.appendRow(row);
      }
    } finally {
      lock.releaseLock();
    }

    MailApp.sendEmail({
      to: email,
      name: CONFIG.SENDER_NAME,
      subject: event + ': your interest is in',
      body: 'Hi ' + clean(data.firstName) + ',\n\n' +
        'Thanks for registering your interest in the ' + event + ' visit.\n\n' +
        'Places are limited, so this isn\'t a confirmed place yet. If you\'re selected, we\'ll ' +
        'email you to confirm your place, with the final timings.\n\n' +
        'Getting to Swansea and back is your own responsibility, and travel costs aren\'t ' +
        'covered or reimbursed.\n\n' +
        'Bristol Trading Society'
    });

    if (CONFIG.NOTIFY.length) {
      MailApp.sendEmail({
        to: CONFIG.NOTIFY.join(','),
        name: CONFIG.SENDER_NAME,
        subject: event + ': new sign-up (' + clean(data.firstName) + ' ' + clean(data.lastName) + ')',
        body: clean(data.firstName) + ' ' + clean(data.lastName) + ' (' + email + ', ' + data.division + ') ' +
          'registered interest in ' + event + '.\n\n' +
          (data.dietary ? 'Dietary: ' + clean(data.dietary) + '\n' : '') +
          (data.access ? 'Access: ' + clean(data.access) + '\n' : '')
      });
    }

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json({ ok: true, service: 'BTS visit sign-ups' });
}

// Run once from the editor (choose "setup" ▸ Run): it asks for permissions
// and creates the visit's tab with its headers, so you can see it's connected.
function setup() {
  tab('Futures First, Swansea');
  Logger.log('Ready. Emails left today: ' + MailApp.getRemainingDailyQuota());
}

function tab(name) {
  var book = CONFIG.SHEET_ID ? SpreadsheetApp.openById(CONFIG.SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(name);
  if (!sheet) {
    sheet = book.insertSheet(name);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

// Plain text only, trimmed, and never starting with = + - @ so a Sheet can't
// read a sign-up as a formula.
function clean(v) {
  var s = String(v || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
