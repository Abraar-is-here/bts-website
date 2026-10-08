/* ===========================================================================
   books-core.js — the numbers and the drawing behind /books/.

   Input: one JSON file per book (written by the import tool from an IBKR Flex
   export, see js/books-flex.js) plus books/data/index.json, which says which
   desk each book belongs to and whose it is.

   Everything shown is worked out here, in the open, from those files:
   - Returns come from the daily net asset value (NAV) IBKR reports, adjusted
     for deposits, chained day to day (time-weighted).
   - Round-trip trades are rebuilt from the executions: a trade opens when a
     position leaves zero and closes when it gets back there.
   - Desk figures add the books together by capital, so a bigger book counts
     for more, as it would on a real desk.
   ========================================================================== */
(function (root) {
  'use strict';

  var TRADING_DAYS = 252;
  var MIN_RISK_DAYS = 20;   // Sharpe, Sortino and volatility need this many days
  var MIN_ANN_DAYS = 126;   // annualised return needs about six months

  var ASSET = { STK: 'Equities', OPT: 'Options', FUT: 'Futures', FOP: 'Futures options', CASH: 'FX', BOND: 'Bonds', CFD: 'CFDs', CRYPTO: 'Crypto', WAR: 'Warrants', FUND: 'Funds', IND: 'Indices', BILL: 'Bills' };

  /* --- Maths ----------------------------------------------------------------- */
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function mean(a) { return a.length ? sum(a) / a.length : null; }
  function sd(a) {
    if (a.length < 2) return null;
    var m = mean(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / (a.length - 1));
  }
  function daysBetween(a, b) { return Math.round((Date.parse(b.slice(0, 10) + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 864e5); }

  /* Daily returns from NAV, net of deposits on the day they land. */
  function returnsFromNav(nav, flows) {
    var flowBy = {};
    (flows || []).forEach(function (f) { flowBy[f.date] = (flowBy[f.date] || 0) + f.amount; });
    var out = { dates: [], r: [], pnl: [], prev: [] };
    for (var i = 1; i < nav.length; i++) {
      var p = nav[i - 1][1], v = nav[i][1];
      if (!(p > 0)) continue;
      var pnl = v - p - (flowBy[nav[i][0]] || 0);
      out.dates.push(nav[i][0]);
      out.r.push(pnl / p);
      out.pnl.push(pnl);
      out.prev.push(p);
    }
    return out;
  }

  function performance(start, series) {
    var r = series.r, n = r.length;
    var cum = [[start, 0]], dd = [[start, 0]];
    var idx = 1, peak = 1, maxDD = 0, ddStart = 0, longest = 0, run = 0;
    for (var i = 0; i < n; i++) {
      idx *= 1 + r[i];
      if (idx >= peak) { peak = idx; run = 0; } else { run++; if (run > longest) longest = run; }
      var d = idx / peak - 1;
      if (d < maxDD) maxDD = d;
      cum.push([series.dates[i], idx - 1]);
      dd.push([series.dates[i], d]);
    }
    var total = idx - 1;
    var vol = n >= MIN_RISK_DAYS ? sd(r) * Math.sqrt(TRADING_DAYS) : null;
    var m = mean(r);
    var down = r.filter(function (x) { return x < 0; });
    var downDev = n >= MIN_RISK_DAYS ? Math.sqrt(sum(down.map(function (x) { return x * x; })) / n) * Math.sqrt(TRADING_DAYS) : null;
    var ann = n >= MIN_ANN_DAYS ? Math.pow(1 + total, TRADING_DAYS / n) - 1 : null;
    return {
      days: n,
      total: n ? total : null,
      pnl: n ? sum(series.pnl) : null,
      annualised: ann,
      volatility: vol,
      sharpe: vol ? m * TRADING_DAYS / vol : null,
      sortino: downDev ? m * TRADING_DAYS / downDev : null,
      maxDrawdown: n ? maxDD : null,
      drawdownNow: n ? dd[dd.length - 1][1] : null,
      longestDrawdown: n ? longest : null,
      calmar: ann != null && maxDD < 0 ? ann / -maxDD : null,
      bestDay: n ? Math.max.apply(null, r) : null,
      worstDay: n ? Math.min.apply(null, r) : null,
      positiveDays: n ? r.filter(function (x) { return x > 0; }).length / n : null,
      cum: cum,
      dd: dd,
      monthly: monthly(series)
    };
  }

  function monthly(series) {
    var by = {};
    series.dates.forEach(function (d, i) {
      var k = d.slice(0, 7);
      by[k] = (by[k] == null ? 1 : by[k]) * (1 + series.r[i]);
    });
    var out = {};
    Object.keys(by).forEach(function (k) { out[k] = by[k] - 1; });
    return out;
  }

  /* --- Round trips ------------------------------------------------------------
     Walk each instrument's executions in time order, tracking the position.
     IBKR's own FIFO realised P&L is used where it gives one (it already nets
     off commissions on both legs). FX conversions don't get one from IBKR, so
     for those, and anything else missing it, P&L is worked out first-in
     first-out here. */
  function buildTrips(trades, bookId) {
    var byKey = {};
    trades.forEach(function (t) { (byKey[t.key] = byKey[t.key] || []).push(t); });
    var trips = [];
    Object.keys(byKey).forEach(function (k) {
      var list = byKey[k].slice().sort(function (a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : (a.id < b.id ? -1 : 1); });
      var pos = 0, lots = [], trip = null;
      function open(t, qty) {
        trip = {
          book: bookId, key: k, symbol: t.symbol, description: t.description, asset: t.asset, currency: t.currency,
          side: qty > 0 ? 'Long' : 'Short', opened: t.time, closed: '', ref: t.ref || '',
          notional: 0, openQty: 0, openValue: 0, closeQty: 0, closeValue: 0,
          ibkrPnl: 0, ibkrComplete: true, ownPnl: 0, commission: 0, fills: 0, maxQty: 0, partial: false
        };
      }
      list.forEach(function (t) {
        var q = t.quantity, fx = t.fx || 1, m = t.multiplier || 1;
        var commBase = (t.commission || 0) * fx;
        // History can start part-way through a position (paper statements
        // only go back ~45 days). A closing fill with nothing open is that.
        if (pos === 0 && /C/.test(t.openClose) && !/O/.test(t.openClose)) {
          open(t, -q);
          trip.partial = true;
          trip.opened = '';
          lots.push({ qty: -q, price: null });
          pos = -q;
        }
        if (pos === 0) open(t, q);
        trip.fills++;
        trip.commission += commBase;
        if (pos === 0 || Math.sign(q) === Math.sign(pos)) {
          lots.push({ qty: q, price: t.price });
          pos += q;
          trip.openQty += Math.abs(q);
          trip.openValue += Math.abs(q) * t.price;
          trip.notional += Math.abs(q * t.price * m * fx);
          trip.ownPnl += commBase;
          trip.maxQty = Math.max(trip.maxQty, Math.abs(pos));
          return;
        }
        // Reducing, closing or flipping.
        var closing = Math.min(Math.abs(q), Math.abs(pos));
        var left = closing, realised = 0;
        while (left > 1e-12 && lots.length) {
          var lot = lots[0], take = Math.min(left, Math.abs(lot.qty));
          if (lot.price != null) realised += (t.price - lot.price) * take * Math.sign(lot.qty) * m;
          else trip.ibkrComplete = trip.ibkrComplete && t.pnl != null;
          lot.qty -= take * Math.sign(lot.qty);
          left -= take;
          if (Math.abs(lot.qty) < 1e-12) lots.shift();
        }
        trip.ownPnl += realised * fx + commBase;
        trip.closeQty += closing;
        trip.closeValue += closing * t.price;
        if (t.pnl == null || (t.pnl === 0 && t.asset === 'CASH')) trip.ibkrComplete = false;
        else trip.ibkrPnl += t.pnl * fx;
        pos += Math.sign(q) * closing;
        if (Math.abs(pos) < 1e-9) {
          pos = 0;
          trip.closed = t.time;
          finish(trip);
          var rest = Math.abs(q) - closing;
          if (rest > 1e-9) {
            // Flipped through zero: what is left opens the next trip.
            var flip = Math.sign(q) * rest;
            open(t, flip);
            trip.fills++;
            lots = [{ qty: flip, price: t.price }];
            pos = flip;
            trip.openQty += rest;
            trip.openValue += rest * t.price;
            trip.notional += Math.abs(flip * t.price * m * fx);
            trip.maxQty = Math.abs(pos);
          } else {
            trip = null;
            lots = [];
          }
        }
      });
      if (trip && pos !== 0) { trip.open = true; trip.position = pos; finish(trip); }
    });
    function finish(tr) {
      tr.entry = tr.openQty ? tr.openValue / tr.openQty : null;
      tr.exit = tr.closeQty ? tr.closeValue / tr.closeQty : null;
      if (!tr.open) {
        tr.pnl = tr.ibkrComplete && tr.asset !== 'CASH' ? tr.ibkrPnl : tr.ownPnl;
        tr.ret = tr.notional ? tr.pnl / tr.notional : null;
        tr.days = tr.opened ? Math.max(0, daysBetween(tr.opened, tr.closed)) : null;
      }
      trips.push(tr);
    }
    return trips;
  }

  function tradeStats(closed, trades, avgNav) {
    var n = closed.length;
    var wins = closed.filter(function (t) { return t.pnl > 0; });
    var losses = closed.filter(function (t) { return t.pnl < 0; });
    var gw = sum(wins.map(function (t) { return t.pnl; }));
    var gl = sum(losses.map(function (t) { return t.pnl; }));
    function holdAvg(list) { var d = list.filter(function (t) { return t.days != null; }).map(function (t) { return t.days; }); return d.length ? mean(d) : null; }
    function side(s) {
      var l = closed.filter(function (t) { return t.side === s; });
      return { n: l.length, winRate: l.length ? l.filter(function (t) { return t.pnl > 0; }).length / l.length : null, pnl: sum(l.map(function (t) { return t.pnl; })) };
    }
    var traded = sum(trades.map(function (t) { return Math.abs(t.quantity * t.price * (t.multiplier || 1) * (t.fx || 1)); }));
    return {
      trades: n,
      executions: trades.length,
      winRate: n ? wins.length / n : null,
      avgWin: wins.length ? gw / wins.length : null,
      avgLoss: losses.length ? gl / losses.length : null,
      payoff: wins.length && losses.length ? (gw / wins.length) / Math.abs(gl / losses.length) : null,
      profitFactor: gl < 0 ? gw / -gl : null,
      expectancy: n ? sum(closed.map(function (t) { return t.pnl; })) / n : null,
      expectancyPct: n ? mean(closed.filter(function (t) { return t.ret != null; }).map(function (t) { return t.ret; })) : null,
      bestTrade: n ? closed.reduce(function (a, b) { return b.pnl > a.pnl ? b : a; }) : null,
      worstTrade: n ? closed.reduce(function (a, b) { return b.pnl < a.pnl ? b : a; }) : null,
      holdWin: holdAvg(wins),
      holdLoss: holdAvg(losses),
      hold: holdAvg(closed),
      long: side('Long'),
      short: side('Short'),
      commissions: sum(trades.map(function (t) { return (t.commission || 0) * (t.fx || 1); })),
      turnover: avgNav ? traded / avgNav : null
    };
  }

  function exposure(positions, nav, trips) {
    var openBy = {};
    trips.filter(function (t) { return t.open; }).forEach(function (t) { openBy[t.book + '|' + t.key] = t; });
    var rows = positions.map(function (p) {
      var fx = p.fx || 1;
      var value = p.value != null ? p.value : (p.mark != null ? p.quantity * p.mark * (p.multiplier || 1) : 0);
      var trip = openBy[p.book + '|' + p.key];
      return {
        book: p.book, symbol: p.symbol, description: p.description, asset: p.asset, currency: p.currency,
        side: p.quantity > 0 ? 'Long' : 'Short', quantity: p.quantity, mark: p.mark, cost: p.cost,
        value: value * fx,
        unrealized: p.unrealized != null ? p.unrealized * fx : null,
        ret: p.cost && p.mark ? (p.mark / p.cost - 1) * (p.quantity > 0 ? 1 : -1) : null,
        opened: trip ? trip.opened : '',
        ref: trip ? trip.ref : '',
        key: p.key
      };
    });
    var long = sum(rows.filter(function (r) { return r.value > 0; }).map(function (r) { return r.value; }));
    var short = sum(rows.filter(function (r) { return r.value < 0; }).map(function (r) { return r.value; }));
    var byAsset = {};
    rows.forEach(function (r) {
      var a = ASSET[r.asset] || r.asset || 'Other';
      byAsset[a] = byAsset[a] || { long: 0, short: 0 };
      if (r.value > 0) byAsset[a].long += r.value; else byAsset[a].short += r.value;
    });
    rows.forEach(function (r) { r.pctNav = nav ? r.value / nav : null; });
    rows.sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); });
    return {
      rows: rows,
      nav: nav,
      long: nav ? long / nav : null,
      short: nav ? short / nav : null,
      gross: nav ? (long - short) / nav : null,
      net: nav ? (long + short) / nav : null,
      largest: rows.length && nav ? Math.abs(rows[0].value) / nav : null,
      byAsset: Object.keys(byAsset).map(function (k) { return { name: k, long: nav ? byAsset[k].long / nav : 0, short: nav ? byAsset[k].short / nav : 0 }; })
        .sort(function (a, b) { return (b.long - b.short) - (a.long - a.short); })
    };
  }

  /* --- Public: a book, a desk ---------------------------------------------- */
  function computeBook(book, meta) {
    meta = meta || {};
    var id = meta.id || book.id;
    var nav = (book.nav || []).slice().sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
    var series = returnsFromNav(nav, book.flows);
    var trades = (book.trades || []).map(function (t) { return Object.assign({ book: id }, t); });
    var trips = buildTrips(trades, id);
    var notes = book.notes || {};
    trips.forEach(function (t) {
      var n = notes[tripKey(t)];
      if (n) { if (n.analyst) t.analyst = n.analyst; if (n.thesis) t.thesis = n.thesis; }
      if (!t.analyst && t.ref) t.analyst = t.ref;
      t.head = meta.head || '';
    });
    var closed = trips.filter(function (t) { return !t.open; }).sort(function (a, b) { return a.closed < b.closed ? -1 : 1; });
    var lastNav = nav.length ? nav[nav.length - 1][1] : null;
    var avgNav = nav.length ? mean(nav.map(function (n) { return n[1]; })) : null;
    var positions = (book.positions || []).map(function (p) { return Object.assign({ book: id }, p); });
    return {
      id: id,
      head: meta.head || '',
      name: meta.name || meta.head || id,
      currency: book.currency || 'USD',
      asOf: book.asOf || (nav.length ? nav[nav.length - 1][0] : ''),
      updated: book.updated || '',
      start: nav.length ? nav[0][0] : '',
      capital: lastNav,
      series: series,
      perf: performance(nav.length ? nav[0][0] : '', series),
      trips: trips,
      closed: closed,
      trades: trades,
      exposure: exposure(positions, lastNav, trips),
      stats: tradeStats(closed, trades, avgNav),
      hasData: nav.length > 1 || trades.length > 0
    };
  }

  function tripKey(t) { return t.key + '@' + (t.opened || 'start'); }

  function computeDesk(meta, books) {
    var live = books.filter(function (b) { return b.hasData; });
    var dates = {};
    live.forEach(function (b) { b.series.dates.forEach(function (d, i) { (dates[d] = dates[d] || []).push([b.series.pnl[i], b.series.prev[i]]); }); });
    var series = { dates: [], r: [], pnl: [], prev: [] };
    Object.keys(dates).sort().forEach(function (d) {
      var pnl = sum(dates[d].map(function (x) { return x[0]; }));
      var prev = sum(dates[d].map(function (x) { return x[1]; }));
      if (prev > 0) { series.dates.push(d); series.r.push(pnl / prev); series.pnl.push(pnl); series.prev.push(prev); }
    });
    var start = live.reduce(function (m, b) { return !m || (b.start && b.start < m) ? b.start : m; }, '');
    var trips = [].concat.apply([], live.map(function (b) { return b.trips; }));
    var closed = trips.filter(function (t) { return !t.open; }).sort(function (a, b) { return a.closed < b.closed ? -1 : 1; });
    var trades = [].concat.apply([], live.map(function (b) { return b.trades; }));
    var capital = sum(live.map(function (b) { return b.capital || 0; }));
    var positions = [];
    live.forEach(function (b) { positions = positions.concat(b.exposure.rows.map(function (r) { return r; })); });
    var exp = exposureFromRows(positions, capital);
    var avgNav = mean(series.prev);
    var currencies = live.map(function (b) { return b.currency; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
    return {
      id: meta.id,
      name: meta.name,
      status: meta.status || '',
      books: books,
      live: live,
      currency: currencies.length === 1 ? currencies[0] : (currencies[0] || 'USD'),
      mixedCurrency: currencies.length > 1,
      start: start,
      asOf: live.reduce(function (m, b) { return b.asOf > m ? b.asOf : m; }, ''),
      updated: live.reduce(function (m, b) { return b.updated > m ? b.updated : m; }, ''),
      capital: capital,
      series: series,
      perf: performance(start, series),
      trips: trips,
      closed: closed,
      trades: trades,
      exposure: exp,
      stats: tradeStats(closed, trades, avgNav),
      hasData: live.length > 0
    };
  }

  function exposureFromRows(rows, nav) {
    var long = sum(rows.filter(function (r) { return r.value > 0; }).map(function (r) { return r.value; }));
    var short = sum(rows.filter(function (r) { return r.value < 0; }).map(function (r) { return r.value; }));
    var byAsset = {};
    rows = rows.map(function (r) {
      var o = Object.assign({}, r);
      o.pctNav = nav ? r.value / nav : null;
      var a = ASSET[r.asset] || r.asset || 'Other';
      byAsset[a] = byAsset[a] || { long: 0, short: 0 };
      if (r.value > 0) byAsset[a].long += r.value; else byAsset[a].short += r.value;
      return o;
    }).sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); });
    return {
      rows: rows, nav: nav,
      long: nav ? long / nav : null, short: nav ? short / nav : null,
      gross: nav ? (long - short) / nav : null, net: nav ? (long + short) / nav : null,
      largest: rows.length && nav ? Math.abs(rows[0].value) / nav : null,
      byAsset: Object.keys(byAsset).map(function (k) { return { name: k, long: nav ? byAsset[k].long / nav : 0, short: nav ? byAsset[k].short / nav : 0 }; })
        .sort(function (a, b) { return (b.long - b.short) - (a.long - a.short); })
    };
  }

  /* --- Formatting ------------------------------------------------------------ */
  var MINUS = '−';
  function pct(x, dp, signed) {
    if (x == null || !isFinite(x)) return '–';
    dp = dp == null ? 2 : dp;
    var v = Math.abs(x * 100).toFixed(dp);
    if (Number(v) === 0) return (0).toFixed(dp) + '%';
    return (x < 0 ? MINUS : signed === false ? '' : '+') + v + '%';
  }
  function ratio(x, dp) { if (x == null || !isFinite(x)) return '–'; return (x < 0 ? MINUS : '') + Math.abs(x).toFixed(dp == null ? 2 : dp); }
  function money(x, cur, opts) {
    if (x == null || !isFinite(x)) return '–';
    opts = opts || {};
    var f = new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur || 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: opts.dp == null ? 0 : opts.dp, minimumFractionDigits: opts.dp == null ? 0 : opts.dp, notation: opts.compact ? 'compact' : 'standard' });
    var s = f.format(Math.abs(x));
    if (Math.abs(x) < 0.5 && !opts.dp) return s;
    return (x < 0 ? MINUS : opts.signed ? '+' : '') + s;
  }
  function price(x) {
    if (x == null || !isFinite(x)) return '–';
    var a = Math.abs(x);
    var dp = a >= 1000 ? 2 : a >= 10 ? 2 : a >= 1 ? 4 : 5;
    return x.toLocaleString('en-GB', { minimumFractionDigits: Math.min(dp, 2), maximumFractionDigits: dp });
  }
  function qty(x) { if (x == null) return '–'; return Math.abs(x).toLocaleString('en-GB', { maximumFractionDigits: 4 }); }
  function day(iso, withYear) {
    if (!iso) return '–';
    var d = new Date(iso.slice(0, 10) + 'T12:00:00Z');
    return d.toLocaleDateString('en-GB', withYear ? { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' });
  }
  function upDown(x) { return x > 0 ? 'is-up' : x < 0 ? 'is-down' : ''; }

  root.BooksCore = {
    computeBook: computeBook,
    computeDesk: computeDesk,
    tripKey: tripKey,
    ASSET: ASSET,
    MIN_RISK_DAYS: MIN_RISK_DAYS,
    MIN_ANN_DAYS: MIN_ANN_DAYS,
    fmt: { pct: pct, ratio: ratio, money: money, price: price, qty: qty, day: day, upDown: upDown, MINUS: MINUS }
  };
})(window);
