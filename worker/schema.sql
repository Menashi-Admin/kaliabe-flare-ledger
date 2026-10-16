
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
