"""Mini-grid siting inputs (KFL-M 1.5): solar resource at every flare site.

The siting score itself is derived in the Worker by the shared core
(web/public/js/ledger-core.js, core.siting), from the same per-site record
/api/sites serves: grid access gap, gas-to-power potential, population demand
and security posture. The one input the tracker did not already hold is the
solar resource, for the hybrid solar + gas term. This script fetches it and
writes web/public/data/siting.json, which the Worker bundles like
pop_demand.json and security.json.

Source: Global Solar Atlas 2 (World Bank / ESMAP, data by Solargis), CC BY 4.0.
Per-site long-term annual averages from the Atlas point service
(api.globalsolaratlas.info/data/lta?loc=lat,lon):
  GHI        global horizontal irradiation, kWh/m2 per year
  PVOUT_csi  specific PV output of a crystalline-silicon system at optimum
             tilt, kWh/kWp per year

Why not the KTH "Solar Potential" GHI file on energydata.info named in the
build brief: its download sits behind a browser challenge, so it cannot be
fetched reproducibly by a script. The Atlas is the World Bank's own solar
dataset under the same licence, so it is used instead and labelled as such.
The 2.7 GB world GeoTIFF would also work but is a compressed zip member that
must be streamed from the start, so the point service is the light path.

Responses are cached under data/cache/gsa_ghi/ (git-ignored); a re-run only
fetches sites that are missing. Offshore sites are sampled too (the Atlas
covers near-shore water) but the siting score gates offshore sites out.

Usage: python3 scripts/build_siting.py [--refresh]
"""
import datetime as dt
import hashlib
import json
import os
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, 'data/gfmr_nigeria_sites_seed.json')
OUT = os.path.join(ROOT, 'web/public/data/siting.json')
CACHE = os.path.join(ROOT, 'data/cache/gsa_ghi/points')
API = 'https://api.globalsolaratlas.info/data/lta?loc={lat:.5f},{lon:.5f}'
UA = 'KaliabeFlareTracker/1.5 (+https://flaretracker.kaliabe.ng; open-data research)'
PAUSE_S = 0.6


def fetch(lat, lon):
    req = urllib.request.Request(API.format(lat=lat, lon=lon), headers={'User-Agent': UA, 'Accept': 'application/json'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
        except Exception as e:  # network blip or rate limit: back off and retry
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))


def main():
    refresh = '--refresh' in sys.argv
    os.makedirs(CACHE, exist_ok=True)
    seed = json.load(open(SEED))
    sites, layer_meta, digest, fetched, missing = {}, None, hashlib.sha256(), 0, []
    for s in sorted(seed, key=lambda x: x['site_id']):
        path = os.path.join(CACHE, s['site_id'] + '.json')
        if refresh or not os.path.exists(path):
            raw = fetch(s['lat'], s['lon'])
            json.loads(raw)  # refuse to cache anything that is not JSON
            with open(path, 'wb') as f:
                f.write(raw)
            fetched += 1
            time.sleep(PAUSE_S)
        raw = open(path, 'rb').read()
        digest.update(raw)
        d = json.loads(raw).get('annual', {})
        data = d.get('data') or {}
        ghi, pv = data.get('GHI'), data.get('PVOUT_csi')
        if not isinstance(ghi, (int, float)) or ghi <= 0:
            missing.append(s['site_id'])
            sites[s['site_id']] = {'ghi_kwh_m2_yr': None, 'ghi_kwh_m2_day': None, 'pvout_kwh_kwp_yr': None}
            continue
        layer_meta = layer_meta or d.get('metadata', {}).get('layers', {})
        sites[s['site_id']] = {
            'ghi_kwh_m2_yr': round(ghi, 1),
            'ghi_kwh_m2_day': round(ghi / 365, 2),
            'pvout_kwh_kwp_yr': round(pv, 1) if isinstance(pv, (int, float)) else None,
        }

    vals = sorted(v['ghi_kwh_m2_day'] for v in sites.values() if v['ghi_kwh_m2_day'] is not None)
    ghi_layer = (layer_meta or {}).get('GHI', {})
    pv_layer = (layer_meta or {}).get('PVOUT_csi', {})
    out = {
        'meta': {
            'generated': dt.date.today().isoformat(),
            'script': 'scripts/build_siting.py',
            'solar': {
                'dataset': 'Global Solar Atlas 2, long-term annual averages (GHI, PVOUT)',
                'publisher': 'World Bank / ESMAP; solar resource data by Solargis',
                'licence': 'CC BY 4.0',
                'service': 'https://api.globalsolaratlas.info/data/lta?loc={lat},{lon}',
                'site': 'https://globalsolaratlas.info',
                'layer_version': ghi_layer.get('version'),
                'layer_updated': ghi_layer.get('updated'),
                'period_to': (ghi_layer.get('period') or {}).get('to'),
                'pvout_method': pv_layer.get('method'),
                'retrieved': dt.date.today().isoformat(),
                'responses_sha256': digest.hexdigest(),
                'points': len(sites) - len(missing),
                'missing': missing,
                'range_ghi_kwh_m2_day': [vals[0], vals[-1]] if vals else None,
                'attribution': 'Global Solar Atlas 2.0, a free, web-based application developed and operated by Solargis s.r.o. on behalf of the World Bank Group, utilizing Solargis data, with funding provided by ESMAP.',
                'substitution': 'The build brief named the KTH Solar Potential GHI file on energydata.info; its download is behind a browser challenge and cannot be fetched by a script, so the World Bank Global Solar Atlas (same licence) is used instead.',
            },
            'method': 'Point value at the flare coordinate (no buffer). GHI kWh/m2/day = annual kWh/m2 / 365.',
        },
        'sites': sites,
    }
    with open(OUT, 'w') as f:
        json.dump(out, f, separators=(',', ':'), ensure_ascii=False)
    print(f'wrote {OUT}: {len(sites)} sites, {fetched} fetched, {len(missing)} missing, GHI/day range {out["meta"]["solar"]["range_ghi_kwh_m2_day"]}')


if __name__ == '__main__':
    main()
