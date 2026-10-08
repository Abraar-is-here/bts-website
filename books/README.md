# The books (`/books/`)

Each division head runs one IBKR paper-trading account with their analysts. `/books/` shows
every book and every desk: returns, risk, positions and each trade, all worked out in the
browser from IBKR's own statements.

## How data gets here

1. **The head exports a Flex Query** from IBKR (XML). The one-time set-up is spelled out
   step by step on `/books/import/`.
2. **They drop it on `/books/import/`.** The page loads their published file, adds the new
   export to it, shows a full preview with any problems flagged, lets them write a one-line
   note per trade, and gives them `books/data/<book-id>.json`. Nothing is uploaded: it all
   runs in their browser.
3. **They send that file to the web team**, or upload it to `books/data/` on GitHub if they
   have access. Commit it and the site updates.

Do this weekly. **IBKR only keeps about 45 days of statements for paper accounts**, so a
gap longer than that loses history for good. The importer warns when an export starts after
the last published day.

## Files

| File | What it is |
|---|---|
| `books/data/index.json` | The desks, their books and whose each book is. Edit by hand when a book is added, renamed or retired. A book with no data file shows as "not trading yet". |
| `books/data/<book-id>.json` | One book: daily NAV, deposits, every fill, the latest positions, trade notes. Written by the importer; don't edit by hand. |
| `js/books-flex.js` | Reads IBKR Flex exports (XML or CSV) and merges them into a book file. Also generates the sample export. |
| `js/books-core.js` | All the maths: time-weighted returns, Sharpe, drawdown, round-trip trades, exposure, desk totals. |
| `js/books-ui.js` | Draws the desk cards, charts and tables. |
| `js/books-page.js`, `js/books-import.js` | Start-up for the two pages. |

**Privacy.** The importer never stores the IBKR account number, only a short one-way hash
so it can warn if a later export comes from a different account. Leave Account Information
out of the Flex Query and no name or address is ever in the export.

## Adding Quant (or any new book)

Add the book to `books/data/index.json`:

```json
{ "id": "quant-kometh", "head": "Kometh Tauch" }
```

Remove `"status"` from the desk once it has books. The head then picks it on the import page.

## Going live

The page is `noindex` and not in the nav until the first real exports are in. When they are:

1. Delete the `<meta name="robots" content="noindex" />` line in `books/index.html`.
2. Add `/books/` to the nav on every page and to `sitemap.xml`.
3. Keep `/books/import/` noindex and out of the nav.

`/books/?demo=1` shows the whole page with invented sample data (clearly labelled), for
showing the format before real data exists.

## Automating it later

IBKR's **Flex Web Service** lets a script fetch a Flex Query with a token instead of someone
downloading it. A scheduled GitHub Action could fetch each book nightly, run it through
`books-flex.js`'s merge and commit the result, with the tokens kept as GitHub secrets.
IBKR's documentation suggests some Flex Web Service features aren't available on paper
accounts, so test it first: log into a paper account, go to Settings and look for
**Flex Web Service**. If it's there, generate a token and try it.

**Live prices aren't shown on purpose.** IBKR's market data is licensed for the account
holder's own use; republishing it on a public site isn't allowed under a non-professional
subscription. The books use IBKR's end-of-day closing marks from the statement instead.
