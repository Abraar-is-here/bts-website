/* ===========================================================================
   market-clocks.js — the clock strip at the top of /books/.

   Three markets, west to east, each with its local time to the second and
   whether its main exchange is in session (with Hong Kong's lunch break).
   When each next opens or closes is given in UK time. Times come from the
   browser's time-zone database, so summer time moves on its own. Exchange holidays aren't known here: on a holiday a
   market shows as open during its usual hours.

   The time comes from window.BTSClock (js/promo.js) when it is there, which
   corrects a device clock that is off by more than a couple of seconds.
   ========================================================================== */
(function () {
  'use strict';

  var host = document.querySelector('[data-clocks]');
  if (!host || !window.Intl) return;

  // Sessions in minutes after local midnight, Monday to Friday.
  var MARKETS = [
    { city: 'New York', exchange: 'NYSE', tz: 'America/New_York', sessions: [[570, 960]] },
    { city: 'London', exchange: 'LSE', tz: 'Europe/London', sessions: [[480, 990]] },
    { city: 'Hong Kong', exchange: 'HKEX', tz: 'Asia/Hong_Kong', sessions: [[570, 720], [780, 960]] }
  ];
  var DAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

  function now() { return window.BTSClock ? window.BTSClock.now() : Date.now(); }

  // Where a market is in its day: open, at lunch or closed, and when that
  // next changes, as local minutes plus how many days ahead.
  function status(mk, wd, mins) {
    var weekday = wd >= 1 && wd <= 5;
    var s = mk.sessions;
    if (weekday) {
      for (var i = 0; i < s.length; i++) {
        if (mins >= s[i][0] && mins < s[i][1]) return { open: true, text: 'Open', verb: 'closes', at: s[i][1], days: 0 };
        if (i && mins >= s[i - 1][1] && mins < s[i][0]) return { open: false, lunch: true, text: 'Lunch', verb: 'reopens', at: s[i][0], days: 0 };
      }
      if (mins < s[0][0]) return { open: false, text: 'Closed', verb: 'opens', at: s[0][0], days: 0 };
    }
    // Otherwise the next open is the next weekday's: Friday evening and the
    // weekend roll on to Monday.
    var days = wd === 5 ? 3 : wd === 6 ? 2 : 1;
    return { open: false, text: 'Closed', verb: 'opens', at: s[0][0], days: days };
  }

  // The next change is shown in UK time (GMT, or BST in summer), with the day
  // when it isn't today in the UK.
  var UK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' });
  function ukParts(t) {
    var o = {};
    UK.formatToParts(t).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  function inUK(t, st, mins, secs) {
    var at = t + ((st.days * 1440 + st.at - mins) * 60 - secs) * 1000;
    var a = ukParts(at), today = ukParts(t);
    // Browsers name the zone "GMT", "GMT+0", "BST" or "GMT+1"; say GMT or BST.
    var zone = /\+1|BST/.test(a.timeZoneName) ? 'BST' : 'GMT';
    return (a.weekday !== today.weekday ? a.weekday + ' ' : '') + a.hour + ':' + a.minute + ' ' + zone;
  }

  var clocks = MARKETS.map(function (mk) {
    mk.fmt = new Intl.DateTimeFormat('en-GB', { timeZone: mk.tz, weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    var box = document.createElement('div');
    box.className = 'bk-clock';
    var head = document.createElement('p');
    head.className = 'bk-clock__city';
    head.textContent = mk.city;
    var ex = document.createElement('span');
    ex.className = 'bk-clock__ex';
    ex.textContent = mk.exchange;
    head.appendChild(ex);
    var time = document.createElement('p');
    time.className = 'bk-clock__time';
    var st = document.createElement('p');
    st.className = 'bk-clock__status';
    var dot = document.createElement('span');
    dot.className = 'bk-clock__dot';
    dot.setAttribute('aria-hidden', 'true');
    var stText = document.createElement('span');
    st.appendChild(dot);
    st.appendChild(stText);
    box.appendChild(head);
    box.appendChild(time);
    box.appendChild(st);
    host.appendChild(box);
    return { mk: mk, box: box, time: time, stText: stText, last: '' };
  });
  host.hidden = false;

  function tick() {
    var t = now();
    clocks.forEach(function (c) {
      var parts = {};
      c.mk.fmt.formatToParts(t).forEach(function (p) { parts[p.type] = p.value; });
      c.time.textContent = parts.hour + ':' + parts.minute + ':' + parts.second;
      var mins = +parts.hour * 60 + +parts.minute;
      var st = status(c.mk, DAYS[parts.weekday], mins);
      var label = st.text + ' · ' + st.verb + ' ' + inUK(t, st, mins, +parts.second);
      if (label !== c.last) {
        c.last = label;
        c.stText.textContent = label;
        c.box.classList.toggle('is-open', st.open);
        c.box.classList.toggle('is-lunch', !!st.lunch);
      }
    });
    setTimeout(tick, 1000 - (now() % 1000) + 5);
  }
  tick();
})();
