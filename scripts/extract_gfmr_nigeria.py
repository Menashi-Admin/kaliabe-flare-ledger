import openpyxl
import json
import sys

# Nigeria bounding box (rough)
NIG_LAT_MIN, NIG_LAT_MAX = 3.5, 14.0
NIG_LON_MIN, NIG_LON_MAX = 2.5, 14.5

path = sys.argv[1]
wb = openpyxl.load_workbook(path, read_only=True)
ws = wb['Dashboard_file']
rows = ws.iter_rows(values_only=True)
header = next(rows)  # id,lat,lon,Country,BCM,MMSCFD,Year,Field type,Operator,Field name,Location,Flare Level,Flaring Vol
print("header:", header)

nigeria_sites = {}  # site_id -> aggregated
records = []
count = 0
nig_count = 0
for r in rows:
    count += 1
    site_id, lat, lon, country = r[0], r[1], r[2], r[3]
    if not country:
        continue
    c = str(country).strip()
    # Country is "Nigeria"
    if c.lower() != 'nigeria':
        continue
    nig_count += 1
    records.append({
        'id': site_id,
        'lat': lat, 'lon': lon,
        'bcm': r[4], 'mmscfd': r[5], 'year': r[6],
        'field_type': r[7], 'operator': r[8], 'field_name': r[9],
        'location': r[10], 'flare_level': r[11], 'flaring_vol_m3': r[12]
    })

print("total rows:", count, "nigeria rows:", nig_count)

with open('/tmp/gfmr_nigeria_rows.json', 'w') as f:
    json.dump(records, f)

# aggregate per site_id -> operator, field, geo, years series
from collections import defaultdict
agg = defaultdict(lambda: {
    'id': None, 'lat': None, 'lon': None, 'field_type': None,
    'operator': None, 'field_name': None, 'location': None,
    'years': {}
})
for rec in records:
    sid = rec['id']
    a = agg[sid]
    a['id'] = sid
    a['lat'] = rec['lat']; a['lon'] = rec['lon']
    if rec['field_type']: a['field_type'] = rec['field_type']
    if rec['operator'] and str(rec['operator']).strip() not in ('NA',''): a['operator'] = rec['operator']
    if rec['field_name'] and str(rec['field_name']).strip() not in ('NA',''): a['field_name'] = rec['field_name']
    if a['location'] in (None, 'NA') and rec['location'] and str(rec['location']).strip() not in ('NA',''): a['location'] = rec['location']
    a['years'][str(rec['year'])] = {
        'bcm': rec['bcm'], 'mmscfd': rec['mmscfd'],
        'flaring_vol_m3': rec['flaring_vol_m3'], 'flare_level': rec['flare_level']
    }

sites = list(agg.values())
print("unique nigeria sites:", len(sites))
with open('/tmp/gfmr_nigeria_sites.json', 'w') as f:
    json.dump(sites, f)

# sample operators
from collections import Counter
ops = Counter(s['operator'] for s in sites if s.get('operator'))
print("operators found:", len(ops))
for o, n in ops.most_common(20):
    print(f"  {o}: {n}")