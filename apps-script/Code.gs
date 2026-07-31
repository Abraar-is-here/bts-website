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
  CV_FOLDER_ID: '1CXQc5hOw07KTtl-_e5osNPEsABC43YkJ',
  COMMITTEE_EMAIL: 'bristol-trading-society@bristol.ac.uk',
  CC_EMAILS: 'xt24741@bristol.ac.uk,pt24647@bristol.ac.uk',
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
    'bristoltradingsoc.co.uk',
    '',
    'Note: if this email landed in spam, please mark it as "Not spam" to ensure future BTS emails reach your inbox.'
  ].join('\n');

  var html = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">'
    + '<html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Application received</title></head>'
    + '<body style="margin:0;padding:0;background-color:#f0f4fb;font-family:\'Helvetica Neue\',Helvetica,Arial,sans-serif;">'
    + '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f0f4fb;padding:40px 16px;">'
    + '<tr><td align="center">'
    + '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;">'

    // ── Header ──
    + '<tr><td style="background-color:#06112b;border-radius:16px 16px 0 0;padding:0;">'
    + '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">'
    + '<tr>'
    // Left: wordmark
    + '<td style="padding:28px 32px;">'
    + '<div style="font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#f4f7fb;line-height:1;">BTS</div>'
    + '<div style="font-size:7px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#8da2c4;margin-top:3px;">Bristol Trading Society</div>'
    + '</td>'
    // Right: pill badge
    + '<td align="right" style="padding:28px 32px;">'
    + '<span style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:11px;font-weight:600;letter-spacing:0.04em;padding:6px 16px;border-radius:999px;">Division Head</span>'
    + '</td>'
    + '</tr>'
    // Divider line
    + '<tr><td colspan="2" style="padding:0 32px;"><div style="height:1px;background:rgba(141,162,196,0.15);"></div></td></tr>'
    // Sub-header strip
    + '<tr><td colspan="2" style="padding:20px 32px 28px;">'
    + '<div style="font-size:13px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:#8da2c4;">Application Confirmation</div>'
    + '</td></tr>'
    + '</table>'
    + '</td></tr>'

    // ── Body ──
    + '<tr><td style="background-color:#ffffff;padding:36px 32px;">'
    + '<p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#0a1a3f;line-height:1.5;">Dear ' + d.firstName + ',</p>'

    // Highlight box
    + '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">'
    + '<tr>'
    + '<td width="3" style="background-color:#2563eb;border-radius:3px;">&nbsp;</td>'
    + '<td style="padding:16px 18px;background-color:#f0f4ff;border-radius:0 10px 10px 0;">'
    + '<p style="margin:0;font-size:15px;font-weight:600;color:#0a1a3f;line-height:1.6;">Thank you for submitting an application for the role of Division Head at the Bristol Trading Society.</p>'
    + '</td>'
    + '</tr>'
    + '</table>'

    + '<p style="margin:0 0 16px;font-size:15px;color:#1e2d50;line-height:1.7;">We look forward to reviewing your application and, if successful, will be in touch in due course to discuss next steps for the final round interview stage.</p>'
    + '<p style="margin:0 0 32px;font-size:15px;color:#1e2d50;line-height:1.7;">In the meantime, if you have any questions please do not hesitate to get in touch.</p>'

    // Divider
    + '<div style="height:1px;background:#e8edf5;margin-bottom:24px;"></div>'

    + '<p style="margin:0;font-size:14px;color:#4a5568;line-height:1.6;">Best regards,<br><strong style="color:#0a1a3f;">The Bristol Trading Society Committee</strong></p>'
    + '</td></tr>'

    // ── CTA strip ──
    + '<tr><td style="background-color:#0a1a3f;padding:24px 32px;text-align:center;">'
    + '<a href="https://bristoltradingsoc.co.uk" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.03em;text-decoration:none;padding:12px 28px;border-radius:999px;">Visit bristoltradingsoc.co.uk</a>'
    + '</td></tr>'

    // ── Footer ──
    + '<tr><td style="background-color:#f0f4fb;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center;">'
    + '<p style="margin:0 0 6px;font-size:11px;color:#8da2c4;line-height:1.5;">If this email landed in your spam folder, please mark it as <strong>Not spam</strong>.</p>'
    + '<p style="margin:0;font-size:11px;color:#b0bfd4;">© 2026 Bristol Trading Society · University of Bristol</p>'
    + '</td></tr>'

    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';

  MailApp.sendEmail(to, subject, plainBody, {
    htmlBody: html,
    name: CONFIG.SENDER_NAME
  });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
