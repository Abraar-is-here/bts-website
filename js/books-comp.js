/* ===========================================================================
   books-comp.js: the Bristol Trading Competition (/books/competition/) and the
   banner for it at the top of The Floor.

   The trading week is scored from each book's own daily account values, the
   same files The Floor reads, so a team's week is part of its book and also
   shown on its own here.

   How a team's week is measured (books/data/competition.json sets the dates):
     start     the account value at the close before the week (or, for an
               account opened during the week, its first value)
     return    compounded from each day's change, deposits taken out
     above cash  return minus what cash (SONIA) earned over the same days
     Sharpe    average daily return above cash divided by its standard
               deviation, times the square root of 252. Needs two days or more
               and at least one trade in the week; otherwise no Sharpe.
     drawdown  the largest fall from a high during the week

   How points are given:
     1. Teams are ranked on each of the three measures. Each ranking earns
        points from the table (25, 18, 15, 12, 10, 8, 6, 4, 2, 1).
     2. Those are blended by the published weights (return above cash 50%,
        Sharpe 30%, drawdown 20%) into a score for the week.
     3. The teams are placed by that score, and their place earns the week's
        points from the same table. Ties are split by return above cash, then
        by the smaller drawdown.
   The pitch is marked out of 60 per judge on the scorecard
   (/roadmap/competition/scorecard/). The judges' totals go in "pitchMarks" in
   competition.json; desks are placed by them and earn points from
   "pitchPoints" (double the week's table, as the pitch is 60% and the week
   30% in the guide), added to the week's points for the total. A number in "pitch" sets a
   desk's pitch points directly instead.
   ========================================================================== */
(function (root) {
  'use strict';

  var C = root.BooksCore, F = C.fmt;
  var TRADING_DAYS = 252;

  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }
  function levelOn(series, d) {
    var v = null;
    for (var k = 0; k < series.length && series[k][0] <= d; k++) v = series[k][1];
    return v;
  }
  function mean(a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; }
  function sd(a) {
    var m = mean(a);
    return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1));
  }

  /* --- One team's week -------------------------------------------------------- */
  function week(data, cash, from, to) {
    if (!data || !data.nav) return null;
    var nav = data.nav.filter(function (p) { return p[1] > 0; }).slice().sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
    var before = nav.filter(function (p) { return p[0] < from; });
    var inside = nav.filter(function (p) { return p[0] >= from && p[0] <= to; });
    var base = before.length ? before[before.length - 1] : inside.shift();
    if (!base || !inside.length) return null;
    var flow = {};
    (data.flows || []).forEach(function (f) { flow[f.date] = (flow[f.date] || 0) + (f.amount || 0); });
    var pts = [base].concat(inside);
    var ex = [], pnl = 0, idx = 1, peak = 1, maxDD = 0, cum = [[base[0], 0]];
    for (var i = 1; i < pts.length; i++) {
      var p = pts[i - 1][1], v = pts[i][1], d = v - p - (flow[pts[i][0]] || 0), r = d / p;
      pnl += d;
      idx *= 1 + r;
      if (idx > peak) peak = idx;
      if (idx / peak - 1 < maxDD) maxDD = idx / peak - 1;
      cum.push([pts[i][0], idx - 1]);
      var ca = cash ? levelOn(cash, pts[i - 1][0]) : null, cb = cash ? levelOn(cash, pts[i][0]) : null;
      ex.push(ca > 0 && cb > 0 ? r - (cb / ca - 1) : r);
    }
    var end = pts[pts.length - 1][0];
    var c0 = cash ? levelOn(cash, base[0]) : null, c1 = cash ? levelOn(cash, end) : null;
    var cashRet = c0 > 0 && c1 > 0 ? c1 / c0 - 1 : 0;
    var fills = (data.trades || []).filter(function (t) { var d = String(t.time || '').slice(0, 10); return d >= from && d <= to; }).length;
    var s = ex.length >= 2 ? sd(ex) : 0;
    return {
      start: base[0], end: end, complete: end >= to, days: ex.length,
      ret: idx - 1, cash: cashRet, above: idx - 1 - cashRet,
      sharpe: fills > 0 && s > 0 ? mean(ex) / s * Math.sqrt(TRADING_DAYS) : null,
      maxDD: maxDD, pnl: pnl, fills: fills, cum: cum, currency: data.currency || 'GBP'
    };
  }

  /* --- Standings ---------------------------------------------------------------- */
  function pointsFor(table, place) { return place && place <= table.length ? table[place - 1] : 0; }

  // Competition ranking on one measure: equal values share a place; teams
  // without a value get no place (and so no points) on that measure.
  function rank(list, get, key) {
    var have = list.filter(function (t) { return get(t) != null; }).sort(function (a, b) { return get(b) - get(a); });
    have.forEach(function (t, i) {
      t.rank[key] = i && get(t) === get(have[i - 1]) ? have[i - 1].rank[key] : i + 1;
    });
    list.forEach(function (t) { if (get(t) == null) t.rank[key] = null; });
  }

  function standings(teams, cfg) {
    var P = cfg.points, W = cfg.weights;
    var racing = teams.filter(function (t) { return t.week; });
    racing.forEach(function (t) { t.rank = {}; });
    rank(racing, function (t) { return t.week.above; }, 'ret');
    rank(racing, function (t) { return t.week.sharpe; }, 'sharpe');
    rank(racing, function (t) { return t.week.maxDD; }, 'dd'); // closer to zero ranks higher
    racing.forEach(function (t) {
      t.measurePts = { ret: pointsFor(P, t.rank.ret), sharpe: pointsFor(P, t.rank.sharpe), dd: pointsFor(P, t.rank.dd) };
      t.score = W.return * t.measurePts.ret + W.sharpe * t.measurePts.sharpe + W.drawdown * t.measurePts.dd;
    });
    racing.sort(function (a, b) { return b.score - a.score || b.week.above - a.week.above || b.week.maxDD - a.week.maxDD; });
    racing.forEach(function (t, i) {
      var prev = racing[i - 1];
      t.place = prev && prev.score === t.score && prev.week.above === t.week.above && prev.week.maxDD === t.week.maxDD ? prev.place : i + 1;
      t.weekPts = pointsFor(P, t.place);
    });
    // Pitch: the judges' marks from the scorecard, added up across the judges.
    // Desks are placed by the total and earn points from cfg.pitchPoints (double
    // the week's table: the guide weights the pitch 60% and the week 30%); a tie
    // is split by the thesis marks, then the analysis marks.
    var M = cfg.pitchMarks || {};
    var mk = function (t) { return M[t.id] || {}; };
    var marked = teams.filter(function (t) { return typeof mk(t).total === 'number'; }).sort(function (a, b) {
      return mk(b).total - mk(a).total || (mk(b).thesis || 0) - (mk(a).thesis || 0) || (mk(b).analysis || 0) - (mk(a).analysis || 0);
    });
    marked.forEach(function (t, i) {
      var p = marked[i - 1], a = mk(t), b = p && mk(p);
      t.pitchPlace = b && b.total === a.total && (b.thesis || 0) === (a.thesis || 0) && (b.analysis || 0) === (a.analysis || 0) ? p.pitchPlace : i + 1;
    });
    teams.forEach(function (t) {
      if (!t.week) { t.place = null; t.weekPts = 0; }
      var pp = cfg.pitch && cfg.pitch[t.id];
      if (typeof pp !== 'number' && t.pitchPlace) pp = pointsFor(cfg.pitchPoints || P, t.pitchPlace);
      t.pitchPts = typeof pp === 'number' ? pp : null;
      t.total = t.weekPts + (t.pitchPts || 0);
    });
    var overall = teams.slice().sort(function (a, b) {
      return b.total - a.total || b.weekPts - a.weekPts || (a.place || 99) - (b.place || 99) || a.name.localeCompare(b.name);
    });
    overall.forEach(function (t, i) {
      var prev = overall[i - 1];
      t.overall = !t.week && t.pitchPts == null ? null : prev && prev.overall && prev.total === t.total && prev.weekPts === t.weekPts ? prev.overall : i + 1;
    });
    return { teams: teams, racing: racing, overall: overall };
  }

  /* --- Loading ------------------------------------------------------------------- */
  function load() {
    return Promise.all([
      getJSON('books/data/index.json'),
      getJSON('books/data/competition.json'),
      getJSON('books/data/benchmarks.json').catch(function () { return null; })
    ]).then(function (got) {
      var m = got[0], cfg = got[1], bm = got[2];
      if (!m || !cfg) throw new Error('No competition data');
      var cash = bm && bm.benchmarks && bm.benchmarks.cash ? bm.benchmarks.cash.series : null;
      var list = [];
      m.desks.forEach(function (d) { d.books.forEach(function (b) { list.push({ id: b.id, name: b.name || b.head, desk: d.name }); }); });
      return Promise.all(list.map(function (t, i) {
        return getJSON('books/data/' + t.id + '.json').catch(function () { return null; }).then(function (data) {
          t.week = week(data, cash, cfg.week.from, cfg.week.to);
          return t;
        });
      })).then(function (teams) {
        var st = standings(teams, cfg);
        // Colours go to the teams that are racing, in finishing order, so no two lines look alike.
        var slot = root.BooksUI ? root.BooksUI.slot : function () { return ''; };
        st.racing.forEach(function (t, i) { t.color = slot(i); });
        teams.forEach(function (t) { if (!t.color) t.color = 'rgba(244, 247, 251, 0.35)'; });
        return { cfg: cfg, s: st };
      });
    });
  }

  /* --- Drawing ------------------------------------------------------------------- */
  // Results stay hidden until the reveal, so no desk walks into the pitch knowing it is
  // behind. ?preview=1 shows them anyway, for the committee. (Each book's figures are
  // still on The Floor, so this keeps the places quiet rather than secret.)
  var PREVIEW = new URLSearchParams(location.search).get('preview') === '1';
  function shown(cfg) { return !!cfg.reveal || PREVIEW; }
  function revealText(cfg) { return 'Results are revealed after the stock pitch, ' + (cfg.revealLabel || cfg.pitchDay.label) + '.'; }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function team(t) {
    var f = el('span', 'cp-team');
    var k = el('span', 'bk-swatch'); k.style.background = t.color;
    f.appendChild(k);
    var w = el('span');
    w.appendChild(el('span', 'cp-team__name', t.name));
    w.appendChild(el('span', 'cp-team__desk', t.desk));
    f.appendChild(w);
    return f;
  }
  function place(n) {
    var s = el('span', 'cp-place' + (n && n <= 3 ? ' cp-place--' + n : ''), n ? String(n) : '–');
    return s;
  }
  function pts(n) { var s = el('span', 'cp-pts'); s.appendChild(el('strong', null, String(n))); s.appendChild(el('span', null, ' pts')); return s; }

  function status(host, cfg, s) {
    var marked = s.racing.map(function (t) { return t.week.end; }).sort();
    var behind = s.racing.filter(function (t) { return !t.week.complete; }).length;
    var p = el('p', 'cp-status' + (cfg.final ? ' is-final' : ''));
    p.appendChild(el('span', 'cp-status__dot'));
    p.appendChild(el('span', null, cfg.final ? 'Final standings for the trading week.'
      : !s.racing.length ? 'Waiting for the first exports from the week.'
      : 'Provisional. ' + (behind ? behind + ' of ' + s.racing.length + ' teams are marked before ' + F.day(cfg.week.to) + '; ' : '') + 'standings settle once every team’s export to ' + F.day(cfg.week.to) + ' is in.'));
    host.appendChild(p);
  }

  function leaderboard(host, cfg, s) {
    var rows = s.overall.filter(function (t) { return t.overall; });
    var cols = [
      { label: 'Place', cell: function (t) { return place(t.overall); } },
      { label: 'Team', cell: team },
      { label: 'Trading week', num: true, col: 'cp-col-split', cell: function (t) { return pts(t.weekPts); } },
      { label: 'Pitch', num: true, col: 'cp-col-split', cell: function (t) { return t.pitchPts == null ? el('span', 'cp-muted', 'after ' + F.day(cfg.pitchDay.date)) : pts(t.pitchPts); } },
      { label: 'Total', num: true, cell: function (t) { var p = pts(t.total); p.classList.add('cp-pts--total'); return p; } }
    ];
    if (!rows.length) { host.appendChild(el('p', 'cp-empty', 'No team has an account value inside the week yet. The table fills in as each desk’s export arrives.')); return; }
    host.appendChild(root.BooksUI.table(cols, rows, { caption: 'Overall standings', cls: 'cp-table cp-table--board' }));
  }

  function weekTable(host, cfg, s) {
    var pct = function (x) { return x == null ? '–' : F.pct(x); };
    var cols = [
      { label: 'Place', cell: function (t) { return place(t.place); } },
      { label: 'Team', cell: team },
      { label: 'Return', num: true, cell: function (t) { return pct(t.week.ret); }, cls: function (t) { return F.upDown(t.week.ret); } },
      { label: 'Above cash', num: true, cell: function (t) { return pct(t.week.above); }, cls: function (t) { return F.upDown(t.week.above); } },
      { label: 'Sharpe', num: true, cell: function (t) { return t.week.sharpe == null ? '–' : F.ratio(t.week.sharpe); } },
      { label: 'Max drawdown', num: true, cell: function (t) { return F.pct(t.week.maxDD, 2, false); } },
      { label: 'Score', num: true, cell: function (t) { return t.score.toFixed(1); } },
      { label: 'Points', num: true, cell: function (t) { return pts(t.weekPts); } },
      { label: 'Marked to', num: true, cell: function (t) {
        var c = el('span', null, F.day(t.week.end));
        // Colour alone doesn't say it: the amber date also says so in words for screen readers.
        if (!t.week.complete) c.appendChild(el('span', 'visually-hidden', ', not yet to the last day'));
        return c;
      }, cls: function (t) { return t.week.complete ? '' : 'cp-behind'; } }
    ];
    host.appendChild(root.BooksUI.table(cols, s.racing, { caption: 'Trading week, placed by score' }));
    var waiting = s.teams.filter(function (t) { return !t.week; });
    if (waiting.length) host.appendChild(el('p', 'cp-waiting', 'No account values inside the week yet: ' + waiting.map(function (t) { return t.name; }).join(', ') + '.'));
  }

  function weekChart(host, cfg, s) {
    if (!s.racing.length) return;
    var legend = el('ul', 'bk-legend');
    s.racing.forEach(function (t) {
      var li = el('li');
      var k = el('span', 'bk-legend__key' + (t.place === 1 ? ' is-main' : '')); k.style.background = t.color;
      li.appendChild(k); li.appendChild(el('span', null, t.name));
      li.appendChild(el('strong', F.upDown(t.week.ret), F.pct(t.week.ret)));
      legend.appendChild(li);
    });
    host.appendChild(legend);
    root.BooksUI.perfChart(host, {
      series: s.racing.map(function (t) { return { id: t.id, label: t.name, color: t.color, emphasis: t.place === 1, points: t.week.cum }; }),
      label: 'Return over the trading week, ' + cfg.week.label + ', for each team with account values in the week.'
    });
  }

  function page(main) {
    var hostStatus = main.querySelector('[data-cp-status]');
    var hostBoard = main.querySelector('[data-cp-board]');
    var hostChart = main.querySelector('[data-cp-chart]');
    var hostWeek = main.querySelector('[data-cp-week]');
    load().then(function (got) {
      [hostStatus, hostBoard, hostChart, hostWeek].forEach(function (h) { h.textContent = ''; });
      if (!shown(got.cfg)) {
        var held = el('div', 'cp-held');
        held.appendChild(el('p', 'cp-held__title', 'Results are sealed until the pitch'));
        held.appendChild(el('p', 'cp-held__text', revealText(got.cfg) + ' No desk pitches knowing where it stands. The trading-week points and the pitch points are added together then.'));
        hostBoard.appendChild(held);
        hostWeek.appendChild(el('p', 'cp-empty', 'Each team’s week is shown here with the results.'));
        return;
      }
      if (PREVIEW && !got.cfg.reveal) hostStatus.appendChild(el('p', 'cp-preview', 'Preview: these results are hidden from everyone else until they are revealed.'));
      status(hostStatus, got.cfg, got.s);
      leaderboard(hostBoard, got.cfg, got.s);
      weekChart(hostChart, got.cfg, got.s);
      if (got.s.racing.length) weekTable(hostWeek, got.cfg, got.s);
      else hostWeek.appendChild(el('p', 'cp-empty', 'Each team’s week appears here once its export covers ' + got.cfg.week.label + '.'));
    }).catch(function (e) {
      console.error(e);
      hostBoard.textContent = 'Couldn’t load the standings. Refresh to try again.';
    });
  }

  // The banner on The Floor: the top three, kept current with the same data.
  function banner(box) {
    var list = box.querySelector('[data-cpb-top]');
    load().then(function (got) {
      var top = got.s.overall.filter(function (t) { return t.overall; }).slice(0, 3);
      list.textContent = '';
      if (!shown(got.cfg)) {
        list.appendChild(el('li', 'cpb-wait', 'Results and every book\u2019s performance are revealed after the stock pitch, ' + (got.cfg.revealLabel || got.cfg.pitchDay.label) + '.'));
        var sh = box.querySelector('[data-cpb-state]');
        if (sh) sh.textContent = 'Results sealed';
        var cta = box.querySelector('.cpb__cta');
        if (cta && cta.firstChild) cta.firstChild.textContent = 'About the competition ';
        return;
      }
      if (!top.length) { list.appendChild(el('li', 'cpb-wait', 'Standings fill in as the exports arrive')); return; }
      top.forEach(function (t) {
        var li = el('li');
        li.appendChild(place(t.overall));
        var k = el('span', 'bk-swatch'); k.style.background = t.color; li.appendChild(k);
        li.appendChild(el('span', 'cpb-name', t.name));
        li.appendChild(pts(t.total));
        list.appendChild(li);
      });
      var st = box.querySelector('[data-cpb-state]');
      if (st) st.textContent = got.cfg.final ? 'Trading week final' : 'Provisional standings';
      box.classList.toggle('is-final', !!got.cfg.final);
    }).catch(function () { list.textContent = ''; });
  }

  root.BooksComp = { week: week, standings: standings, load: load };

  var main = document.querySelector('[data-comp-page]');
  if (main) page(main);
  var box = document.querySelector('[data-comp-banner]');
  if (box) banner(box);
})(window);
