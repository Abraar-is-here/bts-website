/**
 * Bristol Trading Society — publishing the books (/books/import/ ▸ Publish)
 * ---------------------------------------------------------------------------
 * A division head checks their IBKR export on /books/import/ and presses
 * Publish. The page sends the finished book file here with their passcode;
 * this checks the passcode for that book and commits the file to
 * books/data/<book>.json on GitHub, so The Floor updates within a couple of
 * minutes. Nobody on the web team has to do anything.
 *
 * Each book has its own passcode, stored here only as a SHA-256 hash, so a
 * head can only publish their own book. Five wrong passcodes lock that book
 * for fifteen minutes.
 *
 * SETUP: see SETUP.md ("Publishing the books"). In short: new project ▸ paste
 * this file ▸ Project Settings ▸ Script properties ▸ GITHUB_TOKEN = a
 * fine-grained token for the repo with Contents: Read and write ▸ run
 * makePasscodes and send each head their code ▸ Deploy ▸ Web app (Me, Anyone)
 * ▸ put the /exec URL in "publish.endpoint" in books/data/index.json.
 */

var REPO = 'Abraar-is-here/bts-website';
var BRANCH = 'main';
var MAX_BYTES = 5 * 1024 * 1024;
var TRIES = 5, LOCK_MINUTES = 15;

function doGet() {
  return json({ ok: true, service: 'BTS books publishing' });
}

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var book = String(req.book || '');
    if (!/^[a-z0-9-]{2,40}$/.test(book)) return json({ ok: false, error: 'book', message: 'Unknown book.' });

    var props = PropertiesService.getScriptProperties();
    var stored = props.getProperty('PASS_' + book);
    if (!stored) return json({ ok: false, error: 'book', message: 'This book has no passcode yet. Ask the web team for one.' });

    // Too many wrong passcodes for this book: wait it out.
    var cache = CacheService.getScriptCache();
    var tries = +(cache.get('tries:' + book) || 0);
    if (tries >= TRIES) return json({ ok: false, error: 'locked', message: 'Too many wrong passcodes. Try again in ' + LOCK_MINUTES + ' minutes.' });
    if (sha256(norm(req.passcode)) !== stored) {
      cache.put('tries:' + book, String(tries + 1), LOCK_MINUTES * 60);
      return json({ ok: false, error: 'passcode', message: 'That passcode isn’t right for this book.' });
    }
    cache.remove('tries:' + book);

    // The file must be a book file, for this book.
    var text = String(req.content || '');
    if (!text || text.length > MAX_BYTES) return json({ ok: false, error: 'file', message: 'The file is empty or too large.' });
    var data;
    try { data = JSON.parse(text); } catch (err) { return json({ ok: false, error: 'file', message: 'The file isn’t a book file.' }); }
    if (!data || data.id !== book || !data.schema || !Array.isArray(data.nav) || !Array.isArray(data.trades)) {
      return json({ ok: false, error: 'file', message: 'The file isn’t this book’s file.' });
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var commit = put('books/data/' + book + '.json', text,
        'Books: ' + book + ' published from the import page' + (data.asOf ? ' (to ' + data.asOf + ')' : ''));
      return json({ ok: true, commit: commit });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json({ ok: false, error: 'server', message: 'Publishing failed: ' + String(err.message || err) });
  }
}

// Create or update one file on the branch through GitHub's contents API.
function put(path, text, message) {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  var url = 'https://api.github.com/repos/' + REPO + '/contents/' + path;
  var headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  var got = UrlFetchApp.fetch(url + '?ref=' + BRANCH, { headers: headers, muteHttpExceptions: true });
  var sha = got.getResponseCode() === 200 ? JSON.parse(got.getContentText()).sha : null;
  if (got.getResponseCode() !== 200 && got.getResponseCode() !== 404) throw new Error('GitHub said ' + got.getResponseCode() + ' reading the file');
  var body = { message: message, content: Utilities.base64Encode(Utilities.newBlob(text).getBytes()), branch: BRANCH };
  if (sha) body.sha = sha;
  var res = UrlFetchApp.fetch(url, { method: 'put', headers: headers, contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200 && res.getResponseCode() !== 201) throw new Error('GitHub said ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText()).commit.sha.slice(0, 7);
}

// Run once from the editor (choose "makePasscodes" ▸ Run). It gives every book
// in books/data/index.json that doesn't have a passcode yet a new one, and
// lists them in the Execution log: send each head theirs privately. Only a hash
// is kept, so copy them now. To replace one, delete its PASS_<book> line in
// Project Settings ▸ Script properties and run this again.
function makePasscodes() {
  var raw = UrlFetchApp.fetch('https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/books/data/index.json').getContentText();
  var props = PropertiesService.getScriptProperties();
  var made = 0;
  JSON.parse(raw).desks.forEach(function (d) {
    d.books.forEach(function (b) {
      if (props.getProperty('PASS_' + b.id)) return;
      var code = passcode();
      props.setProperty('PASS_' + b.id, sha256(norm(code)));
      Logger.log(d.name + ' · ' + b.head + ' (' + b.id + '): ' + code);
      made++;
    });
  });
  Logger.log(made ? made + ' new passcode' + (made === 1 ? '' : 's') + '. Copy them now: they can’t be shown again.' : 'Every book already has a passcode.');
}

// Run to check the token can reach the repo before deploying.
function testGitHub() {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) { Logger.log('Add GITHUB_TOKEN in Project Settings ▸ Script properties first.'); return; }
  var res = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }, muteHttpExceptions: true });
  var r = JSON.parse(res.getContentText());
  Logger.log(res.getResponseCode() === 200
    ? 'Connected to ' + r.full_name + '. Can write: ' + !!(r.permissions && r.permissions.push)
    : 'GitHub said ' + res.getResponseCode() + ': ' + (r.message || ''));
}

// Eight characters from an alphabet without look-alikes (no 0/O, 1/I/L), as XXXX-XXXX.
function passcode() {
  var A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', s = '';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now());
  for (var i = 0; i < 8; i++) s += A.charAt(((bytes[i] % 256) + 256) % A.length);
  return s.slice(0, 4) + '-' + s.slice(4);
}

// Case, spaces and the dash don't matter when a head types it in.
function norm(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

function sha256(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
