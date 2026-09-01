/**
 * Bristol Trading Society — committee applications backend.
 * ---------------------------------------------------------------------------
 * Deliberately SEPARATE from Code.gs (Division Head applications) so committee
 * applications land in their own spreadsheet and never mix with the analyst
 * intake.
 *
 * SETUP
 *  1. Create a NEW Google Sheet for committee applications.
 *  2. Extensions ▸ Apps Script, paste this file in, and set CONFIG below.
 *     If that editor will not open, create a standalone project at
 *     script.google.com/create instead, paste this in, and set CONFIG.SHEET_ID
 *     to the Sheet's ID. Everything else is identical.
 *  3. Deploy ▸ New deployment ▸ Web app — Execute as: Me, Who has access: Anyone.
 *  4. Paste the resulting /exec URL into the data-endpoint attribute on BOTH
 *     committee application forms:
 *       apply/marketing/index.html
 *       apply/outreach/index.html
 *     Until that is set, the forms refuse to submit rather than silently
 *     dropping an application.
 */

var CONFIG = {
  // Leave EMPTY when this script lives inside the Sheet (Extensions ▸ Apps
  // Script). Set it to the Sheet's ID when running as a STANDALONE project from
  // script.google.com — getActiveSpreadsheet() returns null there.
  // The ID is the long string in the Sheet URL:
  //   docs.google.com/spreadsheets/d/<THIS_PART>/edit
  SHEET_ID: '',
  CV_FOLDER_ID: '',                 // Drive folder for committee CVs — set this
  COMMITTEE_EMAIL: 'bristol-trading-society@bristol.ac.uk',
  CC_EMAILS: '',
  SENDER_NAME: 'Bristol Trading Society',
  SHEET_NAME: 'Committee Applications'
};

var HEADERS = ['Submitted', 'First name', 'Last name', 'University email',
  'Personal email', 'Phone', 'Year', 'Course', 'LinkedIn', 'Role', 'CV'];

var LIST_SHEET = 'Mailing list';
var LIST_HEADERS = ['Subscribed', 'Email', 'Signed up from'];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Honeypot: real applicants leave this empty; bots fill it. Drop silently.
    if (data.company) return json({ ok: true });

    // Mailing-list signups come through the same deployment so there is only
    // one URL to keep in sync, but land in their own sheet.
    if (data.type === 'subscribe') return subscribe(data);

    if (!data.firstName || !data.lastName ||
        !/^[^@\s]+@bristol\.ac\.uk$/i.test(data.uniEmail || '')) {
      return json({ ok: false, error: 'Invalid submission' });
    }

    // 1) CV to Drive, named Lastname_Firstname_Role_CV.pdf so the file is
    //    identifiable without opening the sheet.
    var cvUrl = '';
    if (data.cvBase64) {
      var bytes = Utilities.base64Decode(data.cvBase64);
      var safe = (data.lastName + '_' + data.firstName + '_' + (data.role || ''))
                   .replace(/[^\w-]+/g, '_');
      var blob = Utilities.newBlob(bytes, data.cvType || 'application/pdf', safe + '_CV.pdf');
      cvUrl = DriveApp.getFolderById(folderId(CONFIG.CV_FOLDER_ID)).createFile(blob).getUrl();
    }

    // 2) Append to the committee sheet.
    getSheet().appendRow([
      new Date(), data.firstName, data.lastName, data.uniEmail,
      data.personalEmail, data.phone, data.year, data.course, data.linkedin,
      data.role || '', cvUrl
    ]);

    notify(data, cvUrl);
    confirmApplicant(data);
    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String(err) });
  }
}

/**
 * Mailing list. Deduplicates on email so a second signup does not create a
 * second row -- the committee will be pasting this column straight into a BCC
 * field, and duplicates there are visible to recipients.
 */
function subscribe(data) {
  var email = String(data.email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: 'Invalid email' });
  }

  var ss = spreadsheet();
  var sheet = ss.getSheetByName(LIST_SHEET) || ss.insertSheet(LIST_SHEET);
  if (sheet.getLastRow() === 0) sheet.appendRow(LIST_HEADERS);

  var existing = sheet.getLastRow() > 1
    ? sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues()
    : [];
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i][0]).trim().toLowerCase() === email.toLowerCase()) {
      return json({ ok: true, duplicate: true });
    }
  }

  sheet.appendRow([new Date(), email, data.page || '']);
  return json({ ok: true });
}

/** Accepts either a bare Drive folder ID or a full folder URL. */
function folderId(s) {
  var m = String(s).match(/[-\w]{25,}/);
  return m ? m[0] : String(s);
}

function doGet() {
  return ContentService.createTextOutput('BTS committee applications endpoint is live.');
}

function spreadsheet() {
  var ss = CONFIG.SHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('No spreadsheet. Set CONFIG.SHEET_ID if this is a ' +
      'standalone script rather than one bound to the Sheet.');
  }
  return ss;
}

function getSheet() {
  var ss = spreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME) || ss.insertSheet(CONFIG.SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  return sheet;
}

function notify(d, cvUrl) {
  var subject = 'Committee application — ' + d.role + ' — ' + d.firstName + ' ' + d.lastName;
  var body = [
    d.firstName + ' ' + d.lastName,
    'Role:             ' + (d.role || '—'),
    '',
    'University email: ' + d.uniEmail,
    'Personal email:   ' + (d.personalEmail || '—'),
    'Phone:            ' + d.phone,
    'Year / course:    ' + d.year + ', ' + d.course,
    'LinkedIn:         ' + (d.linkedin || '—'),
    'CV:               ' + (cvUrl || '—')
  ].join('\n');
  var options = {};
  if (CONFIG.CC_EMAILS) options.cc = CONFIG.CC_EMAILS;
  MailApp.sendEmail(CONFIG.COMMITTEE_EMAIL, subject, body, options);
}

function confirmApplicant(d) {
  if (!d.uniEmail) return;
  MailApp.sendEmail(d.uniEmail,
    'Application received — ' + d.role,
    [
      'Dear ' + d.firstName + ',',
      '',
      'Thank you for your application for the role of ' + d.role +
        ' at the Bristol Trading Society.',
      '',
      'We will review your application and be in touch at this address either way.',
      '',
      'Kind regards,',
      'The Bristol Trading Society Committee',
      'bristoltradingsoc.co.uk'
    ].join('\n'),
    { name: CONFIG.SENDER_NAME });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
