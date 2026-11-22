"""Writes books/data/benchmarks.json: a daily level for each benchmark a book
is measured against on /books/ (see "benchmark" on each book in
books/data/index.json).

Prices are Yahoo Finance daily closes. Each benchmark is stored as a plain
level series; the page rebases it to each book's own start date, so a book
and its benchmark are always compared over the same days.

  metals  Gold and silver futures, 50/50 rebalanced daily, in GBP
  gilts   iShares Core UK Gilts (IGLT), price
  em      iShares Core MSCI EM IMI (EMIM), accumulating, in GBP

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


def closes(symbol):
    """{ 'YYYY-MM-DD': close } in the exchange's own calendar."""
    p1 = int(dt.datetime(START.year, START.month, START.day, tzinfo=dt.timezone.utc).timestamp())
    p2 = int(dt.datetime.now(dt.timezone.utc).timestamp())
    url = ('https://query1.finance.yahoo.com/v8/finance/chart/%s?period1=%d&period2=%d&interval=1d'
           % (urllib.parse.quote(symbol), p1, p2))
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (BTS benchmarks)'})
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.load(r)['chart']['result'][0]
    off = res['meta'].get('gmtoffset', 0)
    out = {}
    for t, c in zip(res.get('timestamp', []), res['indicators']['quote'][0]['close']):
        day = dt.datetime.fromtimestamp(t + off, dt.timezone.utc).date()
        # Skip weekend stamps: Yahoo's live quote while markets are shut.
        if c is not None and day.weekday() < 5:
            out[day.isoformat()] = c
    return out


def series(levels):
    return [[d, round(levels[d], 6)] for d in sorted(levels)]


def metals():
    gold, silver, fx = closes('GC=F'), closes('SI=F'), closes('GBPUSD=X')
    days = sorted(set(gold) & set(silver))
    fx_days = sorted(fx)
    def fx_on(d):
        best = None
        for f in fx_days:
            if f <= d:
                best = fx[f]
            else:
                break
        return best
    level, out, prev = 100.0, {}, None
    for d in days:
        rate = fx_on(d)
        if rate is None:
            continue
        g, s = gold[d] / rate, silver[d] / rate
        if prev:
            level *= 1 + 0.5 * (g / prev[0] - 1) + 0.5 * (s / prev[1] - 1)
        out[d] = level
        prev = (g, s)
    return out


BENCHMARKS = {
    'metals': ('Gold & silver, 50/50 (GBP)', metals),
    'gilts': ('UK gilts (iShares IGLT)', lambda: closes('IGLT.L')),
    'em': ('MSCI Emerging Markets (iShares EMIM)', lambda: closes('EMIM.L')),
}


def main():
    try:
        data = json.loads(PATH.read_text(encoding='utf-8'))
    except FileNotFoundError:
        data = {'benchmarks': {}}
    data['note'] = ('Daily benchmark levels for /books/, written by scripts/update_benchmarks.py '
                    '(Yahoo Finance closes). Books pick one with "benchmark" in index.json.')
    for key, (name, fetch) in BENCHMARKS.items():
        try:
            levels = fetch()
            if levels:
                data['benchmarks'][key] = {'name': name, 'series': series(levels)}
                print(key, len(levels), max(levels))
        except Exception as e:  # keep the last good series
            print('failed', key, e)
    data['updated'] = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    PATH.write_text(json.dumps(data, indent=1) + '\n', encoding='utf-8')


if __name__ == '__main__':
    import urllib.parse  # noqa: E402 (used in closes)
    main()
