/**
 * Bristol Trading Society — Division Head applications backend.
 * ---------------------------------------------------------------------------
 * Receives JSON POSTs from apply.html, stores the CV in a Drive folder,
 * appends a row to this spreadsheet (your dashboard), and emails the committee.
 *
 * SETUP: see SETUP.md in this folder. Fill in CONFIG below, then deploy as a
 * Web App (Deploy ▸ New deployment ▸ Web app — Execute as: Me, Who has access:
 * Anyone). Paste the resulting /exec URL into js/apply.js (CONFIG.APPS_SCRIPT_URL).
 */

var CONFIG = {
  CV_FOLDER_ID: 'PASTE_DRIVE_FOLDER_ID',     // Drive folder that will hold CVs
  COMMITTEE_EMAIL: 'committee@example.com',   // primary recipient of notifications
  CC_EMAILS: '',                              // optional cc list (comma-separated),
                                              // e.g. 'a@bristol.ac.uk, b@bristol.ac.uk'
  SHEET_NAME: 'Applications'
};

var HEADERS = ['Submitted', 'First name', 'Last name', 'University email',
  'Personal email', 'Phone', 'Year', 'Course', 'LinkedIn',
  '1st choice', '2nd choice', 'CV'];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Honeypot: real applicants leave this empty; bots fill it. Drop silently.
    if (data.company) return json({ ok: true });

    // Minimal server-side validation (mirrors the client checks).
    if (!data.firstName || !data.lastName ||
        !/^[^@\s]+@bristol\.ac\.uk$/i.test(data.uniEmail || '')) {
      return json({ ok: false, error: 'Invalid submission' });
    }

    // 1) Save the CV to Drive (named Lastname_Firstname_CV.pdf).
    var cvUrl = '';
    if (data.cvBase64) {
      var bytes = Utilities.base64Decode(data.cvBase64);
      var safeName = (data.lastName + '_' + data.firstName).replace(/[^\w-]+/g, '_');
      var blob = Utilities.newBlob(bytes, data.cvType || 'application/pdf', safeName + '_CV.pdf');
      var file = DriveApp.getFolderById(CONFIG.CV_FOLDER_ID).createFile(blob);
      cvUrl = file.getUrl();
    }

    // 2) Append a row to the Sheet (the committee's dashboard).
    getSheet().appendRow([
      new Date(), data.firstName, data.lastName, data.uniEmail,
      data.personalEmail, data.phone, data.year, data.course, data.linkedin,
      data.choice1, data.choice2, cvUrl
    ]);

    // 3) Email the committee (real-time notification + a second copy).
    notify(data, cvUrl);

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/** Health check when the URL is opened in a browser. */
function doGet() {
  return ContentService.createTextOutput('BTS applications endpoint is live.');
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME) || ss.insertSheet(CONFIG.SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  return sheet;
}

function notify(d, cvUrl) {
  var subject = 'New Division Head application — ' + d.firstName + ' ' + d.lastName;
  var body = [
    d.firstName + ' ' + d.lastName,
    '',
    'University email: ' + d.uniEmail,
    'Personal email:   ' + (d.personalEmail || '—'),
    'Phone:            ' + d.phone,
    'Year / course:    ' + d.year + ', ' + d.course,
    'LinkedIn:         ' + (d.linkedin || '—'),
    '',
    '1st choice: ' + d.choice1,
    '2nd choice: ' + d.choice2,
    'CV:         ' + (cvUrl || '—')
  ].join('\n');
  var options = {};
  if (CONFIG.CC_EMAILS) options.cc = CONFIG.CC_EMAILS;
  MailApp.sendEmail(CONFIG.COMMITTEE_EMAIL, subject, body, options);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
