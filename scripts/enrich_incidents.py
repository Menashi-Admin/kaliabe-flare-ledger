#!/usr/bin/env python3
"""Enrich the Flare Tracker security layer with incident-level energy infrastructure
attack data (2009-2025), Oxford / Haruna Inuwa et al., CC BY 4.0.

Data: https://zenodo.org/records/15974757  &  github.com/Diamonds10/data_in_brief_infradataset_Nigeria
Profile: category=list(enumerate(combined_energy_attacks_02.csv))
Fills the sec_events_Nkm fields that were pending a myACLED account, using energy-specific
attack incidents instead. Does not touch the ACLED LGA aggregates.
"""
from __future__ import annotations
import csv, json, math, sys
from datetime import datetime
from pathlib import Path

ROOT = Path("/home/ubuntu/kaliabe-flare-ledger")
SEED = ROOT / "data" / "gfmr_nigeria_sites_seed.json"
SECURITY = ROOT / "web" / "public" / "data" / "security.json"
ATTACKS = Path("/tmp/oxford_incident/combined_energy_attacks.csv")
RADII_KM = [10, 25, 50]
WINDOW_YEARS = 12  # match 12-month spirit but incident data is coarse-dated; use since cut

EARTH_R = 6371.0
def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * EARTH_R * math.asin(math.sqrt(a))

def load_attacks(path: Path):
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            try:
                lat = float((r.get("Latitude") or "").strip())
                lon = float((r.get("Longitude") or "").strip())
            except (ValueError, TypeError):
                continue
            if not lat or not lon:
                continue
            date_s = (r.get("Date") or "").strip()
            year = None
            try:
                year = int(datetime.strptime(date_s, "%d/%m/%Y").year)
            except (ValueError, TypeError):
                pass
            title = (r.get("Title") or "").strip()
            attack_type = (r.get("Attack_Type") or "").strip()
            lga = (r.get("LGA") or "").strip()
            state = (r.get("State") or "").strip()
            deaths = 0
            try:
                deaths = int((r.get("Total Deaths") or "0").strip() or 0)
            except (ValueError, TypeError):
                deaths = 0
            # actor presence (P columns)
            actors = [k.replace(" (P)","") for k in r.keys()
                      if k.endswith(" (P)") and (r.get(k) or "").strip() not in ("", "0")]
            rows.append({
                "lat": lat, "lon": lon, "year": year,
                "title": title, "attack_type": attack_type,
                "lga": lga, "state": state, "deaths": deaths,
                "actors": actors, "date": date_s,
                "sources": [s for s in [r.get("Sources 1"), r.get("Sources 2"), r.get("Sources 3")] if s],
            })
    return rows

def main() -> int:
    sites = json.loads(SEED.read_text())
    security = json.loads(SECURITY.read_text())
    attacks = load_attacks(ATTACKS)
    cutoff_year = datetime.now().year - WINDOW_YEARS + 1  # ~2015 onward for fresh window
    print(f"loaded {len(attacks)} attacks, {len(sites)} sites")
    print(f"recent window: {cutoff_year}-{datetime.now().year}")

    recent = [a for a in attacks if (a["year"] or 0) >= cutoff_year]
    print(f"attacks in window: {len(recent)}")

    for site in sites:
        sid = site["site_id"]
        entry = security.get("sites", {}).get(sid, {})
        hits = {"within_km": [], "items10": [], "items25": [], "items50": []}
        for a in recent:
            d = haversine_km(site["lat"], site["lon"], a["lat"], a["lon"])
            if d <= RADII_KM[-1]:
                hits["within_km"].append((d, a))
        by_radius = {}
        for km in RADII_KM:
            sel = [(d, a) for d, a in hits["within_km"] if d <= km]
            by_radius[km] = {
                "count": len(sel),
                "oil_gas": sum(1 for _, a in sel if a["attack_type"] == "Oil_Gas"),
                "power": sum(1 for _, a in sel if a["attack_type"] == "Power"),
                "deaths": sum(a["deaths"] for _, a in sel),
                "state": None,
                "recent": None,
            }
            states = {}
            for _, a in sel:
                s = a["state"].strip()
                if s:
                    states[s] = states.get(s, 0) + 1
            if states:
                by_radius[km]["state"] = max(states, key=states.get)
            recent_yr = [a["year"] for _, a in sel if a["year"]]
            if recent_yr:
                by_radius[km]["recent"] = max(recent_yr)

        incident = {
            "status": "live" if any(by_radius[k]["count"] for k in RADII_KM) else "clean",
            "energy_attacks_10km": by_radius[10]["count"],
            "oil_gas_10km": by_radius[10]["oil_gas"],
            "power_10km": by_radius[10]["power"],
            "energy_attacks_25km": by_radius[25]["count"],
            "energy_attacks_50km": by_radius[50]["count"],
            "deaths_25km": by_radius[25]["deaths"],
            "dominant_state": by_radius[25]["state"] or by_radius[50]["state"],
            "most_recent_attack_year": by_radius[25]["recent"] or by_radius[50]["recent"],
            "focus_events_10km": [
                {"title": a["title"][:80], "year": a["year"], "type": a["attack_type"], "src": a["sources"][0] if a["sources"] else None}
                for d, a in sorted(hits["within_km"], key=lambda t: t[0])[:3] if d <= 10
            ],
        }
        entry["incidents"] = incident

    security["meta"]["incidents"] = {
        "generated": datetime.now().strftime("%Y-%m-%d"),
        "script": "scripts/enrich_incidents.py",
        "source": "Oxford / Inuwa, Leonard, Hirmer 2026: Spatio-temporal dataset of energy infrastructure attacks in Nigeria (2009-2025). CC BY 4.0.",
        "source_url": "https://zenodo.org/records/15974757",
        "window": f"{cutoff_year}-now (12y)",
        "note": "Incident-level energy-infrastructure attack overlay (fills the point-radius fields previously pending a myACLED account). LGA ACLED aggregates untouched.",
        "total_attacks_loaded": len(attacks),
        "attacks_in_window": len(recent),
    }
    SECURITY.write_text(json.dumps(security, indent=1))
    print(f"wrote {SECURITY}")

    # quick summary of coverage
    live = sum(1 for s in security["sites"].values() if s.get("incidents", {}).get("status") == "live")
    top = max(security["sites"].items(), key=lambda kv: kv[1].get("incidents", {}).get("energy_attacks_25km", 0))
    print(f"sites with incidents within 25km: {live}")
    print(f"top site: {top[0]} n={top[1]['incidents']['energy_attacks_25km']} state={top[1]['incidents']['dominant_state']}")
    return 0

if __name__ == "__main__":
    sys.exit(main())