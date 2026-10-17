"""Security / OSINT context around every flare site (KFL-M 1.3, Part D).

Source: ACLED (Armed Conflict Location & Event Data), Nigeria.

Two ingestion paths, one output (web/public/data/security.json):

  1. HDX aggregates (default; REAL data, no account needed).
     ACLED publishes Nigeria monthly event and fatality counts by LGA (admin-2,
     OCHA P-code) on HDX, refreshed weekly:
       political violence (events + fatalities)
       civilian targeting (events + fatalities; a subset of political violence)
       demonstrations (events)
     We join them to sites by P-code using the OCHA COD-AB admin-2 polygons
     (HDX cod-ab-nga, CC BY-IGO):
       sec_lga             the LGA containing the site (offshore: the nearest LGA, labelled)
       sec_lga_12m         that LGA's last-12-complete-month counts
       sec_area25_12m / sec_area50_12m
                           summed over every LGA that touches the 25 / 50 km circle
       pv_monthly_area25   24 monthly political-violence counts (oldest first) for
                           the 25 km LGA area; the Worker derives sec_trend from it
                           with the thresholds in ledger-core.js
     These are LGA aggregates, NOT point counts: an LGA that only grazes the
     circle contributes all of its events. They are labelled that way.

  2. ACLED API point events (--api). Needs a myACLED account:
       ACLED_EMAIL + ACLED_PASSWORD  (OAuth password grant at acleddata.com/oauth/token)
     Fills sec_events_10km / _25km / _50km by type from geolocated events.
     Not run in this pass (no credentials on this box): those fields are null
     with sec_point_status = "pending".

  --self-test runs the point-radius code against data/samples/acled_point_sample_SYNTHETIC.csv
  (five invented rows in ACLED's export schema, for testing only; never shipped).

Licence: ACLED Terms of Use & Attribution Policy — attribution required; the
public HDX aggregates are used here for non-commercial monitoring. Confirm
terms with ACLED before any commercial reuse.

Requires: numpy, openpyxl (pip install -r scripts/requirements-enrich.txt).
Usage: python3 scripts/ingest_acled.py [--api] [--self-test]
"""
import csv
import datetime as dt
import io
import json
import math
import os
import re
import sys
import urllib.parse
import urllib.request
import zipfile

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, 'data/gfmr_nigeria_sites_seed.json')
OUT = os.path.join(ROOT, 'web/public/data/security.json')
LAYER = os.path.join(ROOT, 'web/public/layers/security-lga.geojson')
CACHE = os.path.join(ROOT, 'data/cache/acled')
CACHE_COD = os.path.join(ROOT, 'data/cache/codab')
SAMPLE = os.path.join(ROOT, 'data/samples/acled_point_sample_SYNTHETIC.csv')
UA = 'Mozilla/5.0 (KaliabeFlareLedger ingest_acled; +https://kaliabe-flare-web.pages.dev/data.html)'
HDX_PKG = 'https://data.humdata.org/api/3/action/package_show?id=nigeria-acled-conflict-data'
COD_PKG = 'https://data.humdata.org/api/3/action/package_show?id=cod-ab-nga'
ACLED_TOKEN = 'https://acleddata.com/oauth/token'
ACLED_API = 'https://acleddata.com/api/acled/read'
KINDS = {'political_violence': 'pv', 'civilian_targeting': 'civ', 'demonstration': 'demo'}
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
RADII = [10, 25, 50]
R_EARTH = 6371.0088


def get(url, data=None, headers=None, timeout=180):
    h = {'User-Agent': UA}
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


# ------------------------------------------------------------------ geometry
def polys(geom):
    return [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates'] if geom['type'] == 'MultiPolygon' else []


def ring_has(ring, x, y):
    inside, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi, xj, yj = ring[i][0], ring[i][1], ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def geom_has(geom, x, y):
    return any(ring_has(p[0], x, y) and not any(ring_has(h, x, y) for h in p[1:]) for p in polys(geom))


def dp(points, tol):
    """Douglas–Peucker on a ring (list of [x, y]); keeps the closing point."""
    if len(points) < 5:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-12
        best, idx = 0.0, None
        for i in range(a + 1, b):
            d = abs(dy * points[i][0] - dx * points[i][1] + bx * ay - by * ax) / L
            if d > best:
                best, idx = d, i
        if idx is not None and best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    out = [p for p, k in zip(points, keep) if k]
    return out if len(out) >= 4 else points


def simplify(geom, tol):
    ps = [[dp(r, tol) for r in p] for p in polys(geom)]
    rnd = lambda r: [[round(x, 4), round(y, 4)] for x, y in r]
    if len(ps) == 1:
        return {'type': 'Polygon', 'coordinates': [rnd(r) for r in ps[0]]}
    return {'type': 'MultiPolygon', 'coordinates': [[rnd(r) for r in p] for p in ps]}


def seg_dist_km(geom, lon, lat):
    """Minimum distance (km) from a point to a polygon's rings, equirectangular around the point."""
    kx, ky = 111.32 * math.cos(math.radians(lat)), 110.574
    best = float('inf')
    for p in polys(geom):
        for ring in p:
            a = np.asarray(ring, dtype='float64')
            ax, ay = (a[:-1, 0] - lon) * kx, (a[:-1, 1] - lat) * ky
            bx, by = (a[1:, 0] - lon) * kx, (a[1:, 1] - lat) * ky
            dx, dy = bx - ax, by - ay
            L = dx * dx + dy * dy
            t = np.clip(np.where(L > 0, -(ax * dx + ay * dy) / np.where(L > 0, L, 1), 0), 0, 1)
            d = np.hypot(ax + t * dx, ay + t * dy)
            if d.size:
                best = min(best, float(d.min()))
    return best


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2
    return 2 * R_EARTH * np.arcsin(np.sqrt(a))


# ---------------------------------------------------------------- downloads
def hdx_resources(pkg):
    d = json.loads(get(pkg))['result']
    return d, d['resources']


def load_codab():
    os.makedirs(CACHE_COD, exist_ok=True)
    path = os.path.join(CACHE_COD, 'nga_admin2.geojson')
    if not os.path.exists(path):
        _, res = hdx_resources(COD_PKG)
        url = next(r['url'] for r in res if r['name'].endswith('.geojson.zip'))
        with zipfile.ZipFile(io.BytesIO(get(url))) as z:
            with open(path, 'wb') as f:
                f.write(z.read('nga_admin2.geojson'))
    return json.load(open(path))['features']


def load_hdx_acled():
    """{kind: {pcode: {(year, month): (events, fatalities|None)}}}, as-of date, resource names."""
    import openpyxl
    os.makedirs(CACHE, exist_ok=True)
    pkg, res = hdx_resources(HDX_PKG)
    out, names, asof = {}, [], None
    for r in res:
        n = r['name'].lower()
        kind = 'political_violence' if 'political_violence' in n else 'civilian_targeting' if 'civilian_targeting' in n else 'demonstration' if 'demonstration' in n else None
        if not kind:
            continue
        m = re.search(r'as-of-(\d{1,2})([a-z]{3})(\d{4})', r['url'].lower())
        if m:
            asof = dt.datetime.strptime(f'{m.group(1)} {m.group(2)} {m.group(3)}', '%d %b %Y').date()
        path = os.path.join(CACHE, os.path.basename(urllib.parse.urlparse(r['url']).path))
        if not os.path.exists(path):
            with open(path, 'wb') as f:
                f.write(get(r['url']))
        names.append(os.path.basename(path))
        ws = openpyxl.load_workbook(path, read_only=True)['Data']
        rows = ws.iter_rows(values_only=True)
        hdr = list(next(rows))
        ix = {h: hdr.index(h) for h in hdr}
        d = {}
        for row in rows:
            pc = row[ix['Admin2 Pcode']]
            if not pc:
                continue
            key = (int(row[ix['Year']]), MONTHS.index(row[ix['Month']]) + 1)
            fat = row[ix['Fatalities']] if 'Fatalities' in ix else None
            d.setdefault(pc, {})[key] = (int(row[ix['Events']] or 0), None if fat is None else int(fat))
        out[kind] = d
    return out, asof, names, pkg.get('last_modified')


def month_back(y, m, k):
    t = y * 12 + (m - 1) - k
    return t // 12, t % 12 + 1


# ----------------------------------------------------------- point (API) path
def api_events(days=730):
    email, pw = os.environ.get('ACLED_EMAIL'), os.environ.get('ACLED_PASSWORD')
    if not (email and pw):
        raise SystemExit('ACLED_EMAIL and ACLED_PASSWORD are required for --api (myACLED account)')
    tok = json.loads(get(ACLED_TOKEN, data=urllib.parse.urlencode({
        'username': email, 'password': pw, 'grant_type': 'password', 'client_id': 'acled'}).encode(),
        headers={'Content-Type': 'application/x-www-form-urlencoded'}))['access_token']
    since = (dt.date.today() - dt.timedelta(days=days)).isoformat()
    rows, page = [], 1
    while True:
        q = urllib.parse.urlencode({'country': 'Nigeria', 'event_date': f'{since}|{dt.date.today().isoformat()}', 'event_date_where': 'BETWEEN',
                                    'fields': 'event_id_cnty|event_date|event_type|sub_event_type|latitude|longitude|fatalities|admin1|admin2',
                                    'limit': 5000, 'page': page, '_format': 'json'})
        d = json.loads(get(f'{ACLED_API}?{q}', headers={'Authorization': f'Bearer {tok}'}))
        batch = d.get('data', [])
        rows += batch
        if len(batch) < 5000:
            return rows
        page += 1


def sample_events():
    with open(SAMPLE) as f:
        return [r for r in csv.DictReader(f) if not r['event_id_cnty'].startswith('#')]


def point_counts(seed, events, end):
    """Per site: events within 10/25/50 km in the 12 months before `end`, split by ACLED event_type."""
    start = end - dt.timedelta(days=365)
    ev = [e for e in events if start <= dt.date.fromisoformat(e['event_date']) < end]
    if not ev:
        return {s['site_id']: {f'sec_events_{r}km': {'total': 0} for r in RADII} for s in seed}
    la = np.array([float(e['latitude']) for e in ev])
    lo = np.array([float(e['longitude']) for e in ev])
    typ = [e['event_type'] for e in ev]
    out = {}
    for s in seed:
        d = haversine_km(s['lat'], s['lon'], la, lo)
        rec = {}
        for r in RADII:
            idx = np.where(d <= r)[0]
            c = {'total': int(len(idx))}
            for i in idx:
                c[typ[i]] = c.get(typ[i], 0) + 1
            rec[f'sec_events_{r}km'] = c
        out[s['site_id']] = rec
    return out


# ---------------------------------------------------------------------- main
def main():
    seed = json.load(open(SEED))
    if '--self-test' in sys.argv:
        ev = sample_events()
        end = max(dt.date.fromisoformat(e['event_date']) for e in ev) + dt.timedelta(days=1)
        pc = point_counts(seed, ev, end)
        hit = {k: v for k, v in pc.items() if v['sec_events_50km']['total']}
        print(f'self-test (SYNTHETIC sample, {len(ev)} rows): {len(hit)} sites with ≥1 event within 50 km')
        for k, v in list(hit.items())[:5]:
            print(' ', k, v)
        assert all(v['sec_events_10km']['total'] <= v['sec_events_25km']['total'] <= v['sec_events_50km']['total'] for v in pc.values())
        print('self-test OK (radius counts nest 10 ≤ 25 ≤ 50 km)')
        return

    cod = load_codab()
    data, asof, files, hdx_modified = load_hdx_acled()
    end_y, end_m = month_back(asof.year, asof.month, 1)          # last complete month
    months24 = [month_back(end_y, end_m, k) for k in range(23, -1, -1)]  # oldest → newest
    last12, prev12 = months24[12:], months24[:12]

    lga = {}
    for f in cod:
        p = f['properties']
        g = f['geometry']
        xs = [c[0] for poly in polys(g) for c in poly[0]]
        ys = [c[1] for poly in polys(g) for c in poly[0]]
        lga[p['adm2_pcode']] = {'name': p['adm2_name'], 'state': p['adm1_name'], 'geom': g,
                                'simple': simplify(g, 0.0015), 'bbox': (min(xs), min(ys), max(xs), max(ys))}

    def sums(pcodes, months):
        o = {'pv': 0, 'pv_fat': 0, 'civ': 0, 'civ_fat': 0, 'demo': 0}
        for pc in pcodes:
            for kind, short in KINDS.items():
                rec = data.get(kind, {}).get(pc, {})
                for k in months:
                    ev, fat = rec.get(k, (0, None))
                    o[short] += ev
                    if short in ('pv', 'civ') and fat:
                        o[short + '_fat'] += fat
        return o

    def monthly_pv(pcodes):
        rec = [data['political_violence'].get(pc, {}) for pc in pcodes]
        return [sum(r.get(k, (0, None))[0] for r in rec) for k in months24]

    sites, touched = {}, set()
    for s in seed:
        lat, lon = s['lat'], s['lon']
        kx, ky = 111.32 * math.cos(math.radians(lat)), 110.574
        near = {}
        for pc, L in lga.items():
            x0, y0, x1, y1 = L['bbox']
            gap = max(x0 - lon, 0, lon - x1) * kx, max(y0 - lat, 0, lat - y1) * ky
            if math.hypot(*gap) > max(RADII):
                continue
            inside = geom_has(L['geom'], lon, lat)
            near[pc] = 0.0 if inside else seg_dist_km(L['simple'], lon, lat)
        home = min(near, key=near.get) if near else None
        a25 = [pc for pc, d in near.items() if d <= 25]
        a50 = [pc for pc, d in near.items() if d <= 50]
        touched.update(a50)
        sites[s['site_id']] = {
            'sec_lga': {'pcode': home, 'name': lga[home]['name'], 'state': lga[home]['state'],
                        'basis': 'containing LGA' if near.get(home) == 0 else f'nearest LGA, {near[home]:.1f} km (site outside every LGA polygon — offshore)'} if home else None,
            'sec_lga_12m': sums([home], last12) if home else None,
            'sec_area25_12m': {'lgas': len(a25), **sums(a25, last12)},
            'sec_area50_12m': {'lgas': len(a50), **sums(a50, last12)},
            'pv_monthly_area25': monthly_pv(a25),
            'sec_events_10km': None, 'sec_events_25km': None, 'sec_events_50km': None,
            'sec_point_status': 'pending — ACLED point events need a myACLED account (scripts/ingest_acled.py --api)',
        }

    if '--api' in sys.argv:
        pc = point_counts(seed, api_events(), dt.date.today())
        for sid, rec in pc.items():
            sites[sid].update(rec)
            sites[sid]['sec_point_status'] = f'live ACLED API pull {dt.date.today().isoformat()}'

    fmt = lambda ym: f'{ym[0]}-{ym[1]:02d}'
    meta = {
        'generated': dt.date.today().isoformat(),
        'script': 'scripts/ingest_acled.py',
        'mode': 'api+hdx' if '--api' in sys.argv else 'hdx-aggregates',
        'status': 'LGA-level monthly aggregates (real ACLED data via HDX). Point-radius counts pending a myACLED account.',
        'source': 'ACLED (Armed Conflict Location & Event Data), Nigeria — monthly events and fatalities by LGA, via HDX (nigeria-acled-conflict-data)',
        'source_url': 'https://data.humdata.org/dataset/nigeria-acled-conflict-data',
        'hdx_last_modified': hdx_modified,
        'as_of': asof.isoformat(),
        'files': files,
        'window_12m': [fmt(last12[0]), fmt(last12[-1])],
        'window_prev_12m': [fmt(prev12[0]), fmt(prev12[-1])],
        'months_24': [fmt(m) for m in months24],
        'join': 'ACLED Admin2 P-code ↔ OCHA COD-AB NGA admin-2 (HDX cod-ab-nga, CC BY-IGO); site → LGA by point-in-polygon; area = LGAs whose polygon is within the radius',
        'licence': 'ACLED Terms of Use & Attribution Policy (attribution required; public aggregates used for non-commercial monitoring — confirm before commercial reuse). Boundaries: OCHA COD-AB, CC BY-IGO.',
        'attribution': 'Armed Conflict Location & Event Data (ACLED); www.acleddata.com',
        'caveat': 'Event counts are reported conflict events, not a risk judgement. LGA aggregates include every event in an LGA that touches the radius, so the area figures overstate what lies strictly within it. Civilian targeting is a subset of political violence.',
        'types': {'pv': 'political violence events', 'pv_fat': 'political violence fatalities', 'civ': 'civilian targeting events (subset of pv)',
                  'civ_fat': 'civilian targeting fatalities', 'demo': 'demonstration events'},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({'meta': meta, 'sites': sites}, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))

    feats = []
    for pc in sorted(touched):
        L = lga[pc]
        c = sums([pc], last12)
        p = sums([pc], prev12)
        feats.append({'type': 'Feature', 'geometry': L['simple'],
                      'properties': {'pcode': pc, 'name': L['name'], 'state': L['state'], **c, 'pv_prev12': p['pv']}})
    json.dump({'type': 'FeatureCollection', 'meta': {k: meta[k] for k in ('source', 'as_of', 'window_12m', 'window_prev_12m', 'licence', 'attribution')},
               'features': feats}, open(LAYER, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'wrote {os.path.relpath(OUT, ROOT)} ({len(sites)} sites) and {os.path.relpath(LAYER, ROOT)} ({len(feats)} LGAs); '
          f'as of {asof}, 12m window {meta["window_12m"]}')


if __name__ == '__main__':
    main()
