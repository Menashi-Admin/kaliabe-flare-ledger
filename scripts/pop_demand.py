"""Population demand around every flare site (KFL-M 1.3, Part B).

Source: GRID3 NGA Population v3.0 — Bayesian-modelled gridded population,
100 m (3 arc-second) cells, scaled to UN-WPP 2025, CC BY 4.0. Downloaded from
WorldPop (https://wopr.worldpop.org/download/611) as
NGA_population_v3_0_gridded.zip. Each cell holds *people in that cell*, so a
zonal sum is a head-count.

Settlement names: GRID3 NGA Settlement Points (eHealth Africa, Proxy Logics,
ORNL; released March 2021), CC BY 4.0, ArcGIS feature service
Settlements_in_Nigeria.

For each of the 476 sites this computes, and writes to
web/public/data/pop_demand.json (read by the Worker and the site; the raster is
never shipped to the browser):

  pop5km, pop10km, pop25km, pop50km
      people in grid cells whose centre lies within the radius (great-circle
      distance from the site to the cell centre; zonal sum, raster → point).
      Sea cells are no-data and count as zero.
  nearest_settlement, nearest_settlement_lga, nearest_settlement_pop, dist_km
      the nearest GRID3 named settlement point; its population is the raster
      sum within 2 km of the point (GRID3 points carry no population).
  main_centre_25km, main_centre_25km_pop, main_centre_25km_dist_km
      the named settlement within 25 km with the largest 2-km population —
      the demand centre a developer would look at first.
  state, state_basis
      containing state (Niger Delta classification), or the nearest state for
      offshore sites, labelled as such.

The raster (45 MB zip / 50 MB GeoTIFF) and the settlement points are cached
under data/cache/ (git-ignored). Requires: numpy, rasterio
(pip install -r scripts/requirements-enrich.txt).

Usage: python3 scripts/pop_demand.py [--refresh-settlements]
"""
import datetime as dt
import hashlib
import json
import math
import os
import sys
import urllib.parse
import urllib.request
import zipfile

import numpy as np
import rasterio
from rasterio.windows import Window

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, 'data/gfmr_nigeria_sites_seed.json')
ND = os.path.join(ROOT, 'worker/src/niger-delta.json')
OUT = os.path.join(ROOT, 'web/public/data/pop_demand.json')
CACHE_POP = os.path.join(ROOT, 'data/cache/grid3_pop')
CACHE_SET = os.path.join(ROOT, 'data/cache/grid3_settlements')
POP_URL = 'https://wopr.worldpop.org/download/611'
POP_ZIP = os.path.join(CACHE_POP, 'NGA_population_v3_0_gridded.zip')
POP_TIF = os.path.join(CACHE_POP, 'NGA_population_v3_0_gridded/NGA_population_v3_0_gridded.tif')
SET_URL = 'https://services3.arcgis.com/BU6Aadhn6tbBEdyk/arcgis/rest/services/Settlements_in_Nigeria/FeatureServer/0/query'
SET_JSON = os.path.join(CACHE_SET, 'settlement_points.json')
UA = 'Mozilla/5.0 (KaliabeFlareLedger pop_demand; +https://kaliabe-flare-web.pages.dev/data.html)'

RADII_KM = [5, 10, 25, 50]
SETTLEMENT_POP_RADIUS_KM = 2
MAIN_CENTRE_RADIUS_KM = 25
R_EARTH = 6371.0088


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def get(url, timeout=120):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def ensure_raster():
    if os.path.exists(POP_TIF):
        return
    os.makedirs(CACHE_POP, exist_ok=True)
    print('downloading GRID3 population raster …', file=sys.stderr)
    with open(POP_ZIP, 'wb') as f:
        f.write(get(POP_URL, timeout=900))
    with zipfile.ZipFile(POP_ZIP) as z:
        member = 'NGA_population_v3_0_gridded/NGA_population_v3_0_gridded.tif'
        z.extract(member, CACHE_POP)


def fetch_settlements(envelopes):
    """GRID3 settlement points inside the given (xmin, ymin, xmax, ymax) envelopes."""
    pts = {}
    for env in envelopes:
        offset = 0
        while True:
            q = {
                'where': '1=1', 'geometry': ','.join(map(str, env)), 'geometryType': 'esriGeometryEnvelope',
                'inSR': 4326, 'outSR': 4326, 'spatialRel': 'esriSpatialRelIntersects',
                'outFields': 'FID,set_name,lganame,statename', 'returnGeometry': 'true',
                'resultOffset': offset, 'resultRecordCount': 2000, 'orderByFields': 'FID', 'f': 'json',
            }
            d = json.loads(get(SET_URL + '?' + urllib.parse.urlencode(q)))
            feats = d.get('features', [])
            for f in feats:
                a, g = f['attributes'], f['geometry']
                pts[a['FID']] = [round(g['x'], 6), round(g['y'], 6), (a.get('set_name') or '').strip(),
                                 (a.get('lganame') or '').strip(), (a.get('statename') or '').strip()]
            offset += len(feats)
            print(f'  settlements {env}: {offset}', file=sys.stderr)
            if not feats or not d.get('exceededTransferLimit'):
                break
    return list(pts.values())


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi, dl = p2 - p1, np.radians(lon2 - lon1)
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * R_EARTH * np.arcsin(np.sqrt(a))


class Grid:
    def __init__(self, path):
        self.ds = rasterio.open(path)
        a = self.ds.read(1).astype('float32')
        a[~np.isfinite(a)] = 0
        a[a < 0] = 0
        self.a = a
        t = self.ds.transform
        self.x0, self.dx, self.y0, self.dy = t.c, t.a, t.f, t.e  # dy < 0
        self.h, self.w = a.shape

    def window(self, lat, lon, r_km):
        """Cell-centre coordinates and values of the bounding window of a circle."""
        dlat = r_km / 110.574 + abs(self.dy)
        dlon = r_km / (111.32 * math.cos(math.radians(lat))) + self.dx
        c0 = max(0, int((lon - dlon - self.x0) / self.dx))
        c1 = min(self.w, int((lon + dlon - self.x0) / self.dx) + 1)
        r0 = max(0, int((lat + dlat - self.y0) / self.dy))
        r1 = min(self.h, int((lat - dlat - self.y0) / self.dy) + 1)
        if c1 <= c0 or r1 <= r0:
            return None, None
        lons = self.x0 + (np.arange(c0, c1) + 0.5) * self.dx
        lats = self.y0 + (np.arange(r0, r1) + 0.5) * self.dy
        d = haversine_km(lat, lon, lats[:, None], lons[None, :])
        return d, self.a[r0:r1, c0:c1]

    def radii(self, lat, lon, radii):
        d, v = self.window(lat, lon, max(radii))
        if d is None:
            return {r: 0.0 for r in radii}
        return {r: float(v[d <= r].sum(dtype='float64')) for r in radii}


def main():
    refresh = '--refresh-settlements' in sys.argv
    seed = json.load(open(SEED))
    nd = json.load(open(ND))['sites']
    ensure_raster()

    # Settlement envelopes: the main southern box (+0.5° margin ≈ 55 km) and a
    # small box around any site outside it (the one Kaduna site).
    main_env = (2.6, 2.6, 9.0, 8.7)
    envs = [main_env]
    for s in seed:
        if not (main_env[0] + 0.5 <= s['lon'] <= main_env[2] - 0.5 and main_env[1] + 0.5 <= s['lat'] <= main_env[3] - 0.5):
            envs.append((round(s['lon'] - 0.5, 3), round(s['lat'] - 0.5, 3), round(s['lon'] + 0.5, 3), round(s['lat'] + 0.5, 3)))
    if refresh or not os.path.exists(SET_JSON):
        os.makedirs(CACHE_SET, exist_ok=True)
        pts = fetch_settlements(envs)
        json.dump({'retrieved': dt.date.today().isoformat(), 'envelopes': envs, 'points': pts}, open(SET_JSON, 'w'))
    sp = json.load(open(SET_JSON))
    pts = sp['points']
    print(f'{len(pts)} settlement points', file=sys.stderr)
    P_lon = np.array([p[0] for p in pts])
    P_lat = np.array([p[1] for p in pts])

    g = Grid(POP_TIF)
    national = float(g.a.sum(dtype='float64'))
    set_pop_cache = {}

    def set_pop(i):
        if i not in set_pop_cache:
            set_pop_cache[i] = g.radii(P_lat[i], P_lon[i], [SETTLEMENT_POP_RADIUS_KM])[SETTLEMENT_POP_RADIUS_KM]
        return set_pop_cache[i]

    out = {}
    for n, s in enumerate(seed):
        lat, lon, sid = s['lat'], s['lon'], s['site_id']
        r = g.radii(lat, lon, RADII_KM)
        d = haversine_km(lat, lon, P_lat, P_lon)
        i = int(np.argmin(d))
        near = np.where(d <= MAIN_CENTRE_RADIUS_KM)[0]
        main_i = max(near, key=set_pop) if len(near) else None
        c = nd.get(sid, {})
        if c.get('class') == 'offshore':
            state, basis = c['nearest_state'], f"offshore — nearest state, {c['nearest_km']} km"
        else:
            state, basis = c.get('state'), 'containing state'
        rec = {
            'pop5km': int(round(r[5])), 'pop10km': int(round(r[10])),
            'pop25km': int(round(r[25])), 'pop50km': int(round(r[50])),
            'nearest_settlement': pts[i][2] or 'unnamed', 'nearest_settlement_lga': pts[i][3],
            'nearest_settlement_pop': int(round(set_pop(i))), 'dist_km': round(float(d[i]), 2),
            'state': state, 'state_basis': basis,
        }
        if main_i is not None:
            rec.update({'main_centre_25km': pts[main_i][2] or 'unnamed', 'main_centre_25km_lga': pts[main_i][3],
                        'main_centre_25km_pop': int(round(set_pop(main_i))),
                        'main_centre_25km_dist_km': round(float(d[main_i]), 2)})
        else:
            rec.update({'main_centre_25km': None, 'main_centre_25km_lga': None,
                        'main_centre_25km_pop': None, 'main_centre_25km_dist_km': None})
        out[sid] = rec
        if n % 50 == 0:
            print(f'  {n}/{len(seed)} {sid} pop10km={rec["pop10km"]}', file=sys.stderr)

    meta = {
        'generated': dt.date.today().isoformat(),
        'script': 'scripts/pop_demand.py',
        'population': {
            'dataset': 'GRID3 NGA Population v3.0 — gridded population estimates (Bayesian model, 100 m cells, UN-WPP 2025-scaled)',
            'publisher': 'GRID3 (Geo-Referenced Infrastructure and Demographic Data for Development) / WorldPop, University of Southampton',
            'url': POP_URL,
            'service': 'https://tiles.arcgis.com/tiles/BU6Aadhn6tbBEdyk/arcgis/rest/services/NGA_gridded_population_v3_tile_package/MapServer',
            'licence': 'CC BY 4.0',
            'file': os.path.basename(POP_TIF),
            'zip_sha256': sha256(POP_ZIP) if os.path.exists(POP_ZIP) else None,
            'tif_sha256': sha256(POP_TIF),
            'cell_deg': round(g.dx, 10),
            'national_total': int(round(national)),
        },
        'settlements': {
            'dataset': 'GRID3 NGA Settlement Points (settlement names), released March 2021',
            'publisher': 'eHealth Africa, Proxy Logics and Oak Ridge National Laboratory (ORNL), GRID3',
            'url': SET_URL.rsplit('/query', 1)[0],
            'licence': 'CC BY 4.0',
            'retrieved': sp['retrieved'],
            'points_used': len(pts),
        },
        'method': (f'Zonal sum, raster to point: people in 100 m cells whose centre lies within {", ".join(map(str, RADII_KM))} km '
                   '(great-circle distance) of the site; sea cells are no-data = 0. Nearest settlement = nearest GRID3 named '
                   f'settlement point; its population = cells within {SETTLEMENT_POP_RADIUS_KM} km of the point. Main centre = '
                   f'the named point within {MAIN_CENTRE_RADIUS_KM} km with the largest {SETTLEMENT_POP_RADIUS_KM}-km population. '
                   'Modelled population (an estimate), not a census count.'),
        'fields': {
            'pop5km|pop10km|pop25km|pop50km': 'people within the radius (modelled, GRID3 v3.0)',
            'nearest_settlement|nearest_settlement_lga|nearest_settlement_pop|dist_km': f'nearest GRID3 named settlement; pop = people within {SETTLEMENT_POP_RADIUS_KM} km of it; dist_km = site → point',
            'main_centre_25km|main_centre_25km_pop|main_centre_25km_dist_km': f'largest named settlement within {MAIN_CENTRE_RADIUS_KM} km by {SETTLEMENT_POP_RADIUS_KM}-km population',
            'state|state_basis': 'containing state, or nearest state for offshore sites (scripts/classify_niger_delta.py)',
        },
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump({'meta': meta, 'sites': out}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'wrote {OUT}: {len(out)} sites, national raster total {national:,.0f}', file=sys.stderr)


if __name__ == '__main__':
    main()
