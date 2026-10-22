/**
 * Bristol Trading Society — live prices for /books/ (js/books-live.js)
 * ---------------------------------------------------------------------------
 * A small relay: the books page asks for the instruments the desks hold
 * (?s=AAPL,VOD.L,EURUSD=X), this fetches them from Yahoo Finance and hands
 * back the latest price plus a month of daily closes, so the page can move
 * each position on from the IBKR close it was last marked at.
 *
 * Browsers can't ask Yahoo directly (it doesn't allow cross-site requests),
 * hence the relay. Each symbol is cached for a minute, so however many people
 * have the page open, Yahoo sees at most one request per symbol per minute.
 *
 * Yahoo's endpoint is unofficial: it can rate-limit or change without notice.
 * If it does, the page simply falls back to the IBKR closing marks.
 *
 * SETUP: see SETUP.md ("Live prices for the books"). In short: script.google.com
 * ▸ New project ▸ paste this file ▸ Deploy ▸ New deployment ▸ Web app (Execute
 * as: Me, Who has access: Anyone) ▸ paste the /exec URL into "live.endpoint"
 * in books/data/index.json.
 */

var CACHE_SECONDS = 60;
var MAX_SYMBOLS = 120;   // per request; the desks hold far fewer
var BATCH = 20;          // Yahoo's spark endpoint takes up to 20 symbols at once
var HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

function doGet(e) {
  var raw = String((e && e.parameter && e.parameter.s) || '');
  if (!raw) return json({ ok: true, service: 'BTS quotes' });

  var seen = {};
  var symbols = raw.split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(function (s) {
    if (!/^[A-Z0-9.=\-^]{1,24}$/.test(s) || seen[s]) return false;
    seen[s] = 1;
    return true;
  }).slice(0, MAX_SYMBOLS);

  var cache = CacheService.getScriptCache();
  var hit = cache.getAll(symbols.map(cacheKey));
  var quotes = {}, missing = [];
  symbols.forEach(function (s) {
    var v = hit[cacheKey(s)];
    if (v) quotes[s] = JSON.parse(v); else missing.push(s);
  });

  var failed = [];
  if (missing.length) {
    var fresh = fetchQuotes(missing);
    var toCache = {};
    missing.forEach(function (s) {
      if (fresh[s]) { quotes[s] = fresh[s]; toCache[cacheKey(s)] = JSON.stringify(fresh[s]); }
      else failed.push(s);
    });
    if (Object.keys(toCache).length) cache.putAll(toCache, CACHE_SECONDS);
  }

  return json({ ok: true, at: Date.now(), quotes: quotes, failed: failed });
}

// One request per 20 symbols, all sent at once. If the first host refuses,
// the second is tried for those batches.
function fetchQuotes(symbols) {
  var batches = [];
  for (var i = 0; i < symbols.length; i += BATCH) batches.push(symbols.slice(i, i + BATCH));
  var out = {};
  var pending = batches;
  for (var h = 0; h < HOSTS.length && pending.length; h++) {
    var requests = pending.map(function (b) {
      return {
        url: HOSTS[h] + '/v7/finance/spark?range=1mo&interval=1d&symbols=' + encodeURIComponent(b.join(',')),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BTS-books/1.0)' },
        muteHttpExceptions: true
      };
    });
    var responses = UrlFetchApp.fetchAll(requests);
    var retry = [];
    responses.forEach(function (res, k) {
      if (res.getResponseCode() !== 200) { retry.push(pending[k]); return; }
      try {
        var results = JSON.parse(res.getContentText()).spark.result || [];
        results.forEach(function (r) { var q = slim(r); if (q) out[r.symbol] = q; });
      } catch (err) { retry.push(pending[k]); }
    });
    pending = retry;
  }
  return out;
}

// Only what the page needs: price, currency, when it last traded, today's
// session, and the daily closes keyed by the exchange's own calendar date.
function slim(r) {
  var resp = r && r.response && r.response[0];
  var m = resp && resp.meta;
  if (!m || m.regularMarketPrice == null) return null;
  var off = m.gmtoffset || 0;
  var day = function (t) { return new Date((t + off) * 1000).toISOString().slice(0, 10); };
  var ts = resp.timestamp || [];
  var cl = (resp.indicators && resp.indicators.quote && resp.indicators.quote[0] && resp.indicators.quote[0].close) || [];
  var closes = [];
  for (var i = 0; i < ts.length; i++) if (cl[i] != null) closes.push([day(ts[i]), cl[i]]);
  var reg = m.currentTradingPeriod && m.currentTradingPeriod.regular;
  return {
    price: m.regularMarketPrice,
    currency: m.currency || '',
    time: m.regularMarketTime || null,
    date: m.regularMarketTime ? day(m.regularMarketTime) : '',
    session: reg ? [reg.start, reg.end] : null,
    type: m.instrumentType || '',
    closes: closes
  };
}

function cacheKey(s) { return 'q:' + s; }

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Run once from the editor (choose "test" ▸ Run) to check Yahoo answers from
// Google's servers before deploying: the log should show three prices.
function test() {
  var q = fetchQuotes(['AAPL', 'VOD.L', 'EURUSD=X']);
  Object.keys(q).forEach(function (s) { Logger.log(s + ' ' + q[s].price + ' ' + q[s].currency + ' (' + q[s].closes.length + ' closes)'); });
  if (!Object.keys(q).length) Logger.log('No prices came back: Yahoo is refusing requests from Google right now.');
}
