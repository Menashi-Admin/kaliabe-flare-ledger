#!/usr/bin/env python3
"""Fetch license-clean geospatial layers for the Kaliabe Flare Ledger overlay.
Writes GeoJSON into web/public/layers/ (served statically by Pages).
All sources open / CC-BY / public-domain. Prints a manifest.
"""
import json, os, sys, urllib.request, urllib.parse
from pathlib import Path

OUT = Path("/home/ubuntu/kaliabe-flare-ledger/web/public/layers")
OUT.mkdir(parents=True, exist_ok=True)
MANIFEST = []

def fetch(url, timeout=90):
    req = urllib.request.Request(url, headers={"User-Agent": "kaliabe-flare-ledger/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def save(name, data, source, license_, note=""):
    p = OUT / name
    if isinstance(data, (dict, list)):
        p.write_text(json.dumps(data))
        n = len(data.get("features", [])) if isinstance(data, dict) else len(data)
    else:
        p.write_bytes(data)
        n = len(data)
    MANIFEST.append({"file": name, "bytes": p.stat().st_size, "features_or_bytes": n,
                     "source": source, "license": license_, "note": note})
    print(f"OK  {name:32s} {p.stat().st_size/1024:8.1f} KB  features={n}")

# 1. Nigeria state boundaries (geoBoundaries gbOpen ADM1, GRID3, CC-BY 4.0)
try:
    url = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/NGA/ADM1/geoBoundaries-NGA-ADM1_simplified.geojson"
    save("nga-states.geojson", json.loads(fetch(url)),
         "geoBoundaries gbOpen NGA ADM1 (GRID3)", "CC BY 4.0",
         "37 admin units; simplified geometry for web")
except Exception as e:
    print("FAIL nga-states:", e)

# 2. USGS/Africa oil & gas pipelines (ArcGIS feature service, USGS public domain)
try:
    base = "https://services7.arcgis.com/BucknellGIS/arcgis/rest/services/AFR_Infra_OG_Pipelines/FeatureServer/0/query"
    # try to discover the real service endpoint from the item
    item = json.loads(fetch("https://www.arcgis.com/sharing/rest/content/items/c2d2e59693b449cfbb370a3c2d6c3889?f=json"))
    url = item.get("url")
    print("pipelines item url:", url)
    if url:
        # probe for the layer index
        layers = json.loads(fetch(url.rstrip("/") + "?f=json")).get("layers", [])
        print("pipelines layers:", [(l.get("id"), l.get("name")) for l in layers])
        lid = layers[0]["id"] if layers else 0
        q = (url.rstrip("/") + f"/{lid}/query?" + urllib.parse.urlencode({
            "where": "1=1", "outFields": "*", "f": "geojson",
            "geometry": "2.5,4.0,14.7,14.0", "geometryType": "esriGeometryEnvelope",
            "inSR": "4326", "spatialRel": "esriSpatialRelIntersects", "outSR": "4326"}))
        save("nga-pipelines.geojson", json.loads(fetch(q)),
             "USGS AFR_Infra_OG_Pipelines (Cross-border Information)", "USGS public domain",
             "clipped to Nigeria bbox")
    else:
        raise RuntimeError("no service url")
except Exception as e:
    print("FAIL pipelines:", e)

(OUT.parent / "layers-manifest.json").write_text(json.dumps(MANIFEST, indent=2))
print("\nmanifest ->", OUT.parent / "layers-manifest.json")
print(json.dumps(MANIFEST, indent=2))
