"""Classify every flare site against the Niger Delta states boundary (KFL-M 1.2).

Replaces the old study rectangle (4.5–8.5° E, 4.5–7.0° N), which mislabelled
offshore fields such as Oso. The boundary is the union of the nine Niger Delta
states, taken from the ADM1 layer we already ship (geoBoundaries gbOpen NGA
ADM1, GRID3, CC BY 4.0, simplified for the web):

    Abia, Akwa Ibom, Bayelsa, Cross River, Delta, Edo, Imo, Ondo, Rivers

Each site gets one of three classes, by point-in-polygon against all 37 ADM1
units:

    niger_delta  inside one of the nine states            -> in_niger_delta = 1
    offshore     inside no state polygon; labelled with the nearest state and
                 the distance to it, never silently bucketed -> in_niger_delta = 0
    outside      inside a state that is not one of the nine -> in_niger_delta = 0

Output: worker/src/niger-delta.json (bundled by the Worker) and an updated
in_niger_delta flag in data/gfmr_nigeria_sites_seed.json. Re-run gen_sql.py
afterwards to refresh worker/seed.sql.

Usage: python3 scripts/classify_niger_delta.py
"""
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATES = os.path.join(ROOT, 'web/public/layers/nga-states.geojson')
SEED = os.path.join(ROOT, 'data/gfmr_nigeria_sites_seed.json')
OUT = os.path.join(ROOT, 'worker/src/niger-delta.json')

NIGER_DELTA_STATES = ['Abia', 'Akwa Ibom', 'Bayelsa', 'Cross River', 'Delta', 'Edo', 'Imo', 'Ondo', 'Rivers']


def ring_has(ring, x, y):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def polys(geom):
    if geom['type'] == 'Polygon':
        return [geom['coordinates']]
    if geom['type'] == 'MultiPolygon':
        return geom['coordinates']
    return []


def geom_has(geom, x, y):
    return any(ring_has(p[0], x, y) and not any(ring_has(h, x, y) for h in p[1:]) for p in polys(geom))


def dist_km(geom, lon, lat):
    # Equirectangular projection around the site: well under 1% error at these
    # latitudes over the tens of km we report (same as js/atlas.js).
    kx, ky = 111.32 * math.cos(math.radians(lat)), 110.574
    px, py = lon * kx, lat * ky
    best = float('inf')
    for p in polys(geom):
        for ring in p:
            for (ax, ay), (bx, by) in zip(ring, ring[1:]):
                ax, ay, bx, by = ax * kx, ay * ky, bx * kx, by * ky
                dx, dy = bx - ax, by - ay
                L = dx * dx + dy * dy
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L)) if L else 0.0
                best = min(best, math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
    return best


def main():
    states = json.load(open(STATES))['features']
    names = {f['properties']['shapeName'] for f in states}
    missing = [n for n in NIGER_DELTA_STATES if n not in names]
    if missing:
        raise SystemExit(f'ADM1 layer is missing Niger Delta states: {missing}')
    seed = json.load(open(SEED))

    out, counts, changed = {}, {'niger_delta': 0, 'offshore': 0, 'outside': 0}, []
    for s in seed:
        lon, lat = float(s['lon']), float(s['lat'])
        hit = next((f for f in states if geom_has(f['geometry'], lon, lat)), None)
        if hit:
            name = hit['properties']['shapeName']
            cls = 'niger_delta' if name in NIGER_DELTA_STATES else 'outside'
            rec = {'class': cls, 'state': name}
        else:
            near = min(((f, dist_km(f['geometry'], lon, lat)) for f in states), key=lambda t: t[1])
            name = near[0]['properties']['shapeName']
            rec = {'class': 'offshore', 'nearest_state': name, 'nearest_km': round(near[1], 1),
                   'nearest_is_niger_delta': name in NIGER_DELTA_STATES}
        counts[rec['class']] += 1
        out[s['site_id']] = rec
        new_flag = rec['class'] == 'niger_delta'
        if bool(s.get('in_niger_delta')) != new_flag:
            changed.append((s['site_id'], s.get('field_name') or '', s.get('location'), bool(s.get('in_niger_delta')), rec))
        s['in_niger_delta'] = new_flag

    doc = {
        'method': 'point-in-polygon against geoBoundaries gbOpen NGA ADM1 (GRID3, CC BY 4.0, simplified web layer); '
                  'Niger Delta = union of ' + ', '.join(NIGER_DELTA_STATES),
        'states': NIGER_DELTA_STATES,
        'counts': counts,
        'sites': out,
    }
    with open(OUT, 'w') as f:
        json.dump(doc, f, separators=(',', ':'))
    with open(SEED, 'w') as f:
        json.dump(seed, f)

    print('classes:', counts, '· total', len(seed))
    print(f'flag changed vs the old rectangle: {len(changed)} sites')
    for sid, fname, loc, old, rec in changed[:40]:
        print(f'  {sid:8} {fname[:22]:22} {loc:8} old={int(old)} -> {rec}')
    print('wrote', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    main()
