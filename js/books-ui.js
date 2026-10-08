/* ===========================================================================
   books-ui.js — draws the Books: desk cards, the performance chart, the
   figures, positions and the trade log. Shared by /books/ and the preview in
   /books/import/. Depends on books-core.js.

   All text from data files goes in with textContent, never innerHTML.
   ========================================================================== */
(function (root) {
  'use strict';

  var C = root.BooksCore, F = C.fmt;
  var NS = 'http://www.w3.org/2000/svg';
  var REDUCED = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The line draws itself once, on the first chart a visitor sees. After that,
  // switching desks or books shows the new state at once: people switch often.
  var drawnOnce = false;
  var EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function svg(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    // Colours arrive as CSS custom properties, which presentation attributes
    // can't resolve, so fill and stroke go on the style instead.
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if ((k === 'fill' || k === 'stroke') && /^var\(/.test(attrs[k])) n.style[k] = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    return n;
  }
  function ms(d) { return Date.parse(d.slice(0, 10) + 'T12:00:00Z'); }
  function slot(i) { return 'var(--bk-s' + ((i % 4) + 1) + ')'; }

  function niceTicks(min, max, count) {
    if (min === max) { min -= 0.01; max += 0.01; }
    var span = max - min, step = Math.pow(10, Math.floor(Math.log10(span / count)));
    var err = span / count / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, out = [];
    for (var v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v / step) * step);
    return out;
  }

  /* Shared tooltip: one per chart, positioned inside the chart's frame. */
  function tooltip(frame) {
    var t = el('div', 'bk-tip');
    t.setAttribute('role', 'presentation');
    t.hidden = true;
    frame.appendChild(t);
    return {
      show: function (x, y, build) {
        t.textContent = '';
        build(t);
        t.hidden = false;
        var fw = frame.clientWidth, tw = t.offsetWidth, th = t.offsetHeight;
        var left = x + 14;
        if (left + tw > fw - 4) left = x - tw - 14;
        if (left < 4) left = 4;
        var top = Math.max(4, y - th - 12);
        t.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
      },
      hide: function () { t.hidden = true; }
    };
  }
  function tipRow(t, color, value, label, cls) {
    var r = el('div', 'bk-tip__row');
    var k = el('span', 'bk-tip__key');
    if (color) k.style.background = color; else k.classList.add('is-empty');
    r.appendChild(k);
    r.appendChild(el('strong', cls || '', value));
    r.appendChild(el('span', null, label));
    t.appendChild(r);
  }

  function observe(node, draw) {
    var last = 0;
    function go() { var w = node.clientWidth; if (w && w !== last) { last = w; draw(w); } }
    if (root.ResizeObserver) new ResizeObserver(go).observe(node); else root.addEventListener('resize', go);
    go();
  }

  /* --- Performance chart: cumulative return, with drawdown underneath ------- */
  function perfChart(host, cfg) {
    var frame = el('div', 'bk-chart');
    var plot = el('div', 'bk-chart__plot');
    frame.appendChild(plot);
    host.appendChild(frame);
    var tip = tooltip(frame);
    // Arrow-key reading is announced; pointer hover is not (it would be noise).
    var live = el('span', 'visually-hidden');
    live.setAttribute('aria-live', 'polite');
    host.appendChild(live);
    var all = {};
    cfg.series.forEach(function (s) { s.map = {}; s.points.forEach(function (p) { s.map[p[0]] = p[1]; all[p[0]] = 1; }); });
    var ddMap = {}; (cfg.dd || []).forEach(function (p) { ddMap[p[0]] = p[1]; });
    var dates = Object.keys(all).sort();
    if (dates.length < 2) { frame.appendChild(el('p', 'bk-empty', 'The chart starts after the second day of trading.')); return; }
    var focus = dates.length - 1, state = null;
    frame.tabIndex = 0;
    frame.setAttribute('role', 'group');
    frame.setAttribute('aria-roledescription', 'chart');
    frame.setAttribute('aria-label', cfg.label || 'Performance chart');

    function draw(W) {
      plot.textContent = '';
      var H = cfg.height || Math.round(Math.max(190, Math.min(300, W * 0.42))), DH = cfg.dd ? (cfg.ddHeight || (W < 520 ? 64 : 92)) : 0, GAP = cfg.dd ? 24 : 0;
      var m = { l: 52, r: 14, t: 12, b: 26 };
      var w = W - m.l - m.r;
      var x0 = ms(dates[0]), x1 = ms(dates[dates.length - 1]);
      var X = function (d) { return m.l + (ms(d) - x0) / (x1 - x0) * w; };
      var vals = [];
      cfg.series.forEach(function (s) { s.points.forEach(function (p) { vals.push(p[1]); }); });
      var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals));
      var pad = (hi - lo) * 0.08 || 0.005;
      var yt = niceTicks(lo - pad, hi + pad, 5);
      var y0 = yt[0], y1 = yt[yt.length - 1];
      var Y = function (v) { return m.t + (1 - (v - y0) / (y1 - y0)) * H; };
      var total = m.t + H + GAP + DH + m.b;
      var s = svg('svg', { width: W, height: total, viewBox: '0 0 ' + W + ' ' + total, 'aria-hidden': 'true', focusable: 'false' });

      // Grid and y labels
      var dp = (y1 - y0) < 0.04 ? 1 : 0;
      yt.forEach(function (v) {
        s.appendChild(svg('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: v === 0 ? 'bk-axis' : 'bk-grid' }));
        var tx = svg('text', { x: m.l - 10, y: Y(v) + 4, class: 'bk-tick', 'text-anchor': 'end' });
        tx.textContent = F.pct(v, dp, v !== 0);
        s.appendChild(tx);
      });
      // X ticks
      xTicks(dates, W).forEach(function (d) {
        var t = svg('text', { x: X(d), y: m.t + H + GAP + DH + 18, class: 'bk-tick', 'text-anchor': 'middle' });
        t.textContent = F.day(d);
        s.appendChild(t);
        s.appendChild(svg('line', { x1: X(d), x2: X(d), y1: m.t + H, y2: m.t + H + 4, class: 'bk-axis' }));
      });

      // Drawdown panel
      if (cfg.dd) {
        var dy0 = m.t + H + GAP;
        var dmin = Math.min.apply(null, cfg.dd.map(function (p) { return p[1]; }));
        var dt = niceTicks(Math.min(dmin * 1.1, -0.005), 0, 2);
        var dlo = dt[0];
        var DY = function (v) { return dy0 + (v / dlo) * DH; };
        dt.forEach(function (v) {
          s.appendChild(svg('line', { x1: m.l, x2: W - m.r, y1: DY(v), y2: DY(v), class: v === 0 ? 'bk-axis' : 'bk-grid' }));
          var tx = svg('text', { x: m.l - 10, y: DY(v) + 4, class: 'bk-tick', 'text-anchor': 'end' });
          tx.textContent = F.pct(v, Math.abs(dlo) < 0.04 ? 1 : 0, false);
          s.appendChild(tx);
        });
        var lab = svg('text', { x: m.l + 8, y: dy0 + DH - 8, class: 'bk-tick bk-tick--label' });
        lab.textContent = 'Drawdown';
        s.appendChild(lab);
        var area = 'M' + X(cfg.dd[0][0]) + ',' + DY(0);
        cfg.dd.forEach(function (p) { area += 'L' + X(p[0]).toFixed(1) + ',' + DY(p[1]).toFixed(1); });
        area += 'L' + X(cfg.dd[cfg.dd.length - 1][0]) + ',' + DY(0) + 'Z';
        s.appendChild(svg('path', { d: area, class: 'bk-dd' }));
        var line = cfg.dd.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + DY(p[1]).toFixed(1); }).join('');
        s.appendChild(svg('path', { d: line, class: 'bk-dd-line' }));
        state = { DY: DY };
      }

      // Series: background books first, the emphasised line last.
      var paths = [];
      cfg.series.slice().sort(function (a, b) { return (a.emphasis ? 1 : 0) - (b.emphasis ? 1 : 0); }).forEach(function (sr) {
        var d = sr.points.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join('');
        if (sr.emphasis && cfg.area !== false) {
          var a = d + 'L' + X(sr.points[sr.points.length - 1][0]).toFixed(1) + ',' + Y(0) + 'L' + X(sr.points[0][0]).toFixed(1) + ',' + Y(0) + 'Z';
          s.appendChild(svg('path', { d: a, class: 'bk-area', fill: sr.color }));
        }
        var p = svg('path', { d: d, class: 'bk-line' + (sr.emphasis ? ' bk-line--main' : '') + (sr.reference ? ' bk-line--ref' : ''), stroke: sr.color });
        s.appendChild(p);
        paths.push(p);
        var last = sr.points[sr.points.length - 1];
        if (sr.emphasis) s.appendChild(svg('circle', { cx: X(last[0]), cy: Y(last[1]), r: 4.5, class: 'bk-end', fill: sr.color }));
      });

      // Crosshair layer
      var cross = svg('g', { class: 'bk-cross' });
      cross.style.display = 'none';
      cross.appendChild(svg('line', { y1: m.t, y2: m.t + H + GAP + DH, class: 'bk-cross__line' }));
      cfg.series.forEach(function (sr) { sr.dot = svg('circle', { r: sr.emphasis ? 5 : 4, class: 'bk-cross__dot', fill: sr.color }); cross.appendChild(sr.dot); });
      var ddDot = cfg.dd ? svg('circle', { r: 4, class: 'bk-cross__dot bk-cross__dot--dd' }) : null;
      if (ddDot) cross.appendChild(ddDot);
      s.appendChild(cross);
      var hit = svg('rect', { x: m.l, y: 0, width: w, height: total - m.b, fill: 'transparent' });
      s.appendChild(hit);
      plot.appendChild(s);

      if (!REDUCED && !drawnOnce && !frame.dataset.drawn) {
        drawnOnce = true;
        paths.forEach(function (p) {
          var len = p.getTotalLength();
          p.style.strokeDasharray = len;
          p.style.strokeDashoffset = len;
          p.getBoundingClientRect();
          p.style.transition = 'stroke-dashoffset 900ms cubic-bezier(0.16, 1, 0.3, 1)';
          p.style.strokeDashoffset = 0;
          setTimeout(function () { p.style.strokeDasharray = ''; p.style.transition = ''; }, 950);
        });
        frame.dataset.drawn = '1';
      }

      function show(i, fromKey) {
        focus = i;
        var d = dates[i], x = X(d);
        cross.style.display = '';
        cross.firstChild.setAttribute('x1', x); cross.firstChild.setAttribute('x2', x);
        cfg.series.forEach(function (sr) {
          var v = sr.map[d];
          if (v == null) { sr.dot.style.display = 'none'; return; }
          sr.dot.style.display = '';
          sr.dot.setAttribute('cx', x); sr.dot.setAttribute('cy', Y(v));
        });
        if (ddDot && ddMap[d] != null) { ddDot.setAttribute('cx', x); ddDot.setAttribute('cy', state.DY(ddMap[d])); }
        var anchorY = cfg.series[0].map[d] != null ? Y(cfg.series[0].map[d]) : m.t + 20;
        if (fromKey) live.textContent = F.day(d, true) + ': ' + cfg.series.filter(function (sr) { return sr.map[d] != null; }).map(function (sr) { return sr.label + ' ' + F.pct(sr.map[d]); }).join(', ') + (cfg.dd && ddMap[d] != null ? ', drawdown ' + F.pct(ddMap[d], 2, false) : '');
        tip.show(x, anchorY, function (t) {
          t.appendChild(el('div', 'bk-tip__head', F.day(d, true)));
          cfg.series.forEach(function (sr) { if (sr.map[d] != null) tipRow(t, sr.color, F.pct(sr.map[d]), sr.label, F.upDown(sr.map[d])); });
          if (cfg.dd && ddMap[d] != null) tipRow(t, null, F.pct(ddMap[d], 2, false), 'Drawdown');
        });
      }
      function hide() { cross.style.display = 'none'; tip.hide(); }
      function nearest(px) {
        var t = x0 + (px - m.l) / w * (x1 - x0), best = 0, bd = Infinity;
        for (var i = 0; i < dates.length; i++) { var dd = Math.abs(ms(dates[i]) - t); if (dd < bd) { bd = dd; best = i; } }
        return best;
      }
      hit.addEventListener('pointermove', function (e) { var r = s.getBoundingClientRect(); show(nearest(e.clientX - r.left)); });
      hit.addEventListener('pointerleave', hide);
      frame.onkeydown = function (e) {
        var k = e.key;
        if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'Home' && k !== 'End') return;
        e.preventDefault();
        var i = k === 'Home' ? 0 : k === 'End' ? dates.length - 1 : Math.max(0, Math.min(dates.length - 1, focus + (k === 'ArrowRight' ? 1 : -1)));
        show(i, true);
      };
      frame.onfocus = function () { show(focus, true); };
      frame.onblur = hide;
    }
    observe(frame, draw);
  }

  function xTicks(dates, W) {
    var span = (ms(dates[dates.length - 1]) - ms(dates[0])) / 864e5;
    var want = Math.max(2, Math.floor(W / 110));
    var out = [];
    if (span > 120) {
      dates.forEach(function (d, i) { if (i && d.slice(5, 7) !== dates[i - 1].slice(5, 7)) out.push(d); });
    } else {
      var step = Math.ceil(dates.length / want);
      for (var i = 0; i < dates.length; i += step) out.push(dates[i]);
    }
    return out.filter(function (d, i) { return i > 0 || out.length < want; }).slice(0, want + 1);
  }

  /* --- Small line for the desk cards ------------------------------------------ */
  function spark(host, points, color) {
    color = color || 'var(--text-primary)';
    if (!points || points.length < 2) return;
    observe(host, function (W) {
      host.textContent = '';
      var H = host.clientHeight || 64, pad = 5;
      var x0 = ms(points[0][0]), x1 = ms(points[points.length - 1][0]);
      var vals = points.map(function (p) { return p[1]; });
      var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals));
      if (hi === lo) hi = lo + 0.01;
      var X = function (d) { return pad + (ms(d) - x0) / (x1 - x0) * (W - pad * 2); };
      var Y = function (v) { return pad + (1 - (v - lo) / (hi - lo)) * (H - pad * 2); };
      var s = svg('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true', focusable: 'false' });
      s.appendChild(svg('line', { x1: 0, x2: W, y1: Y(0), y2: Y(0), class: 'bk-axis' }));
      var d = points.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join('');
      var last = points[points.length - 1];
      s.appendChild(svg('path', { d: d + 'L' + X(last[0]).toFixed(1) + ',' + Y(0) + 'L' + pad + ',' + Y(0) + 'Z', class: 'bk-area', fill: color }));
      s.appendChild(svg('path', { d: d, class: 'bk-line bk-line--main', stroke: color }));
      s.appendChild(svg('circle', { cx: X(last[0]), cy: Y(last[1]), r: 4, class: 'bk-end', fill: color }));
      host.appendChild(s);
    });
  }

  /* --- Trade tape: every closed trade as a bar, in the order it closed ------- */
  function tape(host, trips, cur, names) {
    if (!trips.length) return;
    var frame = el('div', 'bk-chart bk-tape');
    var plot = el('div', 'bk-chart__plot');
    frame.appendChild(plot);
    host.appendChild(frame);
    var tip = tooltip(frame);
    observe(frame, function (W) {
      plot.textContent = '';
      var H = 150, m = { l: 52, r: 8, t: 10, b: 10 };
      var w = W - m.l - m.r;
      var vals = trips.map(function (t) { return t.pnl; });
      var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals));
      var yt = niceTicks(lo, hi, 3);
      var Y = function (v) { return m.t + (1 - (v - yt[0]) / (yt[yt.length - 1] - yt[0])) * H; };
      var slotW = w / trips.length, bw = Math.max(1, Math.min(24, slotW - 2));
      var s = svg('svg', { width: W, height: H + m.t + m.b, viewBox: '0 0 ' + W + ' ' + (H + m.t + m.b), 'aria-hidden': 'true', focusable: 'false' });
      yt.forEach(function (v) {
        s.appendChild(svg('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: v === 0 ? 'bk-axis' : 'bk-grid' }));
        var tx = svg('text', { x: m.l - 10, y: Y(v) + 4, class: 'bk-tick', 'text-anchor': 'end' });
        tx.textContent = F.money(v, cur, { compact: true });
        s.appendChild(tx);
      });
      trips.forEach(function (t, i) {
        var x = m.l + i * slotW + (slotW - bw) / 2;
        var y = Y(Math.max(0, t.pnl)), h = Math.max(1, Math.abs(Y(t.pnl) - Y(0)));
        var r = Math.min(4, bw / 2, h);
        var up = t.pnl >= 0;
        s.appendChild(svg('path', { d: bar(x, up ? y : Y(0), bw, h, r, up), class: 'bk-bar ' + (up ? 'is-up' : 'is-down') }));
        var hitR = svg('rect', { x: m.l + i * slotW, y: m.t, width: slotW, height: H, fill: 'transparent' });
        hitR.addEventListener('pointerenter', function () {
          tip.show(x + bw / 2, Math.min(Y(t.pnl), Y(0)), function (tt) {
            tt.appendChild(el('div', 'bk-tip__head', t.symbol + ' · ' + t.side));
            tipRow(tt, null, F.money(t.pnl, cur, { signed: true }), 'P&L', F.upDown(t.pnl));
            tipRow(tt, null, F.pct(t.ret), 'Return on the position');
            tipRow(tt, null, F.day(t.closed, true), (t.days != null ? 'Closed, held ' + t.days + (t.days === 1 ? ' day' : ' days') : 'Closed'));
            if (names && names[t.book]) tipRow(tt, null, names[t.book], 'Book');
          });
        });
        hitR.addEventListener('pointerleave', tip.hide);
        s.appendChild(hitR);
      });
      plot.appendChild(s);
    });
  }
  // A bar with rounded data end and square baseline.
  function bar(x, y, w, h, r, up) {
    if (up) return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
    return 'M' + x + ',' + y + 'V' + (y + h - r) + 'Q' + x + ',' + (y + h) + ' ' + (x + r) + ',' + (y + h) + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + (y + h) + ' ' + (x + w) + ',' + (y + h - r) + 'V' + y + 'Z';
  }

  /* --- Monthly returns -------------------------------------------------------- */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function monthlyTable(monthly) {
    var keys = Object.keys(monthly).sort();
    if (!keys.length) return el('p', 'bk-empty', 'Monthly returns appear after the first full day of trading.');
    var years = keys.map(function (k) { return k.slice(0, 4); }).filter(function (y, i, a) { return a.indexOf(y) === i; });
    var max = Math.max.apply(null, keys.map(function (k) { return Math.abs(monthly[k]); })) || 0.01;
    var wrap = scrollBox('Monthly returns');
    var t = el('table', 'bk-months');
    var cap = el('caption', 'visually-hidden', 'Return by month, compounded from daily returns');
    t.appendChild(cap);
    var hr = el('tr');
    var th0 = el('th', null, ''); th0.scope = 'col'; th0.appendChild(el('span', 'visually-hidden', 'Year')); hr.appendChild(th0);
    MONTHS.forEach(function (mn) { var th = el('th', null, mn); th.scope = 'col'; hr.appendChild(th); });
    var thY = el('th', null, 'Total'); thY.scope = 'col'; thY.className = 'bk-months__year'; hr.appendChild(thY);
    var thead = el('thead'); thead.appendChild(hr); t.appendChild(thead);
    var tb = el('tbody');
    years.forEach(function (y) {
      var tr = el('tr');
      var th = el('th', null, y); th.scope = 'row'; tr.appendChild(th);
      var yr = 1, any = false;
      MONTHS.forEach(function (_, i) {
        var k = y + '-' + ('0' + (i + 1)).slice(-2);
        var v = monthly[k];
        var td = el('td', v == null ? 'is-blank' : F.upDown(v), v == null ? '' : F.pct(v, 1));
        if (v != null) {
          any = true; yr *= 1 + v;
          td.style.setProperty('--a', (0.12 + 0.6 * Math.min(1, Math.abs(v) / max)).toFixed(2));
        }
        tr.appendChild(td);
      });
      var tdY = el('td', 'bk-months__year ' + (any ? F.upDown(yr - 1) : ''), any ? F.pct(yr - 1, 1) : '');
      tr.appendChild(tdY);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    return wrap;
  }

  /* --- Tables ------------------------------------------------------------------ */
  function table(cols, rows, opts) {
    opts = opts || {};
    var wrap = scrollBox(opts.caption);
    var t = el('table', 'bk-table' + (opts.cls ? ' ' + opts.cls : ''));
    if (opts.caption) t.appendChild(el('caption', 'visually-hidden', opts.caption));
    var thead = el('thead'), hr = el('tr');
    cols.forEach(function (c) { var th = el('th', c.num ? 'num' : '', c.label); th.scope = 'col'; hr.appendChild(th); });
    thead.appendChild(hr); t.appendChild(thead);
    var tb = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr');
      cols.forEach(function (c, i) {
        var cell = el(i === 0 ? 'th' : 'td', c.num ? 'num' : '');
        if (i === 0) cell.scope = 'row';
        var v = c.cell(r);
        if (v instanceof Node) cell.appendChild(v); else cell.textContent = v == null ? '–' : v;
        if (c.cls) { var k = c.cls(r); if (k) cell.classList.add(k); }
        tr.appendChild(cell);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    return wrap;
  }
  // Tables that can scroll sideways must be reachable by keyboard, and named.
  function scrollBox(label) {
    var w = el('div', 'bk-scroll');
    w.tabIndex = 0;
    w.setAttribute('role', 'region');
    if (label) w.setAttribute('aria-label', label);
    return w;
  }
  function instrument(r) {
    var f = document.createDocumentFragment();
    f.appendChild(el('span', 'bk-sym', r.symbol));
    if (r.description && r.description !== r.symbol) f.appendChild(el('span', 'bk-desc', titleCase(r.description)));
    if (r.thesis) f.appendChild(el('span', 'bk-thesis', r.thesis));
    return f;
  }
  function titleCase(s) {
    if (s !== s.toUpperCase()) return s;
    return s.toLowerCase().replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); }).replace(/\b(Plc|Etf|Sa|Ag|Nv|Llc|Adr|Us|Uk)\b/g, function (m) { return m.toUpperCase(); }).replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(\d\d)\b/g, function (m) { return m.toUpperCase(); }).replace(/\bS&p\b/g, 'S&P');
  }
  function sideTag(s) { return el('span', 'bk-side bk-side--' + s.toLowerCase(), s); }
  function bookKey(color, name) {
    var f = el('span', 'bk-bookname');
    var k = el('span', 'bk-swatch'); k.style.background = color;
    f.appendChild(k);
    f.appendChild(el('span', null, name));
    return f;
  }

  /* --- Desk cards ---------------------------------------------------------------- */
  function deskCards(host, desks, current, onPick) {
    host.textContent = '';
    host.setAttribute('role', 'tablist');
    host.setAttribute('aria-label', 'Desks');
    var buttons = [];
    desks.forEach(function (d, i) {
      var b = el('button', 'bk-desk');
      b.type = 'button';
      b.id = 'desk-tab-' + d.id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'desk-panel');
      b.setAttribute('aria-selected', String(i === current));
      b.tabIndex = i === current ? 0 : -1;
      var top = el('span', 'bk-desk__top');
      top.appendChild(el('span', 'bk-desk__name', d.name));
      var nBooks = d.books.length;
      top.appendChild(el('span', 'bk-desk__books', nBooks ? nBooks + (nBooks === 1 ? ' book' : ' books') : 'Setting up'));
      b.appendChild(top);
      if (d.hasData) {
        var ret = el('span', 'bk-desk__ret ' + F.upDown(d.perf.total), F.pct(d.perf.total));
        b.appendChild(ret);
        b.appendChild(el('span', 'bk-desk__since', 'since ' + F.day(d.start)));
        var sp = el('span', 'bk-desk__spark');
        b.appendChild(sp);
        spark(sp, d.perf.cum);
        var dl = el('span', 'bk-desk__kpis');
        [['Sharpe', F.ratio(d.perf.sharpe)], ['Max DD', F.pct(d.perf.maxDrawdown, 1, false)], ['Win rate', d.stats.winRate == null ? '–' : Math.round(d.stats.winRate * 100) + '%']].forEach(function (k) {
          var s = el('span', 'bk-desk__kpi');
          s.appendChild(el('span', null, k[0]));
          s.appendChild(el('strong', null, k[1]));
          dl.appendChild(s);
        });
        b.appendChild(dl);
      } else {
        b.classList.add('bk-desk--empty');
        b.appendChild(el('span', 'bk-desk__wait', d.status || (nBooks ? 'Opens with the first export' : 'Book structure being decided')));
        if (d.books.length) b.appendChild(el('span', 'bk-desk__heads', d.books.map(function (bk) { return bk.head; }).join(', ')));
      }
      b.addEventListener('click', function () { onPick(i, false); });
      buttons.push(b);
      host.appendChild(b);
    });
    host.onkeydown = function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      var cur = buttons.findIndex(function (b) { return b.getAttribute('aria-selected') === 'true'; });
      var n = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (cur + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      onPick(n, true);
    };
    return buttons;
  }

  /* --- Figures: Returns / Risk / Trading ------------------------------------- */
  function figures(scope, cur) {
    var p = scope.perf, s = scope.stats;
    var riskNote = p.days < C.MIN_RISK_DAYS ? 'from ' + C.MIN_RISK_DAYS + ' days' : null;
    var groups = [
      ['Returns', [
        ['Return since inception', F.pct(p.total), 'g-return', F.upDown(p.total)],
        ['Profit and loss', F.money(p.pnl, cur, { signed: true }), 'g-pnl', F.upDown(p.pnl)],
        ['Annualised return', p.annualised == null ? 'after 6 months' : F.pct(p.annualised), 'g-annualised', p.annualised == null ? 'is-muted' : F.upDown(p.annualised)],
        ['Best day', F.pct(p.bestDay), 'g-days', F.upDown(p.bestDay)],
        ['Worst day', F.pct(p.worstDay), 'g-days', F.upDown(p.worstDay)],
        ['Days up', p.positiveDays == null ? '–' : Math.round(p.positiveDays * 100) + '% of ' + p.days, 'g-days']
      ]],
      ['Risk', [
        ['Sharpe ratio', riskNote || F.ratio(p.sharpe), 'g-sharpe', riskNote ? 'is-muted' : ''],
        ['Sortino ratio', riskNote || F.ratio(p.sortino), 'g-sortino', riskNote ? 'is-muted' : ''],
        ['Volatility, annualised', riskNote || F.pct(p.volatility, 1, false), 'g-vol', riskNote ? 'is-muted' : ''],
        ['Max drawdown', F.pct(p.maxDrawdown, 2, false), 'g-drawdown', p.maxDrawdown < 0 ? 'is-down' : ''],
        ['Drawdown now', F.pct(p.drawdownNow, 2, false), 'g-drawdown', p.drawdownNow < 0 ? 'is-down' : ''],
        ['Longest drawdown', p.longestDrawdown == null ? '–' : p.longestDrawdown + (p.longestDrawdown === 1 ? ' day' : ' days'), 'g-drawdown']
      ]],
      ['Trading', [
        ['Closed trades', s.trades + (s.executions ? ' · ' + s.executions + ' fills' : ''), 'g-trades'],
        ['Win rate', s.winRate == null ? '–' : Math.round(s.winRate * 100) + '%', 'g-winrate'],
        ['Profit factor', F.ratio(s.profitFactor), 'g-pf'],
        ['Expectancy per trade', s.expectancy == null ? '–' : F.money(s.expectancy, cur, { signed: true }), 'g-expectancy', F.upDown(s.expectancy)],
        ['Average win / loss', s.avgWin == null && s.avgLoss == null ? '–' : F.money(s.avgWin, cur) + ' / ' + F.money(s.avgLoss, cur), 'g-payoff'],
        ['Average hold', s.hold == null ? '–' : s.hold.toFixed(1) + ' days', 'g-hold']
      ]]
    ];
    var box = el('div', 'bk-figs');
    groups.forEach(function (g) {
      var col = el('div', 'bk-figs__col');
      col.appendChild(el('h4', 'bk-figs__title', g[0]));
      var dl = el('dl');
      g[1].forEach(function (f) {
        var row = el('div', 'bk-fig');
        var dt = el('dt');
        var a = el('a', null, f[0]);
        a.href = '/books/#' + f[2];
        dt.appendChild(a);
        row.appendChild(dt);
        row.appendChild(el('dd', f[3] || '', f[1]));
        dl.appendChild(row);
      });
      col.appendChild(dl);
      box.appendChild(col);
    });
    return box;
  }

  /* --- Exposure ---------------------------------------------------------------- */
  function exposureBlock(exp) {
    var box = el('div', 'bk-exp');
    var top = el('dl', 'bk-exp__figs');
    [['Gross exposure', F.pct(exp.gross, 0, false)], ['Net exposure', F.pct(exp.net, 0)], ['Long', F.pct(exp.long, 0, false)], ['Short', F.pct(exp.short, 0, false)], ['Largest position', F.pct(exp.largest, 1, false)], ['Positions', String(exp.rows.length)]]
      .forEach(function (f) { var d = el('div'); d.appendChild(el('dt', null, f[0])); d.appendChild(el('dd', null, f[1])); top.appendChild(d); });
    box.appendChild(top);
    if (exp.byAsset.length) {
      var max = Math.max.apply(null, exp.byAsset.map(function (a) { return Math.max(a.long, -a.short); })) || 1;
      var list = el('ul', 'bk-assets');
      list.setAttribute('aria-label', 'Exposure by asset class, as a share of capital');
      exp.byAsset.forEach(function (a) {
        var li = el('li');
        li.appendChild(el('span', 'bk-assets__name', a.name));
        var track = el('span', 'bk-assets__track');
        var s = el('span', 'bk-assets__short'); s.style.width = (-a.short / max * 50) + '%';
        var l = el('span', 'bk-assets__long'); l.style.width = (a.long / max * 50) + '%';
        track.appendChild(s); track.appendChild(l);
        track.setAttribute('aria-hidden', 'true');
        li.appendChild(track);
        li.appendChild(el('span', 'bk-assets__val', (a.short ? F.pct(a.short, 0, false) + ' short' : '') + (a.short && a.long ? ' · ' : '') + (a.long ? F.pct(a.long, 0, false) + ' long' : '')));
        list.appendChild(li);
      });
      box.appendChild(list);
    }
    return box;
  }

  /* --- The desk panel ---------------------------------------------------------- */
  function deskPanel(host, desk, opts) {
    opts = opts || {};
    host.textContent = '';
    var cur = desk.currency;
    var names = {}, colors = {};
    desk.books.forEach(function (b, i) { names[b.id] = b.name; colors[b.id] = slot(i); });
    var single = desk.books.length === 1;

    var head = el('header', 'bk-panel__head');
    var h = el('h2', 'bk-panel__title', opts.title || (desk.name + (single ? '' : ' desk')));
    h.id = 'desk-title';
    head.appendChild(h);
    var meta = [];
    if (desk.books.length > 1) meta.push(desk.books.length + ' books, one per division head');
    if (desk.start) meta.push('since ' + F.day(desk.start, true));
    if (desk.asOf) meta.push('marked to ' + F.day(desk.asOf, true));
    meta.push(cur);
    head.appendChild(el('p', 'bk-panel__meta', meta.join(' · ')));
    host.appendChild(head);

    if (!desk.hasData) {
      var empty = el('div', 'bk-waiting');
      empty.appendChild(el('p', 'bk-waiting__lead', desk.status || 'This desk opens with its first IBKR export.'));
      if (desk.books.length) {
        var ul = el('ul', 'bk-waiting__books');
        desk.books.forEach(function (b, i) { var li = el('li'); li.appendChild(bookKey(slot(i), b.name)); li.appendChild(el('span', null, 'not trading yet')); ul.appendChild(li); });
        empty.appendChild(ul);
      }
      host.appendChild(empty);
      return;
    }

    // The books: one row each, compared side by side. Not narrowed by the
    // chips below; choosing a book here does the same as its chip.
    var pick = function () {};
    if (!single) {
      var sec = section(host, 'The books', 'Each division head runs one IBKR paper account with their analysts. The desk adds them up by capital.');
      var maxAbs = Math.max.apply(null, desk.books.map(function (b) { return Math.abs(b.perf.pnl || 0); })) || 1;
      sec.appendChild(table([
        { label: 'Book', cell: function (b) {
          if (!b.hasData) return bookKey(colors[b.id], b.name);
          var btn = el('button', 'bk-booklink');
          btn.type = 'button';
          btn.appendChild(bookKey(colors[b.id], b.name));
          btn.addEventListener('click', function () { pick(b.id, true); });
          return btn;
        } },
        { label: 'Since start', cell: function (b) {
          if (!b.hasData) return el('span', 'is-muted', 'not trading yet');
          var sp = el('span', 'bk-rowspark');
          sp.setAttribute('aria-hidden', 'true');
          spark(sp, b.perf.cum, colors[b.id]);
          return sp;
        } },
        { label: 'Return', num: true, cell: function (b) { return b.hasData ? F.pct(b.perf.total) : '–'; }, cls: function (b) { return b.hasData ? F.upDown(b.perf.total) : 'is-muted'; } },
        { label: 'P&L', cell: function (b) {
          if (!b.hasData) return '';
          var w = el('span', 'bk-contrib');
          var track = el('span', 'bk-contrib__track'); track.setAttribute('aria-hidden', 'true');
          var fill = el('span', 'bk-contrib__fill ' + F.upDown(b.perf.pnl));
          fill.style.width = (Math.abs(b.perf.pnl || 0) / maxAbs * 50) + '%';
          track.appendChild(fill);
          w.appendChild(track);
          w.appendChild(el('span', 'bk-contrib__val ' + F.upDown(b.perf.pnl), F.money(b.perf.pnl, b.currency, { signed: true })));
          return w;
        } },
        { label: 'Sharpe', num: true, cell: function (b) { return b.hasData && b.perf.days >= C.MIN_RISK_DAYS ? F.ratio(b.perf.sharpe) : '–'; } },
        { label: 'Max drawdown', num: true, cell: function (b) { return b.hasData ? F.pct(b.perf.maxDrawdown, 2, false) : '–'; } },
        { label: 'Win rate', num: true, cell: function (b) { return b.stats.winRate == null ? '–' : Math.round(b.stats.winRate * 100) + '%'; } },
        { label: 'Trades', num: true, cell: function (b) { return String(b.stats.trades); } },
        { label: 'Open', num: true, cell: function (b) { return String(b.exposure.rows.length); } }
      ], desk.books, { caption: desk.name + ' books', cls: 'bk-table--books' }));
    }

    // Everything below the chips can be narrowed to one book.
    var filter = null;
    if (!single && desk.live.length > 1) {
      filter = el('div', 'bk-filter');
      filter.setAttribute('role', 'group');
      filter.setAttribute('aria-label', 'Show figures for');
      [{ id: 'all', name: 'Whole desk' }].concat(desk.live).forEach(function (b) {
        var btn = el('button', 'bk-chip');
        btn.type = 'button';
        btn.dataset.book = b.id;
        if (b.id !== 'all') { var sw = el('span', 'bk-swatch'); sw.style.background = colors[b.id]; btn.appendChild(sw); }
        btn.appendChild(document.createTextNode(b.name));
        btn.addEventListener('click', function () { pick(b.id, false); });
        filter.appendChild(btn);
      });
      host.appendChild(filter);
    }
    var scopeHost = el('div', 'bk-scope');
    host.appendChild(scopeHost);
    pick = function (id, scroll) {
      if (filter) Array.prototype.forEach.call(filter.children, function (c) { c.setAttribute('aria-pressed', String(c.dataset.book === id)); });
      renderScope(id);
      if (opts.onBook) opts.onBook(id);
      if (scroll && filter) filter.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
    };

    function renderScope(id) {
      scopeHost.textContent = '';
      if (!REDUCED && scopeHost.dataset.shown && scopeHost.animate) scopeHost.animate([{ opacity: 0.45 }, { opacity: 1 }], { duration: 180, easing: EASE });
      scopeHost.dataset.shown = '1';
      var scope = id === 'all' ? desk : desk.live.filter(function (b) { return b.id === id; })[0] || desk;
      var isBook = scope !== desk;
      var label = !isBook ? (single ? '' : 'the whole desk') : scope.name;

      // Headline figures and the chart. A chosen book is drawn against the
      // whole desk, so it can be read in context.
      var top = el('div', 'bk-top');
      var hero = el('div', 'bk-hero');
      hero.appendChild(el('p', 'bk-hero__label', (isBook ? scope.name + ', return' : 'Return') + ' since ' + F.day(scope.start)));
      hero.appendChild(el('p', 'bk-hero__value ' + F.upDown(scope.perf.total), F.pct(scope.perf.total)));
      var heroFigs = el('dl', 'bk-hero__figs');
      [['P&L', F.money(scope.perf.pnl, cur, { signed: true }), F.upDown(scope.perf.pnl)], ['Capital', F.money(scope.capital, cur, { compact: true })], ['Sharpe', scope.perf.days < C.MIN_RISK_DAYS ? '–' : F.ratio(scope.perf.sharpe)], ['Max drawdown', F.pct(scope.perf.maxDrawdown, 2, false)]].forEach(function (f) {
        var d = el('div'); d.appendChild(el('dt', null, f[0])); d.appendChild(el('dd', f[2] || '', f[1])); heroFigs.appendChild(d);
      });
      hero.appendChild(heroFigs);
      top.appendChild(hero);

      var chartBox = el('div', 'bk-perf');
      var deskLabel = single ? desk.books[0].name : desk.name + ' desk';
      var series = isBook
        ? [{ id: scope.id, label: scope.name, color: colors[scope.id], emphasis: true, points: scope.perf.cum },
           { id: 'desk', label: deskLabel, color: 'var(--text-primary)', points: desk.perf.cum, reference: true }]
        : [{ id: 'desk', label: deskLabel, color: 'var(--text-primary)', emphasis: true, points: desk.perf.cum }];
      var legend = el('ul', 'bk-legend');
      series.forEach(function (s) {
        var li = el('li');
        var k = el('span', 'bk-legend__key' + (s.emphasis ? ' is-main' : '')); k.style.background = s.color;
        li.appendChild(k);
        li.appendChild(el('span', null, s.label));
        var last = s.points[s.points.length - 1];
        li.appendChild(el('strong', F.upDown(last[1]), F.pct(last[1])));
        legend.appendChild(li);
      });
      chartBox.appendChild(legend);
      perfChart(chartBox, { series: series, dd: scope.perf.dd, label: (isBook ? scope.name : deskLabel) + ': ' + F.pct(scope.perf.total) + ' since ' + F.day(scope.start, true) + ', maximum drawdown ' + F.pct(scope.perf.maxDrawdown, 2, false) + '. Use the arrow keys to read each day.' });
      top.appendChild(chartBox);
      scopeHost.appendChild(top);

      var s1 = section(scopeHost, 'Key figures', label ? 'For ' + label + '. Every figure is defined at the foot of the page.' : 'Every figure is defined at the foot of the page.');
      s1.appendChild(figures(scope, cur));

      var s2 = section(scopeHost, 'Monthly returns', 'Compounded from daily returns.');
      s2.appendChild(monthlyTable(scope.perf.monthly));

      var exp = id === 'all' ? desk.exposure : scope.exposure;
      var asOf = id === 'all' ? desk.asOf : scope.asOf;
      var s3 = section(scopeHost, 'Open positions', exp.rows.length ? 'Marked at IBKR’s closing prices on ' + F.day(asOf, true) + '. Exposure is position value as a share of capital.' : 'No open positions on ' + F.day(asOf, true) + '.');
      if (exp.rows.length) {
        s3.appendChild(exposureBlock(exp));
        var pcols = [
          { label: 'Instrument', cell: instrument },
          { label: 'Side', cell: function (r) { return sideTag(r.side); } }
        ];
        if (!single && id === 'all') pcols.push({ label: 'Book', cell: function (r) { return bookKey(colors[r.book], names[r.book] || ''); } });
        pcols = pcols.concat([
          { label: 'Opened', cell: function (r) { return r.opened ? F.day(r.opened) : '–'; } },
          { label: 'Quantity', num: true, cell: function (r) { return F.qty(r.quantity); } },
          { label: 'Cost', num: true, cell: function (r) { return F.price(r.cost); } },
          { label: 'Mark', num: true, cell: function (r) { return F.price(r.mark); } },
          { label: '% of capital', num: true, cell: function (r) { return F.pct(Math.abs(r.pctNav), 1, false); } },
          { label: 'Unrealised P&L', num: true, cell: function (r) { return F.money(r.unrealized, cur, { signed: true }); }, cls: function (r) { return F.upDown(r.unrealized); } }
        ]);
        s3.appendChild(table(pcols, exp.rows, { caption: 'Open positions' }));
      }

      var closed = scope.closed.slice();
      var s4 = section(scopeHost, 'Closed trades', closed.length ? 'Each bar is one trade, from the first fill to flat, in the order it closed.' : 'No closed trades yet.');
      if (closed.length) {
        tape(s4, closed, cur, single ? null : names);
        var newest = closed.slice().reverse();
        var tcols = [
          { label: 'Instrument', cell: instrument },
          { label: 'Side', cell: function (r) { return sideTag(r.side); } }
        ];
        if (!single && id === 'all') tcols.push({ label: 'Book', cell: function (r) { return bookKey(colors[r.book], names[r.book] || ''); } });
        tcols = tcols.concat([
          { label: 'Analyst', cell: function (r) { return r.analyst || '–'; } },
          { label: 'Opened', cell: function (r) { return r.opened ? F.day(r.opened) : 'before export'; } },
          { label: 'Closed', cell: function (r) { return F.day(r.closed); } },
          { label: 'Entry', num: true, cell: function (r) { return F.price(r.entry); } },
          { label: 'Exit', num: true, cell: function (r) { return F.price(r.exit); } },
          { label: 'P&L', num: true, cell: function (r) { return F.money(r.pnl, cur, { signed: true }); }, cls: function (r) { return F.upDown(r.pnl); } },
          { label: 'Return', num: true, cell: function (r) { return F.pct(r.ret); }, cls: function (r) { return F.upDown(r.ret); } }
        ]);
        var LIMIT = 12;
        var tWrap = el('div');
        s4.appendChild(tWrap);
        var showAll = false;
        var draw = function () {
          tWrap.textContent = '';
          tWrap.appendChild(table(tcols, showAll ? newest : newest.slice(0, LIMIT), { caption: 'Closed trades, newest first' }));
          if (newest.length > LIMIT) {
            var more = el('button', 'bk-more', showAll ? 'Show the latest ' + LIMIT : 'Show all ' + newest.length + ' trades');
            more.type = 'button';
            more.addEventListener('click', function () { showAll = !showAll; draw(); });
            tWrap.appendChild(more);
          }
        };
        draw();
      }
    }
    pick(opts.book && desk.live.some(function (b) { return b.id === opts.book; }) ? opts.book : 'all', false);
  }

  function section(host, title, note) {
    var s = el('section', 'bk-sec');
    var h = el('div', 'bk-sec__head');
    h.appendChild(el('h3', null, title));
    if (note) h.appendChild(el('p', null, note));
    s.appendChild(h);
    host.appendChild(s);
    return s;
  }

  root.BooksUI = { deskCards: deskCards, deskPanel: deskPanel, perfChart: perfChart, el: el, slot: slot };
})(window);
