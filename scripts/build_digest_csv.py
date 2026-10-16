#!/usr/bin/env python3
"""Rebuild web/public/kaliabe-flare-digest.csv (static snapshot) from the committed
seed, with the same columns and units as the Worker's /api/digest.csv.
GFMR volumes are MILLION m3; bcm = million m3 / 1e3; MMscfd = million m3/yr * 35.3146667 / 365."""
import csv, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sites = json.loads((ROOT / "data" / "gfmr_nigeria_sites_seed.json").read_text())
out = ROOT / "web" / "public" / "kaliabe-flare-digest.csv"
with out.open("w", newline="") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(["site_id", "lat", "lon", "operator", "field_name", "field_type", "location",
                "in_niger_delta", "year", "flaring_vol_million_m3", "bcm", "mmscfd"])
    n = 0
    for s in sorted(sites, key=lambda s: s["site_id"]):
        for y, v in sorted(s["annual_vol_m3"].items(), key=lambda kv: int(kv[0])):
            v = v or 0
            w.writerow([s["site_id"], s["lat"], s["lon"], s["operator"], s["field_name"], s["field_type"],
                        s["location"], 1 if s["in_niger_delta"] else 0, y, round(v, 2),
                        round(v / 1e3, 6), round(v * 35.3146667 / 365, 4)])
            n += 1
print("rows:", n, "->", out)
