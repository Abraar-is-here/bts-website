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
  SENDER_NAME: 'Bristol Trading Society',    // display name on confirmation emails
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
      var file = DriveApp.getFolderById(folderId(CONFIG.CV_FOLDER_ID)).createFile(blob);
      cvUrl = file.getUrl();
    }

    // 2) Append a row to the Sheet (the committee's dashboard).
    getSheet().appendRow([
      new Date(), data.firstName, data.lastName, data.uniEmail,
      data.personalEmail, data.phone, data.year, data.course, data.linkedin,
      data.choice1, data.choice2, cvUrl
    ]);

    // 3) Email the committee (real-time notification).
    notify(data, cvUrl);

    // 4) Confirmation email to the applicant.
    confirmApplicant(data);

    return json({ ok: true });
  } catch (err) {
    console.error(err);   // surfaces the real reason in the Executions log
    return json({ ok: false, error: String(err) });
  }
}

/** Accepts either a bare Drive folder ID or a full folder URL. */
function folderId(s) {
  var m = String(s).match(/[-\w]{25,}/);
  return m ? m[0] : String(s);
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
    '2nd choice: ' + (d.choice2 || '—'),
    'CV:         ' + (cvUrl || '—')
  ].join('\n');
  var options = {};
  if (CONFIG.CC_EMAILS) options.cc = CONFIG.CC_EMAILS;
  MailApp.sendEmail(CONFIG.COMMITTEE_EMAIL, subject, body, options);
}

function confirmApplicant(d) {
  var to = d.uniEmail;
  if (!to) return;

  var subject = 'Application received — Bristol Trading Society Division Head';

  var plainBody = [
    'Dear ' + d.firstName + ',',
    '',
    'Thank you for submitting an application for the role of Division Head at the Bristol Trading Society.',
    '',
    'We look forward to reviewing your application and, if successful, will be in touch in due course to discuss next steps for the final round interview stage.',
    '',
    'In the meantime, if you have any questions please do not hesitate to get in touch.',
    '',
    'Best regards,',
    'The Bristol Trading Society Committee',
    'bristoltradingsoc.co.uk'
  ].join('\n');

  var htmlBody = [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="UTF-8">',
    '<style>',
    '  body{font-family:\'Helvetica Neue\',Arial,sans-serif;background:#f4f7fb;margin:0;padding:32px 16px;}',
    '  .card{background:#ffffff;max-width:560px;margin:0 auto;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(10,26,63,0.10);}',
    '  .header{background:#0a1a3f;padding:32px 40px;text-align:center;}',
    '  .header img{height:36px;}',
    '  .header-title{color:#f4f7fb;font-size:22px;font-weight:700;margin:12px 0 0;letter-spacing:-0.02em;}',
    '  .body{padding:36px 40px;color:#0a1a3f;}',
    '  .body p{font-size:15px;line-height:1.65;margin:0 0 16px;}',
    '  .body p:last-child{margin-bottom:0;}',
    '  .highlight{background:#f0f4ff;border-left:3px solid #2563eb;border-radius:0 8px 8px 0;padding:14px 18px;margin:20px 0;}',
    '  .footer{background:#f4f7fb;padding:20px 40px;text-align:center;font-size:12px;color:#8da2c4;border-top:1px solid #e5eaf2;}',
    '  .footer a{color:#2563eb;text-decoration:none;}',
    '</style>',
    '</head><body>',
    '<div class="card">',
    '  <div class="header">',
    '    <div class="header-title">Bristol Trading Society</div>',
    '  </div>',
    '  <div class="body">',
    '    <p>Dear ' + d.firstName + ',</p>',
    '    <div class="highlight">',
    '      <p style="margin:0;font-weight:600;">Thank you for submitting an application for the role of Division Head at the Bristol Trading Society.</p>',
    '    </div>',
    '    <p>We look forward to reviewing your application and, if successful, will be in touch in due course to discuss next steps for the final round interview stage.</p>',
    '    <p>In the meantime, if you have any questions please do not hesitate to get in touch.</p>',
    '    <p>Best regards,<br><strong>The Bristol Trading Society Committee</strong></p>',
    '  </div>',
    '  <div class="footer">',
    '    <a href="https://bristoltradingsoc.co.uk">bristoltradingsoc.co.uk</a>',
    '  </div>',
    '</div>',
    '</body></html>'
  ].join('\n');

  MailApp.sendEmail(to, subject, plainBody, {
    htmlBody: htmlBody,
    name: CONFIG.SENDER_NAME
  });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
