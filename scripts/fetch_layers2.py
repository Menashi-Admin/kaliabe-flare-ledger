#!/usr/bin/env python3
"""Fetch additional overlay layers: ADM2 (LGAs), rivers, and population context.
Appends to the same manifest."""
import json, urllib.request, urllib.parse
from pathlib import Path

OUT = Path("/home/ubuntu/kaliabe-flare-ledger/web/public/layers")
OUT.mkdir(parents=True, exist_ok=True)
mp = OUT.parent / "layers-manifest.json"
MANIFEST = json.loads(mp.read_text()) if mp.exists() else []

def fetch(url, timeout=120):
    req = urllib.request.Request(url, headers={"User-Agent": "kaliabe-flare-ledger/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def save(name, data, source, license_, note=""):
    p = OUT / name
    p.write_text(json.dumps(data))
    n = len(data.get("features", []))
    MANIFEST[:] = [m for m in MANIFEST if m["file"] != name]
    MANIFEST.append({"file": name, "bytes": p.stat().st_size, "features_or_bytes": n,
                     "source": source, "license": license_, "note": note})
    print(f"OK  {name:32s} {p.stat().st_size/1024:8.1f} KB  features={n}")

# ADM2 — LGAs
try:
    url = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/NGA/ADM2/geoBoundaries-NGA-ADM2_simplified.geojson"
    save("nga-lgas.geojson", json.loads(fetch(url)),
         "geoBoundaries gbOpen NGA ADM2 (GRID3)", "CC BY 4.0", "Local Government Areas")
except Exception as e:
    print("FAIL lgas:", e)

# Rivers (Natural Earth 10m, public domain) — clip to Nigeria bbox
try:
    url = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson"
    gj = json.loads(fetch(url, timeout=180))
    def in_ng(coords):
        def pt(c): return 2.5 <= c[0] <= 14.7 and 4.0 <= c[1] <= 14.0
        if isinstance(coords[0], (int, float)): return pt(coords)
        return any(in_ng(c) for c in coords)
    feats = [f for f in gj.get("features", []) if in_ng(f.get("geometry", {}).get("coordinates", []))]
    save("nga-rivers.geojson", {"type": "FeatureCollection", "features": feats},
         "Natural Earth 10m rivers/lake centerlines", "Public domain", "clipped to Nigeria bbox")
except Exception as e:
    print("FAIL rivers:", e)

mp.write_text(json.dumps(MANIFEST, indent=2))
print("\nmanifest files:", [m["file"] for m in MANIFEST])
