/* ===========================================================================
   analysts.js: the analyst lists on /team/.

   Reads team/analysts.json. Each head's analysts are placed under that head's
   card but stay closed; one quiet "Analysts" control under each division's row
   of heads opens or closes them all together. A division with no names listed
   gets no control, so the page is unchanged until names are added. Names are
   added as plain text (never as HTML).
   ========================================================================== */
(function () {
  'use strict';

  var groups = document.querySelectorAll('.div-group');
  if (!groups.length) return;

  function nameOf(card) {
    var n = card.querySelector('.team-card__name');
    return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  fetch('team/analysts.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data) return;
      var byHead = {};
      Object.keys(data).forEach(function (div) {
        if (!Array.isArray(data[div])) return;
        data[div].forEach(function (h) { if (h.head && h.names && h.names.length) byHead[h.head] = h.names; });
      });

      Array.prototype.forEach.call(groups, function (group, gi) {
        var row = group.querySelector('.team__tier-cards');
        var lists = [];
        Array.prototype.forEach.call(group.querySelectorAll('.team-card'), function (card, ci) {
          var names = byHead[nameOf(card)];
          if (!names) return;
          var col = document.createElement('div');
          col.className = 'head-col';
          card.parentNode.insertBefore(col, card);
          col.appendChild(card);
          var ul = document.createElement('ul');
          ul.className = 'analysts__list';
          ul.id = 'analysts-' + gi + '-' + ci;
          ul.hidden = true;
          ul.setAttribute('aria-label', nameOf(card) + '’s analysts');
          names.forEach(function (n) {
            var li = document.createElement('li');
            li.textContent = n;
            ul.appendChild(li);
          });
          col.appendChild(ul);
          lists.push(ul);
        });
        if (!lists.length || !row) return;

        var link = group.querySelector('.div-group__name a');
        var division = link ? link.firstChild.textContent : '';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'analysts__toggle';
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', lists.map(function (l) { return l.id; }).join(' '));
        var hidden = document.createElement('span');
        hidden.className = 'visually-hidden';
        hidden.textContent = division + ' ';
        btn.appendChild(hidden);
        btn.appendChild(document.createTextNode('Analysts'));
        btn.addEventListener('click', function () {
          var open = btn.getAttribute('aria-expanded') !== 'true';
          btn.setAttribute('aria-expanded', String(open));
          lists.forEach(function (l) { l.hidden = !open; });
        });
        row.parentNode.insertBefore(btn, row.nextSibling);
      });
    })
    .catch(function () { /* no lists: the page is as it was */ });
})();
