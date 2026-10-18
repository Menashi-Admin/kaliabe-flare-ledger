#!/usr/bin/env python3
"""KCC 1.0: owned rate model + route table builder.

Reads  data/kcc-places-seed.json, data/commodities.json
Writes web/public/data/kcc/places.json   (resolved place grid, from data/nipost-cache/)
       web/public/data/kcc/routes.json   (pairwise road km, OSRM public, or null)
       web/public/data/kcc/model.json    (the rate model parameters, every one sourced)
       data/kcc-quotes-reference.json    (audit sample quotes, reproducible by anyone)

The worker (worker/src/index.js, /api/kcc/quote) imports those files, so a
quote is deterministic from bundled JSON. Run with --offline to rebuild model
and sample quotes from the existing places/routes without any network.

Road distance: OSRM public demo server (router.project-osrm.org, OSM data,
ODbL), table service. A pair OSRM cannot route is stored as null and quoted by
Haversine x a winding factor DERIVED FROM OUR OWN OSRM TABLE (the spread of
road/straight-line ratios over every routed pair), not guessed.
"""
import json, math, os, statistics, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nipost_resolver as nr

ROOT = nr.ROOT
OUTDIR = os.path.join(ROOT, 'web', 'public', 'data', 'kcc')
OFFLINE = '--offline' in sys.argv
TODAY = time.strftime('%Y-%m-%d', time.gmtime())
VINT = '2026-10 (KCC 1.0)'

NIGER_DELTA = ['Abia', 'Akwa Ibom', 'Bayelsa', 'Cross River', 'Delta', 'Edo', 'Imo', 'Ondo', 'Rivers']
NORTH_ZONES = ['North Central', 'North East', 'North West']


def hav(a, b):
    r = 6371.0088
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def tri(lo, ce, hi, unit, source, vintage=VINT, assumed=True, **extra):
    return {'low': lo, 'central': ce, 'high': hi, 'unit': unit, 'source': source, 'vintage': vintage, 'assumed': assumed, **extra}


def build_places():
    seed = json.load(open(os.path.join(ROOT, 'data', 'kcc-places-seed.json')))['places']
    out, missing = [], []
    for p in seed:
        c = nr.cached(f"{p['name']}-{p['state']}")
        if c is None and not OFFLINE:
            c = nr.resolve(p['name'], p['state'])
        if c is None or not c.get('coords'):
            missing.append(p['id'])
            continue
        out.append({**p, 'lat': c['coords']['lat'], 'lon': c['coords']['lon'], 'zone': c['zone']['value'],
                    'resolver': c['coords']['resolver'], 'nipost_status': c['nipost']['status'], 'cache_file': 'data/nipost-cache/' + nr.slug(f"{p['name']}-{p['state']}") + '.json'})
    return out, missing


def osrm_table(places):
    coords = ';'.join(f"{p['lon']},{p['lat']}" for p in places)
    url = f'https://router.project-osrm.org/table/v1/driving/{coords}?annotations=distance'
    req = urllib.request.Request(url, headers={'User-Agent': nr.UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read().decode())
    if d.get('code') != 'Ok':
        raise RuntimeError('OSRM table: ' + str(d.get('code')))
    return d['distances']


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    pj, rj = os.path.join(OUTDIR, 'places.json'), os.path.join(OUTDIR, 'routes.json')
    if OFFLINE and os.path.exists(pj) and os.path.exists(rj):
        places = json.load(open(pj))['places']
        routes = json.load(open(rj))
        missing = []
    else:
        places, missing = build_places()
        dist = osrm_table(places)
        ids = [p['id'] for p in places]
        km = []
        for i, row in enumerate(dist):
            km.append([None if (v is None or i == j) else round(v / 1000.0, 1) for j, v in enumerate(row)])
        routes = {'schema': 'kcc-routes/1', 'built': TODAY, 'ids': ids, 'km': km,
                  'method': 'OSRM public demo server table service, driving profile, OpenStreetMap data (ODbL 1.0)',
                  'note': 'km[i][j] is road km from ids[i] to ids[j]; null = same place or OSRM could not route (quoted by Haversine x winding)'}
        json.dump({'schema': 'kcc-places/1', 'built': TODAY, 'zones_note': 'zone derived from state by KCC, not by NIPOST', 'places': places}, open(pj, 'w'), indent=1, ensure_ascii=False)
        json.dump(routes, open(rj, 'w'))
    # winding factor derived from our own table
    byid = {p['id']: p for p in places}
    ratios = []
    for i, a in enumerate(routes['ids']):
        for j, b in enumerate(routes['ids']):
            v = routes['km'][i][j]
            if v and i < j:
                s = hav((byid[a]['lat'], byid[a]['lon']), (byid[b]['lat'], byid[b]['lon']))
                if s > 30:
                    ratios.append(v / s)
    ratios.sort()
    q = lambda f: ratios[min(len(ratios) - 1, int(f * len(ratios)))]
    wind = (round(q(0.10), 2), round(statistics.median(ratios), 2), round(q(0.90), 2))
    src_w = f'derived from this build\'s own OSRM table: 10th percentile / median / 90th percentile of road km over Haversine km, {len(ratios)} routed pairs over 30 km'

    model = {
      'schema': 'kcc-model/1', 'version': 'KCC 1.0', 'built': TODAY,
      'honesty': 'Every parameter is an ESTIMATE: {low, central, high, unit, source, vintage, assumed}. Products of three or four bands make a wide band on purpose. Negotiation-planning ranges, not quotes.',
      'rate_anchor_usd_per_km': {
        'value': 2.43, 'unit': 'USD per loaded container-truck km', 'verified': False, 'assumed': False,
        'source': 'tralac, "Transportation costs and efficiency in West and Central Africa" (https://www.tralac.org/discussions/article/9364-transportation-costs-and-efficiency-in-west-and-central-africa.html), figure and 1.5 to 2.2x multiple as stated in the KCC build brief. NOT re-verified in this build: a web search did not surface the figure and the page fetch was blocked.',
        'vintage': 'not confirmed (cited as tralac / World Bank WCA corridor evidence)'},
      'sa_us_multiple': {'low': 1.5, 'high': 2.2, 'unit': 'x South Africa / US per-km cost', 'source': 'same as anchor (build brief); verified: false', 'vintage': 'not confirmed', 'assumed': False,
                         'implied_sa_us_usd_per_km': [round(2.43 / 2.2, 2), round(2.43 / 1.5, 2)]},
      'rate_band_multiplier': tri(0.75, 1.0, 1.40, 'x anchor', 'KCC analyst assumption: Nigeria sits inside the WCA average but corridors differ; the spread is a stated judgement, not measured'),
      'anchor_applies_to': 'one loaded truck-km on a container/articulated truck; the commodity payload turns truck-km into tonne-km (assumption: container-truck km and commodity-truck km cost the same before the vehicle factor)',
      'winding_factor': tri(wind[0], wind[1], wind[2], 'road km / straight-line km', src_w, TODAY, False),
      'routed_distance_band': tri(0.95, 1.0, 1.10, 'x OSRM km', 'KCC analyst assumption: free OSRM profile ignores road quality, ferries and detours around insecurity'),
      'min_effective_km': {'value': 50, 'unit': 'km', 'source': 'KCC analyst assumption: very short hauls still cost a minimum trip (waiting, positioning)', 'vintage': VINT, 'assumed': True},
      'corridor_factor': {
        'niger_delta_feeder': tri(1.00, 1.15, 1.35, 'x', 'KCC analyst assumption: creek, security and checkpoint friction when both ends are Niger Delta states and the leg is under 250 km'),
        'port_hinterland': tri(1.00, 1.10, 1.30, 'x', 'KCC analyst assumption: port-gate queues and tanker/truck call-up systems when either end is a port'),
        'north_long_haul': tri(0.95, 1.10, 1.30, 'x', 'KCC analyst assumption: insecurity and escort costs when either end is in a northern zone'),
        'inland_default': tri(0.90, 1.00, 1.15, 'x', 'KCC analyst assumption: baseline for all other legs'),
        'rule': 'the class with the highest central factor that applies is used (one class per quote)'},
      'road_condition_proxy': {
        'South South': tri(1.00, 1.10, 1.25, 'x', 'KCC analyst assumption (PROXY): no measured road-condition data in the bundle; wet-zone road wear'),
        'South East': tri(1.00, 1.08, 1.20, 'x', 'KCC analyst assumption (PROXY)'),
        'default': tri(1.00, 1.05, 1.15, 'x', 'KCC analyst assumption (PROXY)'),
        'rule': 'worse of the two endpoint zones by central value; labelled a proxy, never a measurement'},
      'niger_delta_states': NIGER_DELTA, 'north_zones': NORTH_ZONES,
      'fx_ngn_per_usd': {'value': 1500, 'unit': 'NGN per USD', 'source': 'PLACEHOLDER reference rate chosen by KCC. No FX feed is bundled and none was checked in this build. Press reports in 2026 cite rates near 1,600 (unverified). Override with ?fx=', 'vintage': VINT, 'assumed': True},
      'rounding': 'USD figures are rounded to the nearest USD 1 per tonne (and to 2 decimals per km) so a band is never shown with false precision',
    }
    json.dump(model, open(os.path.join(OUTDIR, 'model.json'), 'w'), indent=1, ensure_ascii=False)
    print('places', len(places), 'unresolved', missing, '| routed pairs', len(ratios), '| winding', wind)


if __name__ == '__main__':
    main()
