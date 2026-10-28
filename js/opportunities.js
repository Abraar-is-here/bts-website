/* Opportunities: shows the menu and footer links only while at least one role
   is open, and on /opportunities/ hides closed roles (and a firm with none
   left), falling back to an empty state. The list of roles and whether each
   is open lives in opportunities/roles.json, kept current by a daily check
   (scripts/check_opportunities.py). If the file cannot be read, links stay
   hidden and the page shows its roles as written. */
(function () {
  var links = document.querySelectorAll('[data-opps]');
  var rows = document.querySelectorAll('[data-role-url]');
  if (!links.length && !rows.length) return;
  if (!window.fetch) return;

  fetch('/opportunities/roles.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      var open = {};
      var any = false;
      (data.roles || []).forEach(function (role) {
        if (role.open) { open[role.url] = true; any = true; }
      });

      links.forEach(function (el) { el.hidden = !any; });

      if (!rows.length) return;
      rows.forEach(function (row) { row.hidden = !open[row.getAttribute('data-role-url')]; });
      document.querySelectorAll('[data-opps-firm]').forEach(function (firm) {
        firm.hidden = !firm.querySelector('[data-role-url]:not([hidden])');
      });
      var empty = document.querySelector('[data-opps-empty]');
      if (empty) empty.hidden = any;
    })
    .catch(function () { /* leave the page as written */ });
})();
