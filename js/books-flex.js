/* ===========================================================================
   books-flex.js — reads an Interactive Brokers Flex Query export and turns it
   into one book's published data file (books/data/<book>.json).

   Used by the import tool (/books/import/) and, for the ?demo=1 preview, by
   the Books page itself. Runs entirely in the browser: the export is never
   uploaded anywhere.

   Accepts:
   - XML (recommended): an Activity Flex Query, or a Trade Confirmation one.
   - CSV: with or without IBKR's "header and trailer records".

   Reads these sections (names as IBKR's XML has them):
     Trades > Trade                     executions (levelOfDetail EXECUTION)
     TradeConfirms > TradeConfirm       same, from a Trade Confirmation query
     OpenPositions > OpenPosition       the position snapshot (SUMMARY rows)
     EquitySummaryInBase >
       EquitySummaryByReportDateInBase  daily net asset value, base currency
     CashTransactions > CashTransaction deposits and withdrawals only
   Everything else in the file, including Account Information (name, address,
   email), is ignored. The account number itself is never stored: only a short
   one-way hash, so a later import can check it is the same account.
   ========================================================================== */
(function (root) {
  'use strict';

  var SCHEMA = 1;

  /* --- Small helpers --------------------------------------------------------- */
  function key(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  // CSV headers are IBKR's display names; XML attributes are camelCase. Both
  // reduce to the same lowercase key, except these few.
  var ALIAS = {
    clientaccountid: 'accountid',
    currencyprimary: 'currency',
    assetclass: 'assetcategory',
    tradeprice: 'tradeprice',
    fxratetobase: 'fxratetobase'
  };

  function rec(obj) {
    var out = {};
    Object.keys(obj).forEach(function (k) {
      var n = key(k);
      out[ALIAS[n] || n] = obj[k];
    });
    return out;
  }

  function num(v) {
    if (v == null) return null;
    var s = String(v).trim().replace(/,/g, '');
    if (s === '' || s === '-' || s === '--' || /^n\/?a$/i.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function str(v) {
    if (v == null) return '';
    var s = String(v).trim();
    return s === '--' ? '' : s;
  }

  // IBKR dates come as yyyyMMdd, yyyy-MM-dd or with a time after ';', ',' or
  // a space. Slash formats are ambiguous (US or UK order), so they are refused.
  function date(v) {
    var s = str(v);
    if (!s) return '';
    if (s.indexOf('/') > -1) throw new FlexError('slash-date', 'This export uses a date format like ' + s + ', which could be read two ways. In the Flex Query, set Date Format to yyyyMMdd and run it again.');
    var d = s.replace(/[^0-9]/g, '');
    if (d.length < 8) return '';
    return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8);
  }
  function dateTime(v, fallbackDate) {
    var s = str(v);
    if (!s) return fallbackDate ? date(fallbackDate) + 'T00:00:00' : '';
    if (s.indexOf('/') > -1) date(s); // throws the same helpful error
    var d = s.replace(/[^0-9]/g, '');
    if (d.length < 8) return '';
    var t = (d.slice(8) + '000000').slice(0, 6);
    return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8) + 'T' + t.slice(0, 2) + ':' + t.slice(2, 4) + ':' + t.slice(4, 6);
  }

  function FlexError(code, message) { this.code = code; this.message = message; }
  FlexError.prototype = Object.create(Error.prototype);
  FlexError.prototype.name = 'FlexError';

  function instrumentKey(r) {
    var conid = str(r.conid);
    if (conid) return 'c' + conid;
    return [str(r.assetcategory), str(r.symbol), str(r.expiry), str(r.strike), str(r.putcall)].join('|');
  }

  /* --- Record normalisers ---------------------------------------------------- */
  function normTrade(r) {
    var lod = str(r.levelofdetail).toUpperCase();
    if (lod && lod !== 'EXECUTION') return null; // skip ORDER, CLOSED_LOT, SYMBOL_SUMMARY…
    var q = num(r.quantity);
    var p = num(r.tradeprice != null ? r.tradeprice : r.price);
    if (q == null || p == null || q === 0) return null;
    var bs = str(r.buysell).toUpperCase();
    // Quantity is signed in IBKR exports; make sure, in case a query unsigned it.
    if (bs.indexOf('SELL') === 0 && q > 0) q = -q;
    if (bs.indexOf('BUY') === 0 && q < 0) q = -q;
    var id = str(r.tradeid) || str(r.transactionid) || str(r.ibexecid) || str(r.execid);
    var time = dateTime(r.datetime, r.tradedate || r.date);
    if (!time && r.tradedate) time = date(r.tradedate) + 'T00:00:00';
    if (!id) id = [time, instrumentKey(r), q, p].join('~');
    var fx = num(r.fxratetobase);
    return {
      id: id,
      time: time,
      symbol: str(r.symbol),
      description: str(r.description),
      asset: str(r.assetcategory).toUpperCase(),
      currency: str(r.currency),
      fx: fx == null ? 1 : fx,
      quantity: q,
      price: p,
      multiplier: num(r.multiplier) || 1,
      commission: num(r.ibcommission != null ? r.ibcommission : r.commission) || 0,
      pnl: num(r.fifopnlrealized != null ? r.fifopnlrealized : r.realizedpnl),
      openClose: str(r.opencloseindicator).toUpperCase(),
      ref: str(r.orderreference),
      underlying: str(r.underlyingsymbol),
      key: instrumentKey(r)
    };
  }

  function normPosition(r) {
    var lod = str(r.levelofdetail).toUpperCase();
    if (lod && lod !== 'SUMMARY') return null;
    var q = num(r.position != null ? r.position : r.quantity);
    if (!q) return null;
    var fx = num(r.fxratetobase);
    var side = str(r.side);
    if (/short/i.test(side) && q > 0) q = -q;
    return {
      date: date(r.reportdate),
      symbol: str(r.symbol),
      description: str(r.description),
      asset: str(r.assetcategory).toUpperCase(),
      currency: str(r.currency),
      fx: fx == null ? 1 : fx,
      quantity: q,
      multiplier: num(r.multiplier) || 1,
      mark: num(r.markprice),
      value: num(r.positionvalue),
      cost: num(r.costbasisprice != null ? r.costbasisprice : r.openprice),
      unrealized: num(r.fifopnlunrealized),
      pctNav: num(r.percentofnav),
      key: instrumentKey(r)
    };
  }

  function normNav(r) {
    var d = date(r.reportdate);
    var total = num(r.total);
    if (!d || total == null) return null;
    return [d, total];
  }

  function normCash(r) {
    var lod = str(r.levelofdetail).toUpperCase();
    if (lod && lod !== 'DETAIL') return null;
    if (!/deposit|withdraw/i.test(str(r.type))) return null;
    var amt = num(r.amount);
    if (!amt) return null;
    var fx = num(r.fxratetobase);
    var d = date(r.reportdate || r.settledate || r.datetime || r.date);
    return { id: str(r.transactionid) || d + '~' + amt, date: d, amount: amt * (fx == null ? 1 : fx) };
  }

  function emptyStatement(acct) {
    return { account: acct || '', from: '', to: '', trades: [], positions: [], nav: [], cash: [], sections: {} };
  }

  /* --- XML ------------------------------------------------------------------- */
  function attrs(el) {
    var o = {};
    for (var i = 0; i < el.attributes.length; i++) o[el.attributes[i].name] = el.attributes[i].value;
    return rec(o);
  }

  function parseXML(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new FlexError('bad-xml', 'This file is not valid XML. Download the export again without opening and re-saving it.');
    var err = doc.getElementsByTagName('ErrorMessage')[0];
    if (err && !doc.getElementsByTagName('FlexStatement').length) throw new FlexError('ibkr-error', 'IBKR returned an error instead of a statement: ' + err.textContent);
    var stmts = doc.getElementsByTagName('FlexStatement');
    if (!stmts.length) throw new FlexError('not-flex', 'No Flex statement found in this file. Export an Activity Flex Query from IBKR as XML or CSV.');
    var out = [];
    for (var i = 0; i < stmts.length; i++) {
      var s = stmts[i];
      var a = attrs(s);
      var st = emptyStatement(str(a.accountid));
      st.from = date(a.fromdate);
      st.to = date(a.todate);
      each(s, 'Trade', function (r) { st.sections.trades = 1; push(st.trades, normTrade(r)); });
      each(s, 'TradeConfirm', function (r) { st.sections.trades = 1; push(st.trades, normTrade(r)); });
      each(s, 'OpenPosition', function (r) { st.sections.positions = 1; push(st.positions, normPosition(r)); });
      each(s, 'EquitySummaryByReportDateInBase', function (r) { st.sections.nav = 1; st.currency = st.currency || str(r.currency); push(st.nav, normNav(r)); });
      each(s, 'CashTransaction', function (r) { st.sections.cash = 1; push(st.cash, normCash(r)); });
      // Empty sections still count as present (IBKR writes <Trades/> with no rows).
      ['Trades', 'TradeConfirms'].forEach(function (n) { if (s.getElementsByTagName(n).length) st.sections.trades = 1; });
      if (s.getElementsByTagName('OpenPositions').length) st.sections.positions = 1;
      if (s.getElementsByTagName('EquitySummaryInBase').length) st.sections.nav = 1;
      out.push(st);
    }
    return out;
  }
  function each(scope, tag, fn) {
    var list = scope.getElementsByTagName(tag);
    for (var i = 0; i < list.length; i++) fn(attrs(list[i]));
  }
  function push(arr, v) { if (v) arr.push(v); }

  /* --- CSV ------------------------------------------------------------------- */
  function csvRows(text) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  var KNOWN = ['accountid', 'clientaccountid', 'symbol', 'description', 'assetclass', 'assetcategory', 'tradeid', 'tradeprice',
    'quantity', 'datetime', 'tradedate', 'reportdate', 'buysell', 'ibcommission', 'fifopnlrealized', 'opencloseindicator',
    'markprice', 'position', 'positionvalue', 'fifopnlunrealized', 'total', 'cash', 'stock', 'currency', 'currencyprimary',
    'conid', 'multiplier', 'levelofdetail', 'type', 'amount', 'fxratetobase', 'orderreference', 'transactionid', 'percentofnav',
    'costbasisprice', 'side', 'startingvalue', 'endingvalue'];

  function isHeader(row) {
    var hits = 0;
    for (var i = 0; i < row.length; i++) {
      var k = key(row[i]);
      if (num(row[i]) != null) return false;
      if (KNOWN.indexOf(k) > -1) hits++;
    }
    return hits >= 3;
  }

  function classify(fields) {
    var has = function (f) { return fields.indexOf(f) > -1; };
    if (has('tradeprice') || has('tradeid')) return 'trades';
    if (has('markprice') && has('position')) return 'positions';
    if (has('startingvalue')) return 'cnav';
    if (has('total') && has('reportdate') && !has('quantity')) return 'nav';
    if (has('amount') && has('type')) return 'cash';
    return '';
  }

  function parseCSV(text) {
    var rows = csvRows(text);
    var byAcct = {};
    var header = null, kind = '', fallbackAcct = '';
    function stmt(a) { a = a || fallbackAcct || 'unknown'; return byAcct[a] || (byAcct[a] = emptyStatement(a)); }
    rows.forEach(function (row) {
      var tag = row[0];
      if (tag === 'BOF') { fallbackAcct = row[1] || fallbackAcct; var s = stmt(row[1]); s.from = s.from || date(row[4]); s.to = s.to || date(row[5]); return; }
      if (tag === 'BOA') { fallbackAcct = row[1] || fallbackAcct; return; }
      if (tag === 'BOS' || tag === 'EOS' || tag === 'EOA' || tag === 'EOF' || tag === 'MSG') return;
      if (tag === 'HEADER') { header = row.slice(2).map(function (h) { var k = key(h); return ALIAS[k] || k; }); kind = classify(header); return; }
      var data = tag === 'DATA' ? row.slice(2) : row;
      if (tag !== 'DATA' && isHeader(row)) { header = row.map(function (h) { var k = key(h); return ALIAS[k] || k; }); kind = classify(header); return; }
      if (!header || !kind) return;
      var r = {};
      header.forEach(function (h, i) { r[h] = data[i]; });
      var s2 = stmt(str(r.accountid));
      s2.sections[kind === 'cnav' ? 'cnav' : kind] = 1;
      if (kind === 'trades') push(s2.trades, normTrade(r));
      else if (kind === 'positions') push(s2.positions, normPosition(r));
      else if (kind === 'nav') { s2.currency = s2.currency || str(r.currency); push(s2.nav, normNav(r)); }
      else if (kind === 'cash') push(s2.cash, normCash(r));
    });
    var list = Object.keys(byAcct).map(function (k) { return byAcct[k]; });
    if (!list.length || list.every(function (s) { return !Object.keys(s.sections).length; })) {
      throw new FlexError('not-flex', 'No IBKR sections found in this CSV. Check it is a Flex Query export, not a standard Activity Statement.');
    }
    return list.filter(function (s) { return Object.keys(s.sections).length; });
  }

  /* --- Public: parse --------------------------------------------------------- */
  function parse(text) {
    var t = String(text || '').replace(/^﻿/, '');
    if (!t.trim()) throw new FlexError('empty', 'This file is empty.');
    var head = t.slice(0, 400).trim();
    if (head.charAt(0) === '<') return parseXML(t);
    if (/^%PDF/.test(head) || /<html/i.test(head)) throw new FlexError('wrong-file', 'This looks like a PDF or web page. Export the Flex Query as XML or CSV instead.');
    if (head.indexOf('|') > -1 && head.indexOf(',') === -1) throw new FlexError('text-format', 'This export is in IBKR’s Text format. Set the Flex Query’s format to XML (or CSV) and run it again.');
    return parseCSV(t);
  }

  /* --- Account hash (never store the account number) ------------------------- */
  function hashAccount(acct) {
    if (!acct) return Promise.resolve('');
    var data = new TextEncoder().encode('bts-books:' + acct);
    if (!root.crypto || !root.crypto.subtle) return Promise.resolve('');
    return root.crypto.subtle.digest('SHA-256', data).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf).slice(0, 6), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  /* --- Public: merge one or more statements into a book ---------------------- *
     existing: the book's current published JSON (or null).
     Returns { book, report } where report says what changed and what to check. */
  function merge(statements, existing, meta) {
    meta = meta || {};
    var prev = existing || { schema: SCHEMA, id: meta.id || '', trades: [], nav: [], flows: [], positions: [], notes: {} };
    var report = { newTrades: 0, knownTrades: 0, navDays: 0, newNavDays: 0, positions: 0, from: '', to: '', warnings: [], accounts: [] };

    var trades = {}; (prev.trades || []).forEach(function (t) { trades[t.id] = t; });
    var nav = {}; (prev.nav || []).forEach(function (n) { nav[n[0]] = n[1]; });
    var flows = {}; (prev.flows || []).forEach(function (f) { flows[f.id] = f; });

    var latestPosDate = '', latestPositions = null, hadPositions = false, hadNav = false, hadTrades = false;
    statements.forEach(function (s) {
      report.accounts.push(s.account);
      if (s.from && (!report.from || s.from < report.from)) report.from = s.from;
      if (s.to && s.to > report.to) report.to = s.to;
      if (s.sections.trades) hadTrades = true;
      if (s.sections.nav) hadNav = true;
      s.trades.forEach(function (t) {
        if (trades[t.id]) report.knownTrades++; else report.newTrades++;
        trades[t.id] = t;
      });
      s.nav.forEach(function (n) {
        if (!(n[0] in nav)) report.newNavDays++;
        nav[n[0]] = n[1];
        report.navDays++;
      });
      s.cash.forEach(function (c) { flows[c.id] = c; });
      if (s.sections.positions) {
        hadPositions = true;
        var d = s.positions.reduce(function (m, p) { return p.date > m ? p.date : m; }, s.to || '');
        if (!latestPositions || d >= latestPosDate) { latestPosDate = d; latestPositions = s.positions.slice(); }
      }
    });

    if (!hadTrades) report.warnings.push({ level: 'serious', text: 'No Trades section in this export, so no trades were added. Add Trades to the Flex Query.' });
    if (!hadNav) report.warnings.push({ level: 'serious', text: 'No Equity Summary in this export, so returns, drawdown and Sharpe can’t be worked out. Add “Net Asset Value (NAV) in Base” / Equity Summary to the Flex Query.' });
    if (!hadPositions) report.warnings.push({ level: 'warning', text: 'No Open Positions section, so the positions table keeps the last snapshot.' });

    var navArr = Object.keys(nav).sort().map(function (d) { return [d, nav[d]]; });
    var flowArr = Object.keys(flows).map(function (k) { return flows[k]; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    // A paper-account reset or a top-up shows as a jump in NAV with no trading.
    for (var i = 1; i < navArr.length; i++) {
      var d0 = navArr[i - 1], d1 = navArr[i];
      var flow = flowArr.filter(function (f) { return f.date === d1[0]; }).reduce(function (s, f) { return s + f.amount; }, 0);
      var r = d0[1] > 0 ? (d1[1] - d0[1] - flow) / d0[1] : 0;
      if (Math.abs(r) > 0.25) report.warnings.push({ level: 'serious', text: 'NAV moves ' + (r * 100).toFixed(1) + '% on ' + d1[0] + '. If the paper account was reset or topped up that day, that is not a trading return: tell the web team so it is recorded as a deposit.' });
    }

    var tradeArr = Object.keys(trades).map(function (k) { return trades[k]; })
      .sort(function (a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : (a.id < b.id ? -1 : 1); });

    // Gaps: paper accounts only keep about 45 days of statements, so an export
    // that starts after the last published day leaves a hole.
    var prevLast = (prev.nav || []).length ? prev.nav[prev.nav.length - 1][0] : '';
    if (prevLast && report.from && report.from > addDays(prevLast, 4)) {
      report.warnings.push({ level: 'serious', text: 'This export starts on ' + report.from + ' but the published book ends on ' + prevLast + '. The days in between are missing: export a longer period (IBKR keeps about 45 days for paper accounts).' });
    }

    report.positions = latestPositions ? latestPositions.length : (prev.positions || []).length;

    var book = {
      schema: SCHEMA,
      id: meta.id || prev.id,
      accountKey: meta.accountKey || prev.accountKey || '',
      currency: meta.currency || prev.currency || 'USD',
      updated: new Date().toISOString(),
      asOf: navArr.length ? navArr[navArr.length - 1][0] : (report.to || prev.asOf || ''),
      nav: navArr,
      flows: flowArr,
      positions: latestPositions || prev.positions || [],
      positionsDate: latestPositions ? latestPosDate : (prev.positionsDate || ''),
      trades: tradeArr,
      notes: prev.notes || {}
    };
    return { book: book, report: report };
  }

  function addDays(iso, n) {
    var d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /* --- Sample export ---------------------------------------------------------
     A made-up but realistic Activity Flex Query (XML) for one book, so the
     import tool can be tried before anyone has a real export, and so ?demo=1
     runs through exactly the same parser as real data. Seeded: the same book
     always gets the same sample. */
  var UNIVERSE = {
    equities: [
      ['STK', 'NVDA', 'NVIDIA CORP', 'USD', 1, 118, 0.028], ['STK', 'MSFT', 'MICROSOFT CORP', 'USD', 1, 432, 0.015],
      ['STK', 'JPM', 'JPMORGAN CHASE & CO', 'USD', 1, 224, 0.014], ['STK', 'XOM', 'EXXON MOBIL CORP', 'USD', 1, 117, 0.014],
      ['STK', 'AZN', 'ASTRAZENECA PLC', 'GBP', 1, 118.4, 0.013], ['STK', 'SHEL', 'SHELL PLC', 'GBP', 1, 26.1, 0.013],
      ['STK', 'LLY', 'ELI LILLY & CO', 'USD', 1, 905, 0.02], ['STK', 'COST', 'COSTCO WHOLESALE CORP', 'USD', 1, 889, 0.012],
      ['STK', 'BARC', 'BARCLAYS PLC', 'GBP', 1, 2.31, 0.018], ['STK', 'AMD', 'ADVANCED MICRO DEVICES', 'USD', 1, 162, 0.03]
    ],
    ficc: [
      ['CASH', 'EUR.USD', 'EUR.USD', 'USD', 1, 1.108, 0.004], ['CASH', 'GBP.USD', 'GBP.USD', 'USD', 1, 1.332, 0.005],
      ['CASH', 'USD.JPY', 'USD.JPY', 'JPY', 1, 146.2, 0.006], ['FUT', 'ZN', '10Y T-NOTE DEC26', 'USD', 1000, 113.2, 0.003],
      ['FUT', 'ZT', '2Y T-NOTE DEC26', 'USD', 2000, 103.9, 0.0012], ['FUT', 'FGBL', 'EURO-BUND DEC26', 'EUR', 1000, 133.6, 0.0035]
    ],
    macro: [
      ['FUT', 'ES', 'E-MINI S&P 500 DEC26', 'USD', 50, 5760, 0.009], ['FUT', 'GC', 'GOLD DEC26', 'USD', 100, 2665, 0.009],
      ['FUT', 'CL', 'CRUDE OIL NOV26', 'USD', 1000, 71.4, 0.021], ['FUT', 'NQ', 'E-MINI NASDAQ 100 DEC26', 'USD', 20, 20150, 0.012],
      ['CASH', 'AUD.USD', 'AUD.USD', 'USD', 1, 0.675, 0.006], ['STK', 'TLT', 'ISHARES 20+ YEAR TREASURY', 'USD', 1, 97.8, 0.009]
    ]
  };
  var FX = { USD: 1, GBP: 1.31, EUR: 1.1, JPY: 0.0068 };

  function rng(seed) {
    var s = 0;
    for (var i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function bizDays(end, n) {
    var out = [], d = new Date(end + 'T12:00:00Z');
    while (out.length < n) { var w = d.getUTCDay(); if (w && w < 6) out.unshift(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1); }
    return out;
  }

  function sampleFlex(opts) {
    opts = opts || {};
    var desk = opts.desk || 'equities';
    var R = rng(opts.seed || desk);
    var uni = UNIVERSE[desk] || UNIVERSE.equities;
    var end = opts.end || new Date().toISOString().slice(0, 10);
    var days = bizDays(end, opts.days || 70);
    var start = 1000000, cash = 0, realizedTotal = 0;
    var skill = (R() - 0.38) * 0.0007; // an edge (or not), different per book
    var px = uni.map(function (u) { return u[5]; });
    var drift = uni.map(function () { return (R() - 0.45) * 0.002; });
    var pos = uni.map(function () { return null; }); // {q, entry, opened, ref}
    var tradeXml = [], navXml = [], tid = 400000000 + Math.floor(R() * 9e7);
    var refs = opts.analysts || ['AB', 'CD', 'EF'];
    function f(n, dp) { return (Math.round(n * Math.pow(10, dp)) / Math.pow(10, dp)).toString(); }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

    days.forEach(function (d, di) {
      // Prices move first; positions carry a little edge in their favour.
      uni.forEach(function (u, i) {
        var z = (R() + R() + R() - 1.5) * 1.15;
        var tilt = pos[i] ? Math.sign(pos[i].q) * skill : 0;
        if (R() < 0.04) z *= 2.6; // the odd bad day
        px[i] = px[i] * (1 + drift[i] + tilt + z * u[6]);
      });
      // Then trade: close some positions, open some new ones.
      uni.forEach(function (u, i) {
        var p = pos[i], dpn = d.replace(/-/g, '');
        var time = dpn + ';' + ('0' + (14 + Math.floor(R() * 6))).slice(-2) + ('0' + Math.floor(R() * 60)).slice(-2) + ('0' + Math.floor(R() * 60)).slice(-2);
        var fx = FX[u[3]] || 1;
        if (p && (R() < 0.09 || di === days.length - 1 && R() < 0.2)) {
          var q = -p.q, comm = -Math.max(1, Math.abs(q) * 0.005 * (u[0] === 'STK' ? 1 : 0.4));
          var gross = (px[i] - p.entry) * p.q * u[4];
          var pnl = gross + comm + p.comm; // IBKR reports realised P&L in the trade's currency
          realizedTotal += gross * fx + comm * fx;
          tradeXml.push(trade(u, d, time, q, px[i], comm, u[0] === 'CASH' ? 0 : pnl, 'C', p.ref, ++tid, fx));
          pos[i] = null;
        } else if (!p && di < days.length - 2 && R() < 0.05) {
          var notional = (desk === 'ficc' ? 220000 : desk === 'macro' ? 150000 : 70000) * (0.6 + R() * 1.1);
          var unit = px[i] * u[4] * fx;
          var qty = Math.max(1, Math.round(notional / unit));
          if (u[0] === 'CASH') qty = Math.round(notional / 1000) * 1000;
          var long = R() < 0.62;
          qty = long ? qty : -qty;
          var c = -Math.max(1, Math.abs(qty) * 0.005 * (u[0] === 'STK' ? 1 : 0.4));
          if (u[0] === 'CASH') c = -2;
          realizedTotal += c * fx;
          var ref = refs[Math.floor(R() * refs.length)];
          pos[i] = { q: qty, entry: px[i], ref: ref, comm: c };
          tradeXml.push(trade(u, d, time, qty, px[i], c, 0, 'O', ref, ++tid, fx));
        }
      });
      var unreal = 0;
      uni.forEach(function (u, i) { if (pos[i]) unreal += (px[i] - pos[i].entry) * pos[i].q * u[4] * (FX[u[3]] || 1); });
      var total = start + realizedTotal + unreal;
      navXml.push('<EquitySummaryByReportDateInBase accountId="' + opts.account + '" currency="USD" reportDate="' + d.replace(/-/g, '') + '" cash="' + f(start + realizedTotal, 2) + '" stock="' + f(unreal, 2) + '" total="' + f(total, 2) + '" />');
    });

    var posXml = [];
    uni.forEach(function (u, i) {
      var p = pos[i]; if (!p) return;
      var fx = FX[u[3]] || 1;
      var val = p.q * px[i] * u[4];
      var navLast = Number(/total="([\d.-]+)"/.exec(navXml[navXml.length - 1])[1]);
      posXml.push('<OpenPosition accountId="' + opts.account + '" currency="' + u[3] + '" fxRateToBase="' + fx + '" assetCategory="' + u[0] + '" symbol="' + esc(u[1]) + '" description="' + esc(u[2]) + '" conid="' + conid(u[1]) + '" multiplier="' + u[4] + '" reportDate="' + end.replace(/-/g, '') + '" position="' + p.q + '" markPrice="' + f(px[i], 5) + '" positionValue="' + f(val, 2) + '" costBasisPrice="' + f(p.entry, 5) + '" fifoPnlUnrealized="' + f((px[i] - p.entry) * p.q * u[4], 2) + '" percentOfNAV="' + f(Math.abs(val * fx) / navLast * 100, 2) + '" side="' + (p.q > 0 ? 'Long' : 'Short') + '" levelOfDetail="SUMMARY" />');
    });

    function conid(sym) { var h = 0; for (var k = 0; k < sym.length; k++) h = (h * 131 + sym.charCodeAt(k)) % 900000000; return 100000000 + h; }
    function trade(u, d, time, q, price, comm, pnl, oc, ref, id, fx) {
      return '<Trade accountId="' + opts.account + '" currency="' + u[3] + '" fxRateToBase="' + fx + '" assetCategory="' + u[0] + '" symbol="' + esc(u[1]) + '" description="' + esc(u[2]) + '" conid="' + conid(u[1]) + '" multiplier="' + u[4] + '" tradeID="' + id + '" tradeDate="' + d.replace(/-/g, '') + '" dateTime="' + time + '" quantity="' + q + '" tradePrice="' + f(price, 5) + '" ibCommission="' + f(comm, 2) + '" ibCommissionCurrency="' + u[3] + '" fifoPnlRealized="' + f(pnl, 2) + '" buySell="' + (q > 0 ? 'BUY' : 'SELL') + '" openCloseIndicator="' + oc + '" orderReference="' + ref + '" levelOfDetail="EXECUTION" />';
    }

    return '<?xml version="1.0" encoding="UTF-8"?>\n<FlexQueryResponse queryName="BTS books" type="AF"><FlexStatements count="1"><FlexStatement accountId="' + opts.account + '" fromDate="' + days[0].replace(/-/g, '') + '" toDate="' + end.replace(/-/g, '') + '" period="Custom" whenGenerated="' + end.replace(/-/g, '') + ';180000">' +
      '<EquitySummaryInBase>' + navXml.join('') + '</EquitySummaryInBase>' +
      '<OpenPositions>' + posXml.join('') + '</OpenPositions>' +
      '<Trades>' + tradeXml.join('') + '</Trades>' +
      '</FlexStatement></FlexStatements></FlexQueryResponse>';
  }

  root.BooksFlex = {
    SCHEMA: SCHEMA,
    parse: parse,
    merge: merge,
    hashAccount: hashAccount,
    sampleFlex: sampleFlex,
    FlexError: FlexError
  };
})(window);
