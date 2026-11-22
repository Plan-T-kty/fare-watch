#!/usr/bin/env python3
"""Builds the two airport lists the app uses.

  airports.js   every airport with scheduled flights and an IATA code that has no Korean name here
  core.js       the list of places with a Korean name, between the AIRPORTS markers (from tools/curated.py)

Usage:  python3 tools/build-airports.py path/to/airports.csv
Data:   OurAirports, https://ourairports.com/data/ (public domain). Download airports.csv from there.
"""
import csv
import json
import os
import re
import runpy
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def clean(text):
    return re.sub(r'\s+', ' ', text.replace('|', ' ')).strip()


def city_of(row):
    """The city an airport serves: the part of 'municipality' before any bracket, slash or comma."""
    city = re.split(r'\s*[(/,]', row['municipality'].strip())[0].strip()
    if not city:
        city = re.sub(r'\s*(International|Intl\.?|Regional|Municipal|Domestic)?\s*Air(port|field|strip)\b.*$', '', row['name']).strip() or row['name'].strip()
    return clean(city)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    curated = runpy.run_path(os.path.join(HERE, 'curated.py'))
    rows, city_codes = curated['ROWS'], curated['CITY_CODES']
    named = {r[0] for r in rows}
    if len(named) != len(rows):
        sys.exit('curated.py lists a code twice')

    with open(sys.argv[1], encoding='utf-8', newline='') as f:
        data = [r for r in csv.DictReader(f)
                if r['iata_code'].strip() and r['scheduled_service'] == 'yes' and r['type'].endswith('_airport')]
    by_code = {r['iata_code'].strip(): r for r in data}

    # every named airport must exist, in the country the list says
    problems = []
    for code, ko, _sub, _en, iso, _keys in rows:
        if code in city_codes:
            continue
        hit = by_code.get(code)
        if not hit:
            problems.append(f'{code} {ko}: not an airport with scheduled flights')
        elif hit['iso_country'] != iso:
            problems.append(f'{code} {ko}: country is {hit["iso_country"]}, the list says {iso}')
    if problems:
        sys.exit('curated.py does not match the airport data:\n  ' + '\n  '.join(problems))

    size = {'large_airport': 'L', 'medium_airport': 'M', 'small_airport': 'S'}
    lines = []
    for code in sorted(by_code, key=lambda c: ('LMS'.index(size[by_code[c]['type']]), c)):
        if code in named or not re.fullmatch(r'[A-Z]{3}', code):
            continue
        r = by_code[code]
        lines.append('|'.join([code, city_of(r), clean(r['name'].split(' / ')[0]), r['iso_country'], size[r['type']]]))

    js = ('/* Airports with scheduled flights that have no Korean name in core.js. From OurAirports (public domain),\n'
          '   built by tools/build-airports.py. One per line: code|city|airport name|country|size (L, M or S). */\n'
          '(function (root, data) {\n'
          "  if (typeof module === 'object' && module.exports) module.exports = data;\n"
          '  else root.FareAirports = data;\n'
          "})(typeof self !== 'undefined' ? self : globalThis, " + json.dumps('\n'.join(lines), ensure_ascii=False) + ');\n')
    with open(os.path.join(ROOT, 'airports.js'), 'w', encoding='utf-8') as f:
        f.write(js)

    block = ['/* AIRPORTS:BEGIN (built from tools/curated.py: code, Korean name, note, English name, country, extra search words) */',
             'const AP = [']
    block += [json.dumps(list(r), ensure_ascii=False, separators=(',', ':')) + (',' if i < len(rows) - 1 else '') for i, r in enumerate(rows)]
    block += ['].map(a => ({c: a[0], ko: a[1], sub: a[2], en: a[3], iso: a[4], keys: a[5]}));', '/* AIRPORTS:END */']
    path = os.path.join(ROOT, 'core.js')
    with open(path, encoding='utf-8') as f:
        core = f.read()
    start, end = core.index('/* AIRPORTS:BEGIN'), core.index('/* AIRPORTS:END */') + len('/* AIRPORTS:END */')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(core[:start] + '\n'.join(block) + core[end:])

    print(f'{len(rows)} places with a Korean name, {len(lines)} more airports in airports.js ({len(js) // 1024} KB)')


if __name__ == '__main__':
    main()
