import json

with open('/home/ubuntu/kaliabe-flare-ledger/data/gfmr_nigeria_sites_seed.json') as f:
    sites = json.load(f)

schema = """
-- Kaliabe Flare Ledger schema
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS flare_sites (
  site_id      TEXT PRIMARY KEY,
  lat          REAL NOT NULL,
  lon          REAL NOT NULL,
  operator     TEXT,
  field_name   TEXT,
  field_type   TEXT,
  location     TEXT,            -- ONSHORE / OFFSHORE
  in_niger_delta INTEGER DEFAULT 0,
  source       TEXT DEFAULT 'GFMR/WorldBank',
  first_year   INTEGER,
  last_year    INTEGER
);

CREATE TABLE IF NOT EXISTS flare_annual (
  site_id      TEXT NOT NULL,
  year         INTEGER NOT NULL,
  flaring_vol_m3 REAL,
  bcm          REAL,
  mmscfd       REAL,
  PRIMARY KEY (site_id, year)
);
"""

tables = schema.split("CREATE TABLE")[1:]

with open('/home/ubuntu/kaliabe-flare-ledger/worker/schema.sql', 'w') as f:
    f.write(schema)

# Build D1-seeding SQL (with --file requires individual statements; wrap with BEGIN/COMMIT not needed for d1 execute)
lines = []
lines.append("DELETE FROM flare_annual;")
lines.append("DELETE FROM flare_sites;")

for s in sites:
    operator = (s.get('operator') or '').replace("'", "''")
    field_name = (s.get('field_name') or '').replace("'", "''")
    field_type = (s.get('field_type') or '').replace("'", "''")
    loc = (s.get('location') or 'ONSHORE')
    nd = 1 if s.get('in_niger_delta') else 0
    sql = (f"INSERT INTO flare_sites (site_id,lat,lon,operator,field_name,field_type,location,in_niger_delta,source,first_year,last_year) "
           f"VALUES ('{s['site_id']}',{s['lat']},{s['lon']},'{operator}','{field_name}','{field_type}','{loc}',{nd},'GFMR/WorldBank',{s['first_year']},{s['last_year']});")
    lines.append(sql)
    for yr, vol in s['annual_vol_m3'].items():
        bcm = vol / 1e6  # million m3 -> bcm
        # mmscfd: vol (million m3/yr) -> scfd. 1 m3 = 35.3147 scf. million m3/yr -> scf/yr -> /365
        mmscfd = vol * 1e6 * 35.3147 / 365 / 1e6 if vol else 0
        lines.append(f"INSERT INTO flare_annual (site_id,year,flaring_vol_m3,bcm,mmscfd) VALUES ('{s['site_id']}',{yr},{vol},{round(bcm,8)},{round(mmscfd,4)});")

with open('/home/ubuntu/kaliabe-flare-ledger/worker/seed.sql', 'w') as f:
    f.write("\n".join(lines) + "\n")

print("schema.sql and seed.sql written")
print("queries:", len(lines), "sites:", len(sites))