/* ===========================================================================
   market-clocks.js — the clock strip at the top of /books/.

   Six markets, west to east, each with its local time to the second and
   whether its main exchange is in session (with Hong Kong's and Tokyo's
   lunch breaks). Times come from the browser's time-zone database, so summer
   time moves on its own. Exchange holidays aren't known here: on a holiday a
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
    { city: 'Frankfurt', exchange: 'Xetra', tz: 'Europe/Berlin', sessions: [[540, 1050]] },
    { city: 'Hong Kong', exchange: 'HKEX', tz: 'Asia/Hong_Kong', sessions: [[570, 720], [780, 960]] },
    { city: 'Tokyo', exchange: 'TSE', tz: 'Asia/Tokyo', sessions: [[540, 690], [750, 930]] },
    { city: 'Sydney', exchange: 'ASX', tz: 'Australia/Sydney', sessions: [[600, 960]] }
  ];
  var DAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

  function now() { return window.BTSClock ? window.BTSClock.now() : Date.now(); }
  function hhmm(m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }

  // Where a market is in its day: open, at lunch or closed, and the next change.
  function status(mk, wd, mins) {
    var weekday = wd >= 1 && wd <= 5;
    var s = mk.sessions;
    if (weekday) {
      for (var i = 0; i < s.length; i++) {
        if (mins >= s[i][0] && mins < s[i][1]) return { open: true, text: 'Open', next: 'closes ' + hhmm(s[i][1]) };
        if (i && mins >= s[i - 1][1] && mins < s[i][0]) return { open: false, lunch: true, text: 'Lunch', next: 'reopens ' + hhmm(s[i][0]) };
      }
      if (mins < s[0][0]) return { open: false, text: 'Closed', next: 'opens ' + hhmm(s[0][0]) };
    }
    // After Friday's close and on Saturday the next open is Monday's; any
    // other evening (or Sunday) it is tomorrow's, so the time alone says it.
    var day = wd === 5 || wd === 6 ? 'Mon ' : '';
    return { open: false, text: 'Closed', next: 'opens ' + day + hhmm(s[0][0]) };
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
      var st = status(c.mk, DAYS[parts.weekday], +parts.hour * 60 + +parts.minute);
      var label = st.text + ' · ' + st.next;
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
