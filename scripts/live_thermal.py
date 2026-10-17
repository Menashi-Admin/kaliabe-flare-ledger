"""Live flare thermal check from NASA FIRMS (KFL-M 1.3, Part A).

Source: NASA FIRMS (LANCE) VIIRS 375 m active-fire NRT, collection 2
(Suomi NPP, NOAA-20, NOAA-21), regional "Northern and Central Africa" CSV files
— public, no key needed:
  https://firms.modaps.eosdis.nasa.gov/data/active_fire/<sat>/csv/<SAT>_VIIRS_C2_Northern_and_Central_Africa_{24h,7d}.csv
Each row: latitude, longitude, bright_ti4 (K), frp (MW), acq_date, acq_time
(UTC), satellite, confidence, daynight.

What it does (run daily by .github/workflows/live-thermal.yml):
  1. pulls the 24h file for each satellite (the 7d file on the first run, or
     with --days 7, so the history starts with a week of nights);
  2. keeps detections inside the Nigeria bbox (incl. the offshore fields);
  3. assigns each detection to the nearest ledger flare site within
     MATCH_RADIUS_KM (VIIRS I-band pixel 375 m at nadir, up to ~800 m at scan
     edge; geolocation error adds more);
  4. records, per UTC date, which sites were detected (night passes counted
     separately, daynight == 'N') and with what bright_ti4 / FRP, in a rolling
     history of WINDOW_NIGHTS nights (web/public/data/live/firms_history.json);
  5. writes web/public/data/live/live_thermal.json: per-site live summary and
     the last-24h detection points for the map layer.

Night counting: a night is in the window if the FIRMS files pulled cover that
UTC date. FIRMS cannot tell us which nights were cloudy over a given site, so a
cloudy night counts as a non-detection: live_nights_detected_pct is a LOWER
BOUND on the share of clear nights the site burned. The burning / under-report
rules are applied by the Worker with the thresholds in ledger-core.js.

Stdlib only. Usage: python3 scripts/live_thermal.py [--days 7]
"""
import csv
import datetime as dt
import io
import json
import math
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, 'data/gfmr_nigeria_sites_seed.json')
LIVE_DIR = os.path.join(ROOT, 'web/public/data/live')
HISTORY = os.path.join(LIVE_DIR, 'firms_history.json')
OUT = os.path.join(LIVE_DIR, 'live_thermal.json')
BASE = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire'
SATS = [('suomi-npp-viirs-c2', 'SUOMI', 'Suomi NPP'), ('noaa-20-viirs-c2', 'J1', 'NOAA-20'), ('noaa-21-viirs-c2', 'J2', 'NOAA-21')]
REGION = 'Northern_and_Central_Africa'
BBOX = (2.6, 2.8, 14.8, 14.0)   # lon0, lat0, lon1, lat1 — Nigeria incl. the offshore fields
MATCH_RADIUS_KM = 1.0
WINDOW_NIGHTS = 30
UA = 'Mozilla/5.0 (KaliabeFlareLedger live_thermal; +https://kaliabe-flare-web.pages.dev/data.html)'


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read().decode('utf-8', 'replace'), r.headers.get('Last-Modified')


def km(lat1, lon1, lat2, lon2):
    kx = 111.32 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot((lon2 - lon1) * kx, (lat2 - lat1) * 110.574)


class SiteIndex:
    """0.05° grid hash of site coordinates for fast nearest-within-radius lookups."""
    def __init__(self, seed):
        self.cell = 0.05
        self.g = {}
        for s in seed:
            self.g.setdefault(self.key(s['lat'], s['lon']), []).append(s)

    def key(self, lat, lon):
        return int(math.floor(lat / self.cell)), int(math.floor(lon / self.cell))

    def nearest(self, lat, lon, r):
        i, j = self.key(lat, lon)
        best, bd = None, r
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for s in self.g.get((i + di, j + dj), []):
                    d = km(lat, lon, s['lat'], s['lon'])
                    if d <= bd:
                        best, bd = s, d
        return best, bd


def stamp(r):
    return f"{r['acq_date']}T{r['acq_time'][:2]}:{r['acq_time'][2:]}Z"


def main():
    hist = json.load(open(HISTORY)) if os.path.exists(HISTORY) else {'nights': {}, 'runs': []}
    days = 7 if ('--days' in sys.argv and sys.argv[sys.argv.index('--days') + 1] == '7') or not hist['nights'] else 1
    span = '7d' if days == 7 else '24h'
    seed = json.load(open(SEED))
    idx = SiteIndex(seed)

    rows, files = [], []
    for folder, prefix, label in SATS:
        url = f'{BASE}/{folder}/csv/{prefix}_VIIRS_C2_{REGION}_{span}.csv'
        text, lm = get(url)
        n = 0
        for r in csv.DictReader(io.StringIO(text)):
            lat, lon = float(r['latitude']), float(r['longitude'])
            if not (BBOX[1] <= lat <= BBOX[3] and BBOX[0] <= lon <= BBOX[2]):
                continue
            n += 1
            r['_sat'], r['_lat'], r['_lon'] = label, lat, lon
            rows.append(r)
        files.append({'satellite': label, 'url': url, 'last_modified': lm, 'rows_in_bbox': n})
        print(f'{label}: {n} detections in the Nigeria bbox ({span})', file=sys.stderr)

    # Assign each detection to the nearest site; group by UTC date.
    for r in rows:
        s, d = idx.nearest(r['_lat'], r['_lon'], MATCH_RADIUS_KM)
        r['_site'] = s['site_id'] if s else None
    fresh = {}
    for r in rows:
        fresh.setdefault(r['acq_date'], {'sites': {}, 'satellites': set()})['satellites'].add(r['_sat'])
    for r in rows:
        if not r['_site']:
            continue
        rec = fresh[r['acq_date']]['sites'].setdefault(r['_site'], {'n': 0, 'nd': 0, 'bt4': 0.0, 'frp': 0.0, 'last': ''})
        rec['n'] += 1
        rec['nd'] += r['daynight'] == 'N'
        rec['bt4'] += float(r['bright_ti4'])
        rec['frp'] += float(r['frp'])
        rec['last'] = max(rec['last'], stamp(r))
    # Merge: the fuller pull for a date wins (NRT files are re-issued as passes
    # arrive), then keep the newest WINDOW_NIGHTS dates.
    for n, rec in fresh.items():
        rec['satellites'] = sorted(rec['satellites'])
        old = hist['nights'].get(n)
        if old is None or sum(v['n'] for v in rec['sites'].values()) >= sum(v['n'] for v in old['sites'].values()):
            hist['nights'][n] = rec
    keep = sorted(hist['nights'])[-WINDOW_NIGHTS:]
    hist['nights'] = {n: hist['nights'][n] for n in keep}
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    hist['runs'] = (hist.get('runs', []) + [{'at': now, 'span': span, 'rows_in_bbox': len(rows)}])[-60:]

    # Per-site summary over the window.
    window = sorted(hist['nights'])
    per = {}
    for n in window:
        for sid, v in hist['nights'][n]['sites'].items():
            p = per.setdefault(sid, {'nights': 0, 'n': 0, 'bt4': 0.0, 'frp': 0.0, 'last': ''})
            p['nights'] += v['nd'] > 0
            p['n'] += v['n']
            p['bt4'] += v['bt4']
            p['frp'] += v['frp']
            p['last'] = max(p['last'], v['last'])

    # Last-24h points for the map layer, relative to the newest acquisition.
    t = lambda r: dt.datetime.strptime(f"{r['acq_date']}T{r['acq_time']}", '%Y-%m-%dT%H%M').replace(tzinfo=dt.timezone.utc)
    latest = max((t(r) for r in rows), default=None)
    pts = []
    for r in rows:
        if latest and t(r) > latest - dt.timedelta(hours=24):
            pts.append([round(r['_lat'], 4), round(r['_lon'], 4), round(float(r['bright_ti4']), 1), round(float(r['frp']), 2),
                        r['_sat'], stamp(r), r['daynight'], r['_site']])
    in24 = {p[7] for p in pts if p[7]}
    sites = {}
    for sid, p in per.items():
        sites[sid] = {
            'live_last_seen': p['last'],
            'live_nights_detected': p['nights'],
            'live_nights_detected_pct': round(100 * p['nights'] / len(window), 1),
            'live_detections': p['n'],
            'live_mean_bright_ti4_K': round(p['bt4'] / p['n'], 1),
            'live_mean_frp_MW': round(p['frp'] / p['n'], 2),
            'live_detected_24h': sid in in24,
        }
    out = {
        'meta': {
            'source': 'NASA FIRMS (LANCE) — VIIRS 375 m active fire NRT, collection 2 (Suomi NPP, NOAA-20, NOAA-21), Northern and Central Africa files',
            'attribution': 'NASA FIRMS / LANCE: NRT VIIRS 375 m Active Fire products VNP14IMGTDL_NRT, VJ114IMGTDL_NRT, VJ214IMGTDL_NRT — https://earthdata.nasa.gov/firms',
            'licence': 'NASA Earth Science open data policy (free use; acknowledgement requested)',
            'retrieved': now,
            'files': files,
            'latest_acquisition': latest.strftime('%Y-%m-%dT%H:%MZ') if latest else None,
            'window_nights': len(window),
            'window_first': window[0] if window else None,
            'window_last': window[-1] if window else None,
            'match_radius_km': MATCH_RADIUS_KM,
            'bbox': BBOX,
            'points_24h': len(pts),
            'points_24h_at_sites': sum(1 for p in pts if p[7]),
            'sites_detected_24h': len(in24),
            'sites_detected_window': len(sites),
            'method': (f'Each VIIRS detection is assigned to the nearest ledger site within {MATCH_RADIUS_KM} km. A night counts as '
                       'detected when a night-time pass (daynight N) hit the site. Nights in the window = UTC dates covered by the files '
                       f'pulled (rolling {WINDOW_NIGHTS}). FIRMS does not report cloud per site, so cloudy nights count as non-detections and '
                       'live_nights_detected_pct is a lower bound on the share of clear nights.'),
            'point_fields': ['lat', 'lon', 'bright_ti4_K', 'frp_MW', 'satellite', 'acq_utc', 'daynight', 'site_id'],
        },
        'sites': sites,
        'points_24h': pts,
    }
    os.makedirs(LIVE_DIR, exist_ok=True)
    json.dump(hist, open(HISTORY, 'w'), separators=(',', ':'))
    json.dump(out, open(OUT, 'w'), separators=(',', ':'))
    print(f'window {len(window)} nights ({window[0] if window else "-"} … {window[-1] if window else "-"}); '
          f'{len(sites)} sites detected in window, {len(in24)} in last 24h; {len(pts)} points in 24h layer', file=sys.stderr)


if __name__ == '__main__':
    main()
