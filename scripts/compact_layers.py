#!/usr/bin/env python3
"""Compact overlay GeoJSON for the web: round coordinates to 5 dp (~1 m) and
drop properties the map never reads. Geometry topology is unchanged.
Idempotent — safe to re-run after fetch_layers*.py. Updates layers-manifest.json."""
import json
from pathlib import Path

PUB = Path(__file__).resolve().parent.parent / "web" / "public"
KEEP = {
    "nga-states.geojson": ["shapeName", "shapeISO"],
    "nga-lgas.geojson": ["shapeName"],
    # USGS: DsgAttr01 commodity, 02 origin, 03 destination, 04 length (km; matches Shape__Length/1000), Shape__Length metres
    "nga-pipelines.geojson": ["FeatureUID", "DsgAttr01", "DsgAttr02", "DsgAttr03", "DsgAttr04", "Shape__Length"],
}

def rnd(c):
    if isinstance(c[0], (int, float)):
        return [round(c[0], 5), round(c[1], 5)]
    return [rnd(x) for x in c]

mp = PUB / "layers-manifest.json"
manifest = json.loads(mp.read_text())
for name, keep in KEEP.items():
    p = PUB / "layers" / name
    gj = json.loads(p.read_text())
    for f in gj["features"]:
        f["properties"] = {k: f["properties"].get(k) for k in keep}
        f["geometry"]["coordinates"] = rnd(f["geometry"]["coordinates"])
    p.write_text(json.dumps(gj, separators=(",", ":")))
    for m in manifest:
        if m["file"] == name:
            m["bytes"] = p.stat().st_size
            m["features_or_bytes"] = len(gj["features"])
    print(f"{name:24s} {p.stat().st_size/1024:8.1f} KB  features={len(gj['features'])}")
for m in manifest:
    if m["file"] == "nga-pipelines.geojson":
        m["note"] = "clipped to Nigeria bbox; attribute source: Cross-border Information (London) Ltd. / African Energy Live Data, via USGS"
mp.write_text(json.dumps(manifest, indent=2))
