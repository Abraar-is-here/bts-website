/**
 * Bristol Trading Society — Research and live books (the /research page)
 * ---------------------------------------------------------------------------
 * The website reads this script; nobody posts to it. It serves two things as
 * JSON:
 *
 *   research  every PDF in the "BTS Macro Research" Drive folder, newest
 *             first. Uploading a report = dropping a PDF into that folder.
 *             Only the people given Editor access to the folder can do that
 *             (setup() gives it to the Macro division heads).
 *
 *   books     one paper-trading book per division, from the tabs of this
 *             Sheet. Each tab is protected so only that division's heads can
 *             edit it. Live prices come from Google Finance (delayed up to
 *             ~20 minutes); anything Google Finance does not price (futures,
 *             bonds, options) is marked by hand in the "Mark" column.
 *
 * Access control is Google's own sharing, so there are no passwords here and
 * nothing on the website can write to the Sheet or the folder.
 *
 * SETUP (once, signed into the society's Google account) — see SETUP.md,
 * "Research and live books":
 *   1. Create a blank Google Sheet called "BTS Books".
 *   2. Extensions ▸ Apps Script, paste this file, Save.
 *   3. Run setup() once (Run ▸ setup) and approve the permissions.
 *   4. Deploy ▸ New deployment ▸ Web app — Execute as: Me, Who has access: Anyone.
 *   5. Send the /exec URL to whoever maintains the site; it goes in
 *      data-endpoint on research/index.html.
 */

var DESK = {
  RESEARCH_FOLDER_NAME: 'BTS Macro Research',
  DIVISIONS: ['FICC', 'Equities', 'Macro', 'Quant'],

  // Who can upload research (Editor on the Drive folder).
  RESEARCH_EDITORS: ['hm25495@bristol.ac.uk', 'lz25093@bristol.ac.uk'],

  // Who can edit each division's book. Same people as the application emails;
  // update both when heads change.
  BOOK_EDITORS: {
    FICC: ['pe25523@bristol.ac.uk', 'yy25427@bristol.ac.uk', 'fx24531@bristol.ac.uk', 'rn25063@bristol.ac.uk'],
    Equities: ['jb25462@bristol.ac.uk', 'tb25663@bristol.ac.uk', 'no24411@bristol.ac.uk', 'ny24083@bristol.ac.uk'],
    Macro: ['hm25495@bristol.ac.uk', 'lz25093@bristol.ac.uk'],
    Quant: ['xt25211@bristol.ac.uk', 'tk24074@bristol.ac.uk']
  },

  ROWS: 300,           // trade rows prepared on each tab
  CACHE_SECONDS: 300   // the website sees changes within five minutes
};

// Column layout of every division tab (row 1 is the header).
var COLS = ['Opened', 'Instrument', 'Google Finance symbol', 'Side', 'Size',
  'Entry', 'Mark', 'Live price', 'Exit', 'Closed', 'Thesis'];
var C = { opened: 0, instrument: 1, symbol: 2, side: 3, size: 4, entry: 5,
  mark: 6, live: 7, exit: 8, closed: 9, thesis: 10 };

/* ------------------------------------------------------------------------- */
/* Web app                                                                    */
/* ------------------------------------------------------------------------- */

function doGet() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('desk');
  if (hit) return out(hit);

  var body = JSON.stringify({
    updated: new Date().toISOString(),
    research: research(),
    books: books()
  });
  // Cache entries are capped at 100KB; a payload over that is simply not cached.
  if (body.length < 95000) cache.put('desk', body, DESK.CACHE_SECONDS);
  return out(body);
}

function out(body) {
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function research() {
  var folder = researchFolder(false);
  if (!folder) return [];
  var list = [];
  var files = folder.getFilesByType(MimeType.PDF);
  while (files.hasNext()) {
    var f = files.next();
    if (f.isTrashed()) continue;
    list.push({
      id: f.getId(),
      title: f.getName().replace(/\.pdf$/i, ''),
      summary: f.getDescription() || '',
      date: f.getDateCreated().toISOString(),
      url: 'https://drive.google.com/file/d/' + f.getId() + '/view'
    });
  }
  list.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  return list;
}

function books() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return DESK.DIVISIONS.map(function (division) {
    var sheet = ss.getSheetByName(division);
    var open = [], closed = [];
    if (sheet && sheet.getLastRow() > 1) {
      var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, COLS.length).getValues();
      rows.forEach(function (r) {
        var entry = num(r[C.entry]);
        if (!String(r[C.instrument]).trim() || !entry) return;
        var exit = num(r[C.exit]);
        var mark = num(r[C.mark]);
        var live = num(r[C.live]);
        var isClosed = !!exit;
        var price = isClosed ? exit : (mark || live || null);
        var dir = /^s/i.test(String(r[C.side])) ? -1 : 1;
        var p = {
          instrument: String(r[C.instrument]).trim(),
          side: dir < 0 ? 'Short' : 'Long',
          opened: iso(r[C.opened]),
          entry: entry,
          price: price,
          source: isClosed ? 'exit' : (mark ? 'mark' : (live ? 'live' : 'none')),
          returnPct: price ? round((price / entry - 1) * dir * 100, 2) : null,
          thesis: String(r[C.thesis] || '').trim()
        };
        if (isClosed) {
          p.closed = iso(r[C.closed]);
          closed.push(p);
        } else {
          open.push(p);
        }
      });
    }
    open.sort(function (a, b) { return (a.opened || '') < (b.opened || '') ? 1 : -1; });
    closed.sort(function (a, b) { return (a.closed || '') < (b.closed || '') ? 1 : -1; });
    return { division: division, open: open, closed: closed };
  });
}

function num(v) {
  var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) && n !== 0 ? n : 0;
}
function iso(v) {
  return v instanceof Date && !isNaN(v) ? v.toISOString().slice(0, 10) : '';
}
function round(n, dp) {
  var f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/* ------------------------------------------------------------------------- */
/* One-time setup. Run from the editor: Run ▸ setup                          */
/* ------------------------------------------------------------------------- */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = Session.getEffectiveUser().getEmail();
  var notes = [];

  DESK.DIVISIONS.forEach(function (division) {
    var sheet = ss.getSheetByName(division) || ss.insertSheet(division);
    sheet.getRange(1, 1, 1, COLS.length).setValues([COLS])
      .setFontWeight('bold').setBackground('#0a1a3f').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.getRange(2, C.opened + 1, DESK.ROWS, 1).setNumberFormat('yyyy-mm-dd');
    sheet.getRange(2, C.closed + 1, DESK.ROWS, 1).setNumberFormat('yyyy-mm-dd');
    sheet.getRange(2, C.side + 1, DESK.ROWS, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['Long', 'Short'], true).build());

    // Live price, one formula per row, only where a symbol is given.
    var formulas = [];
    for (var i = 2; i < DESK.ROWS + 2; i++) {
      formulas.push(['=IF(C' + i + '="","",IFERROR(GOOGLEFINANCE(C' + i + ',"price"),""))']);
    }
    sheet.getRange(2, C.live + 1, DESK.ROWS, 1).setFormulas(formulas).setBackground('#eef2f8');

    sheet.getRange(1, C.symbol + 1).setNote(
      'Optional. A Google Finance symbol for live prices, e.g. NASDAQ:AAPL, LON:VOD, CURRENCY:GBPUSD. ' +
      'Leave blank for anything Google Finance does not price, and fill in Mark instead.');
    sheet.getRange(1, C.mark + 1).setNote(
      'Your own mark for instruments without a live price (futures, bonds, options). ' +
      'If filled, it is used instead of the live price.');
    sheet.getRange(1, C.exit + 1).setNote('Fill in when the trade is closed, with the Closed date.');
    sheet.setColumnWidths(1, COLS.length, 130);
    sheet.setColumnWidth(C.thesis + 1, 360);

    // Only this division's heads (and the owner) can edit the tab.
    sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
    var protection = sheet.protect().setDescription(division + ' book: division heads only');
    protection.removeEditors(protection.getEditors().filter(function (u) { return u.getEmail() !== me; }));
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
    (DESK.BOOK_EDITORS[division] || []).forEach(function (email) {
      try { protection.addEditor(email); } catch (err) {
        notes.push(division + ': could not add ' + email + ' (' + err.message + '). Share the Sheet with their Google account and add them under Data ▸ Protect sheets and ranges.');
      }
    });
    // The live-price column stays formula-only.
    var lock = sheet.getRange(2, C.live + 1, DESK.ROWS, 1).protect().setDescription('Live price (automatic)');
    lock.removeEditors(lock.getEditors().filter(function (u) { return u.getEmail() !== me; }));
  });

  // Drop the default empty tab if it is still there.
  var stray = ss.getSheetByName('Sheet1');
  if (stray && ss.getSheets().length > 1 && stray.getLastRow() === 0) ss.deleteSheet(stray);

  // Research folder, with the Macro heads as editors (the only uploaders).
  var folder = researchFolder(true);
  DESK.RESEARCH_EDITORS.forEach(function (email) {
    try { folder.addEditor(email); } catch (err) {
      notes.push('Research folder: could not add ' + email + ' (' + err.message + '). Share the folder with their Google account as Editor.');
    }
  });
  if (folder.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) {
    notes.push('Research folder: set General access to "Anyone with the link — Viewer" in Drive, ' +
      'so readers can open the reports from the website.');
  }

  CacheService.getScriptCache().remove('desk');
  Logger.log('Done. Research folder: ' + folder.getUrl());
  notes.forEach(function (n) { Logger.log('TO DO: ' + n); });
}

function researchFolder(create) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('RESEARCH_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* deleted: fall through */ }
  }
  if (!create) return null;
  var folder = DriveApp.createFolder(DESK.RESEARCH_FOLDER_NAME);
  props.setProperty('RESEARCH_FOLDER_ID', folder.getId());
  return folder;
}

/* Clears the five-minute cache, so a change shows on the website at once.
   Optional: run it from the editor after a big update. */
function refreshNow() {
  CacheService.getScriptCache().remove('desk');
}
