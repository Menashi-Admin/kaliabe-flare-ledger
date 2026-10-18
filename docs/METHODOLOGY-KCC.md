# KCC methodology: Kaliabe Commodity Cost Tracker

**Method version KCC 1.0 (2026-10-18).** A separate surface from the Flare Tracker. It has its own version line and does not change KFL-M (see `docs/METHODOLOGY.md`, which stays the KFL-M document; this file is the KCC equivalent of it).

> **Honesty.** Every number is an ESTIMATE carrying `{value or low/central/high, unit, source, vintage, assumed}`. These are negotiation-planning ranges, not quotes. We report a band, never a single implied-exact number. Where data is thin we say so and fall back openly.

### Change log

| Version | Date | Change |
|---|---|---|
| **KCC 1.0** | 2026-10-18 | First release. Commodity table (13 rows), 30-place grid, OSRM road-km table, owned rate model, `/api/kcc/quote`, `kcc.html`, NIPOST resolver layer (schema and fallback built, live NIPOST not reached). |

## 1. Question and output

"Roughly what does it cost to move commodity X from Y to Z in Nigeria?" The answer is a low / central / high cost per tonne in USD (plus naira at a stated placeholder FX rate, per truckload and per typical unit), the distance and how it was obtained, and every input behind it.

## 2. The rate model

Per quote, in USD, each term a triple (low, central, high):

```
rate   = anchor x band x vehicle_factor                 (USD per truck-km)
haul   = rate x km_eff x corridor x road_condition / payload      (USD per tonne)
total  = haul + handling                                   (USD per tonne)
km_eff = max(km, 50)
```

Low combines every low input **and the highest payload**; high combines every high input **and the lowest payload**. The band is therefore a conservative envelope, not a confidence interval. It is wide (roughly 5x low-to-high on long hauls) on purpose.

Parameters are in `web/public/data/kcc/model.json` (built by `scripts/build_route_table.py`) and `data/commodities.json` (built by `scripts/build_commodities.py`). The quote code is `worker/src/kcc.js`; it holds no constants.

### 2.1 Freight anchor

| Item | Value | Status |
|---|---|---|
| WCA road freight cost | US$2.43 per loaded container-truck km | **Cited, not re-verified here.** tralac, "Transportation costs and efficiency in West and Central Africa" (https://www.tralac.org/discussions/article/9364-transportation-costs-and-efficiency-in-west-and-central-africa.html), as stated in the KCC build brief. In this build a web search did not surface the figure and a page fetch was blocked by a security hook, so the number and its year are unconfirmed. |
| WCA versus South Africa / US | 1.5 to 2.2x | Same citation, same caveat. Implied SA/US cost about US$1.10 to 1.62 per km (arithmetic on the anchor). Shown for context; not used in the quote. |
| Band multiplier on the anchor | 0.75 / 1.00 / 1.40 | **Assumed.** Nigeria sits inside the WCA average but corridors differ. A stated judgement, not measured. |
| Anchor applies to | one loaded truck-km | **Assumed.** Container-truck km and commodity-truck km cost the same before the vehicle factor. |

SSATP corridor surveys and UNCTAD landlocked-transport literature are named in the brief as further anchors. They were **not** used in 1.0: no figures from them are in the model. Adding them is the first improvement (section 9).

### 2.2 Distance

1. **Routed road distance.** `scripts/build_route_table.py` calls the OSRM public demo server (`router.project-osrm.org`, table service, driving profile, OpenStreetMap data, ODbL 1.0) once for the whole place grid and stores km for every pair in `routes.json`. Band: 0.95 / 1.00 / 1.10 x routed km (**assumed**; the free profile ignores road quality, ferries, insecurity detours). Quote label: "routed road distance".
2. **Fallback.** Where a pair has no routed value (or the user gives a free `lat,lon` point), distance is Haversine x a **winding factor derived from our own OSRM table**: 10th percentile / median / 90th percentile of road km over straight-line km across all routed pairs over 30 km. Built 2026-10-18: **1.19 / 1.30 / 1.44** from 430 pairs. Quote label: "straight line times winding factor". The factor is data-derived (`assumed: false`) but describes this 30-place grid, not every Nigerian road.
3. **Floor.** `km_eff` is at least 50 km (**assumed**): a very short haul still costs a minimum trip.

Known OSRM limits: the public demo server has no uptime or accuracy guarantee and the profile can route over ferries or unfinished links. The Bonny to Port Harcourt value (91 km) should be read with that in mind. We did not verify individual routes on the ground.

### 2.3 Corridor factor (one class per quote, the highest central that applies)

| Class | Rule | Low / central / high | Status |
|---|---|---|---|
| niger_delta_feeder | both ends in a Niger Delta state (Abia, Akwa Ibom, Bayelsa, Cross River, Delta, Edo, Imo, Ondo, Rivers) and central km under 250 | 1.00 / 1.15 / 1.35 | assumed |
| port_hinterland | either end is a port | 1.00 / 1.10 / 1.30 | assumed |
| north_long_haul | either end in North Central / East / West | 0.95 / 1.10 / 1.30 | assumed |
| inland_default | otherwise | 0.90 / 1.00 / 1.15 | assumed |

### 2.4 Road-condition factor (a proxy)

No measured road-condition data is bundled. The factor is a **proxy by geopolitical zone**, labelled as such, taking the worse of the two ends: South South 1.00 / 1.10 / 1.25; South East 1.00 / 1.08 / 1.20; all others 1.00 / 1.05 / 1.15. All assumed.

### 2.5 Commodity inputs (`data/commodities.json`)

For each of 13 commodities (bagged cement, bulk cement, clinker, gas condensate, crude oil by road tanker only, NPK, urea, palm oil, soya, rice, maize, steel rebar, diesel/AGO):

- **Density** band, kg/m3. Standard engineering reference values, `assumed: false`, but **not re-fetched from a primary source in this build** (`verified_in_build: false`). The model prices by mass, so density is informational.
- **Typical unit and unit mass** (bag, drum, litre, tonne): trade convention.
- **Typical truckload** band in tonnes (about 25 to 36 t for bagged and dry, 18 to 33 t for tankers). **Assumed**: no open Nigerian survey was found.
- **Handling class**: loading plus offloading USD per tonne band (about 0.8 to 7), and a **vehicle factor** (tanker and pneumatic bodies 1.05 to 1.35 versus flatbed 1.0). Both **assumed**.

Crude oil is modelled as road-tanker haul only. Most Nigerian crude moves by pipeline and barge; this is not a pipeline or barge tariff.

### 2.6 FX and rounding

Naira figures use **1,500 NGN per USD, a placeholder** (`assumed: true`): no FX feed is bundled and none was checked in this build. A user may pass `?fx=`. USD per tonne is rounded to the nearest dollar, naira to the nearest 100.

## 3. Georeferencing: NIPOST layer

Brief: NIPOST Digital Postcode API (`api.postcode.gov.ng`, docs `docs.postcode.gov.ng`) as state, LGA, locality, zone layer.

What was established on 2026-10-18 (from the published docs, fetched that day):
- **Every endpoint needs an API key**, including Search and Lookup L1 (free of credits, not free of authentication). An unauthenticated call returns `auth_required`. No NIPOST key exists on this machine, so **no live NIPOST call was made, no credits were spent, and the NIPOST code path is untested against the live service.**
- Lookup **L1 returns validity only**. The administrative address (state, LGA, locality, zone) is **L2, which spends credits**. Coordinates are **L5 only**.
- The postcode format itself encodes state (`AA`) and LGA (`99`); names come from the free `reference/states` and `reference/lgas` lists.

What was built (`scripts/nipost_resolver.py`): postcode first (L1 plus free reference lists; L2 only behind an explicit `allow_credits` flag, default off), then place name plus state fallback via OpenStreetMap Nominatim (ODbL) for coordinates. Zone is derived from state by us (six geopolitical zones) and labelled so. Every resolution is cached to `data/nipost-cache/<slug>.json` (schema in `data/nipost-cache/SCHEMA.md`). All 30 current entries came from the **place-name fallback**, and each says `nipost.status: not_attempted_no_postcode`. The quote API therefore rejects a postcode with `422 postcode_not_in_bundle` and asks for a place name; it never invents a resolution.

To switch the layer on: set `NIPOST_API_KEY` (a free test key resolves a small sandbox of public places only; a live key needs verified KYB), add postcode rows to the place seed, and re-run `scripts/build_route_table.py`.

## 4. The place grid

30 places chosen for Niger Delta, ports, cement plants and major demand centres (`data/kcc-places-seed.json`). Coordinates are Nominatim place centroids, rounded to 4 decimals; a place centroid is not a loading yard. A quote is between centroids, so very short or intra-city legs are the least reliable.

## 5. What is not modelled

Fuel price as a live input, tolls and checkpoint payments as separate lines, empty return legs beyond what the anchor embeds, demurrage, season, security escorts beyond the corridor proxy, rail, barge, pipeline, cross-border legs, insurance, customs. Each can move the real price materially.

## 6. Reproducibility and ownership

- `python3 scripts/build_commodities.py`, then `python3 scripts/build_route_table.py` (needs network for first run; `--offline` rebuilds the model from existing files), then `node scripts/kcc_reference.mjs` (writes `data/kcc-quotes-reference.json`; `--check` fails on any drift).
- Quotes are deterministic from bundled JSON. We own the derived dataset (place grid, route table, commodity table, cache), not an API subscription.
- Licences: code and tables MIT. Road distances and place centroids derive from OpenStreetMap (ODbL 1.0, attribution required). NIPOST data would be government of Nigeria data under NIPOST terms; none is bundled yet.

## 7. API

`GET /api/kcc/quote?from=..&to=..&commodity=..[&fx=..]` (also `/kcc/quote` on the Worker origin). On the Pages site only `/api/*` is proxied, so the page uses `/api/kcc/quote`. `GET /api/kcc/meta` lists places and commodities. `from`/`to`: place id, `Name, State`, or `lat,lon`.

## 8. Known weaknesses

1. The anchor figure is cited from the brief and not re-verified; its year is unknown.
2. Nearly every adjustment factor is an analyst assumption. The band widths are judgement.
3. Road distance comes from a free public router with no guarantees.
4. The place grid is small (30) and centroid based.
5. No NIPOST live resolution yet.
6. No back-test against real haulier invoices; none were available. This is the largest open gap.

## 9. Next improvements

Back-test against real invoices or open tariff schedules (NARTO, Shippers' Council); add SSATP corridor figures; verify and date the tralac anchor; live FX; open-data road-condition layer; NIPOST key and postcode rows; a self-hosted OSRM or OpenRouteService key.
