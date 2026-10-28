"""Marks partner roles closed once their listing is gone.

Reads opportunities/roles.json, requests each open role's URL, and sets
"open": false when the listing returns 404 or 410 (ICE's careers site does
this when a job closes). Other errors leave the role as it is, so a site
outage never hides live roles. Run daily by
.github/workflows/check-opportunities.yml; the workflow commits any change.
"""
import json
import pathlib
import urllib.error
import urllib.request

PATH = pathlib.Path(__file__).resolve().parent.parent / 'opportunities' / 'roles.json'
GONE = {404, 410}


def status(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (BTS opportunities check)'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return None


def main():
    data = json.loads(PATH.read_text(encoding='utf-8'))
    changed = False
    for role in data['roles']:
        if not role.get('open'):
            continue
        code = status(role['url'])
        print(code, role['title'], role['url'])
        if code in GONE:
            role['open'] = False
            changed = True
    if changed:
        PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        print('updated roles.json')


if __name__ == '__main__':
    main()
