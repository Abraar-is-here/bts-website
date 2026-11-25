"""Writes books/data/benchmarks.json: a daily level for each benchmark a book
is measured against on /books/ (see "benchmark" on each book in
books/data/index.json).

Every benchmark is total return, so it earns what a book earns on the same
money: income and interest included. Each is stored as a plain level series;
the page rebases it to each book's own start date, so a book and its
benchmark are always compared over the same days.

  cash    SONIA (Bank of England), compounded daily: the cash rate the Floor
          subtracts before working out Sharpe and Sortino ratios
  metals  Gold, silver, copper and aluminium futures, 25% each rebalanced
          daily, in GBP, plus cash interest on the collateral (futures are
          bought on margin, so a fully funded position also earns the cash
          rate). Precious and industrial, as the Metals desk covers both.
  gilts   iShares Core UK Gilts (IGLT), with coupons reinvested
  em      iShares Core MSCI EM IMI (EMIM), accumulating, in GBP
  spx     S&P 500 total return (dividends reinvested), in USD: for books
          whose IBKR account is in dollars. usd_in_gbp() restates a dollar
          series in pounds for a sterling book, should one need it.
  usd     US Dollar Index (DXY): the dollar against six major currencies,
          the yardstick for a G10-against-the-dollar FX desk

Prices are Yahoo Finance daily closes (dividend-adjusted where it matters).

Run daily by .github/workflows/update-benchmarks.yml; run it by hand with
`python scripts/update_benchmarks.py`. A benchmark that fails to download
keeps its previous series, so an outage never blanks the page.
"""
import datetime as dt
import json
import pathlib
import urllib.request

PATH = pathlib.Path(__file__).resolve().parent.parent / 'books' / 'data' / 'benchmarks.json'
START = dt.date(2026, 9, 1)


def closes(symbol, adjusted=False):
    """{ 'YYYY-MM-DD': close } in the exchange's own calendar; adjusted gives
    the dividend-adjusted close (total return)."""
    p1 = int(dt.datetime(START.year, START.month, START.day, tzinfo=dt.timezone.utc).timestamp())
    p2 = int(dt.datetime.now(dt.timezone.utc).timestamp())
    url = ('https://query1.finance.yahoo.com/v8/finance/chart/%s?period1=%d&period2=%d&interval=1d'
           % (urllib.parse.quote(symbol), p1, p2))
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (BTS benchmarks)'})
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.load(r)['chart']['result'][0]
    off = res['meta'].get('gmtoffset', 0)
    out = {}
    px = res['indicators']['adjclose'][0]['adjclose'] if adjusted else res['indicators']['quote'][0]['close']
    for t, c in zip(res.get('timestamp', []), px):
        day = dt.datetime.fromtimestamp(t + off, dt.timezone.utc).date()
        # Skip weekend stamps: Yahoo's live quote while markets are shut.
        if c is not None and day.weekday() < 5:
            out[day.isoformat()] = c
    return out


def sonia():
    """{ 'YYYY-MM-DD': rate in % } from the Bank of England's database."""
    url = ('https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes'
           '&Datefrom=%s&Dateto=now&SeriesCodes=IUDSOIA&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N'
           % START.strftime('%d/%b/%Y'))
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (BTS benchmarks)'})
    with urllib.request.urlopen(req, timeout=30) as r:
        rows = r.read().decode('utf-8').strip().splitlines()[1:]
    out = {}
    for row in rows:
        d, v = row.split(',')
        out[dt.datetime.strptime(d.strip(), '%d %b %Y').date().isoformat()] = float(v)
    return out


def cash_index(until):
    """Daily-compounded SONIA (act/365) as a level from 100, on every weekday
    up to `until`. The latest published rate carries forward (SONIA is
    published a day late)."""
    rates = sonia()
    day, end = min(dt.date.fromisoformat(d) for d in rates), dt.date.fromisoformat(until)
    level, rate, out = 100.0, None, {}
    while day <= end:
        if rate is not None:
            level *= 1 + rate / 100 / 365
        rate = rates.get(day.isoformat(), rate)
        if day.weekday() < 5:
            out[day.isoformat()] = level
        day += dt.timedelta(days=1)
    return out


CASH = {}


def series(levels):
    return [[d, round(levels[d], 6)] for d in sorted(levels)]


METALS = ['GC=F', 'SI=F', 'HG=F', 'ALI=F']  # gold, silver, copper, aluminium


def metals():
    px = [closes(t) for t in METALS]
    fx = closes('GBPUSD=X')
    days = sorted(set.intersection(*[set(p) for p in px]))
    fx_days = sorted(fx)

    def fx_on(d):
        best = None
        for f in fx_days:
            if f <= d:
                best = fx[f]
            else:
                break
        return best
    w = 1.0 / len(METALS)
    level, out, prev, prev_day = 100.0, {}, None, None
    for d in days:
        rate = fx_on(d)
        if rate is None:
            continue
        now = [p[d] / rate for p in px]
        if prev and d in CASH and prev_day in CASH:
            cash = CASH[d] / CASH[prev_day] - 1
            level *= 1 + sum(w * (n / o - 1) for n, o in zip(now, prev)) + cash
        out[d] = level
        prev, prev_day = now, d
    return out


def usd_in_gbp(symbol):
    """A dollar series restated in pounds at each day's GBPUSD close (the
    latest earlier rate where one is missing)."""
    px, fx = closes(symbol), closes('GBPUSD=X')
    fx_days, out, k, rate = sorted(fx), {}, 0, None
    for d in sorted(px):
        while k < len(fx_days) and fx_days[k] <= d:
            rate = fx[fx_days[k]]
            k += 1
        if rate:
            out[d] = px[d] / rate
    return out


BENCHMARKS = {
    'cash': ('Cash (SONIA)', lambda: CASH),
    'metals': ('Metals: gold, silver, copper, aluminium (GBP)', metals),
    'gilts': ('UK gilts (iShares IGLT)', lambda: closes('IGLT.L', adjusted=True)),
    'em': ('MSCI Emerging Markets (iShares EMIM)', lambda: closes('EMIM.L')),
    'usd': ('US Dollar Index (DXY)', lambda: closes('DX-Y.NYB')),
    'spx': ('S&P 500 (total return, USD)', lambda: closes('^SP500TR')),
}


def main():
    try:
        data = json.loads(PATH.read_text(encoding='utf-8'))
    except FileNotFoundError:
        data = {'benchmarks': {}}
    data['note'] = ('Daily benchmark levels for /books/, written by scripts/update_benchmarks.py '
                    '(Yahoo Finance closes). Books pick one with "benchmark" in index.json.')
    try:
        CASH.update(cash_index(dt.date.today().isoformat()))
    except Exception as e:  # metals then falls back to its last good series
        print('failed cash', e)
    for key, (name, fetch) in BENCHMARKS.items():
        try:
            levels = fetch()
            if levels and (key != 'metals' or CASH):
                data['benchmarks'][key] = {'name': name, 'series': series(levels)}
                print(key, len(levels), max(levels))
        except Exception as e:  # keep the last good series
            print('failed', key, e)
    data['updated'] = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    PATH.write_text(json.dumps(data, indent=1) + '\n', encoding='utf-8')


if __name__ == '__main__':
    import urllib.parse  # noqa: E402 (used in closes)
    main()
