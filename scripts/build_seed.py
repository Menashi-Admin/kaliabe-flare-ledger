import json
from collections import defaultdict
import math

with open('/tmp/gfmr_nigeria_sites.json') as f:
    sites = json.load(f)

# Niger Delta bounding box for "Niger Delta view" emphasis
# Niger Delta roughly lon 4.5..8.5, lat 4.5..7.0
def in_niger_delta(lon, lat):
    try:
        return 4.5 <= float(lon) <= 8.5 and 4.5 <= float(lat) <= 7.0
    except Exception:
        return False

# Build a clean per-site summary for seeding
seed = []
for s in sites:
    yrs = s['years']
    years_sorted = sorted(yrs.keys(), key=int)
    vol_m3_by_year = {}
    max_vol = 0
    last_vol = 0
    oldest = None
    for y in years_sorted:
        rec = yrs[y]
        v = rec['flaring_vol_m3'] or 0
        vol_m3_by_year[int(y)] = v
        if v > max_vol:
            max_vol = v
        last_vol = v
    # trend: compare 5-yr average (recent) vs earlier
    yints = sorted([int(y) for y in yrs.keys()])
    recent = [vol_m3_by_year[y] for y in yints if y >= max(2018, yints[-1]-4)]
    earlier = [vol_m3_by_year[y] for y in yints if y < max(2018, yints[-1]-4)]
    avg_recent = sum(recent)/len(recent) if recent else 0
    avg_earlier = sum(earlier)/len(earlier) if earlier else 0
    if avg_earlier > 0:
        trend = round((avg_recent-avg_earlier)/avg_earlier, 4)
    else:
        trend = 0.0

    seed.append({
        'site_id': s['id'],
        'lat': s['lat'],
        'lon': s['lon'],
        'operator': (s.get('operator') or 'Unattributed').strip(),
        'field_name': (s.get('field_name') or '').strip(),
        'field_type': (s.get('field_type') or '').strip(),
        'location': (s.get('location') or 'ONSHORE').strip(),
        'in_niger_delta': in_niger_delta(s['lon'], s['lat']),
        'first_year': int(min(yint for yint in yints)),
        'last_year': int(max(yint for yint in yints)),
        'annual_vol_m3': {k: round(v,2) for k,v in vol_m3_by_year.items()},
        'latest_year_vol_m3': round(last_vol,2),
        'max_year_vol_m3': round(max_vol,2),
        'trend_pct': trend,
    })

seed.sort(key=lambda x: -x['latest_year_vol_m3'])
nd = [s for s in seed if s['in_niger_delta']]
print("total sites:", len(seed))
print("niger-delta sites:", len(nd))
print("total latest-year volume (m3):", round(sum(s['latest_year_vol_m3'] for s in seed),2))
print("operators:", len(set(s['operator'] for s in seed)))
print("\nTop 10 by latest-year volume:")
for s in seed[:10]:
    print(f"  {s['site_id']} {s['operator']} {s['field_name']} lat={s['lat']} lon={s['lon']} vol2025ish={s['latest_year_vol_m3']} trend={s['trend_pct']} nd={s['in_niger_delta']}")

with open('/tmp/flare_seed.json','w') as f:
    json.dump(seed, f)
print("\nwritten /tmp/flare_seed.json", len(seed))