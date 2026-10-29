/**
 * Bristol Trading Society — Opportunities click counter
 * ---------------------------------------------------------------------------
 * Counts clicks on the Apply buttons on /opportunities/ (js/opportunities.js
 * sends one small POST per click). Each click is one row: time, firm, role,
 * job id. No cookies, names, emails or IP addresses are recorded, so it runs
 * without the analytics consent banner and counts every click.
 *
 * Open the web app URL in a browser (a GET) for a running total per role.
 *
 * SETUP: see SETUP.md ("Opportunities click counter"). In short: new Google
 * Sheet ▸ Extensions ▸ Apps Script ▸ paste this file ▸ Deploy ▸ New
 * deployment ▸ Web app (Execute as: Me, Who has access: Anyone) ▸ paste the
 * /exec URL into data-click-endpoint on <main> in opportunities/index.html.
 */

var SHEET_NAME = 'Clicks';
var HEADERS = ['Clicked', 'Firm', 'Role', 'Job id'];

function sheet_() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sh = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
  return sh;
}

function clean_(v) {
  return String(v == null ? '' : v).slice(0, 120);
}

function doPost(e) {
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    sheet_().appendRow([new Date(), clean_(d.firm), clean_(d.role), clean_(d.job)]);
  } catch (err) {
    // A malformed request is dropped; the visitor's click is never blocked.
  }
  return ContentService.createTextOutput('ok');
}

function doGet() {
  var rows = sheet_().getDataRange().getValues().slice(1);
  var totals = {};
  rows.forEach(function (r) {
    var key = r[1] + ' — ' + r[2] + ' (' + r[3] + ')';
    totals[key] = (totals[key] || 0) + 1;
  });
  return ContentService.createTextOutput(JSON.stringify({ total: rows.length, byRole: totals }, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}
