# NIPOST cache schema (kcc-place-cache/1)

One JSON file per resolved place or postcode, written by `scripts/nipost_resolver.py`.
This directory is the derived place grid: ours, bundled, reproducible. The live API is
never needed at quote time.

| Field | Meaning |
|---|---|
| `query` | `{name, state, postcode}` as asked |
| `resolved_at` | UTC date of the lookup |
| `nipost.status` | `ok`, `not_attempted_no_postcode`, `not_attempted_no_api_key`, or `failed: ...` |
| `nipost.*` | on `ok`: validity (Lookup L1, free), state and LGA codes decoded from the postcode; `administrative_address` only if credits were allowed (L2) |
| `coords` | `{lat, lon, resolver, method, osm_ref, licence}`; null if unresolved. Currently OpenStreetMap Nominatim (ODbL) by place name and state, because NIPOST coordinates are Lookup L5 only |
| `zone` | geopolitical zone, derived from state by KCC (not by NIPOST) |

Honesty: as built on 2026-10-18 no NIPOST API key was available, so every entry here came
from the place-name fallback and `nipost.status` says so. The NIPOST path is written from
the published docs and has not been run against the live service.
