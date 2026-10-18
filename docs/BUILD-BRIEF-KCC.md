# BUILD BRIEF — Kaliabe Commodity Cost Tracker (KCC-T)

## Product
An open, MIT, evidence-grade web tool that answers one question in plain terms:
**"How much roughly does it cost to move commodity X from place Y to destination Z in Nigeria?"**

Owners, traders, hauliers and logistics planners get a rough-but-sourceable landed-cost
estimate built on a fully owned, transparent methodology — not a black-box rate API.

Distinctive layers (from the Kaliabe frontier research):
1. **NIPOST Digital Postcode API** as the georeferencing layer (state→LGA→locality→zone).
2. **Owned freight-rate model** derived from citable open sources + explicit assumptions,
   never an opaque third-party transport API.
3. **Commodity table** keyed to things that actually move in Niger Delta / Nigeria
   (cement, clinker, bagged cement, gas condensate, crude, fertilizer, palm oil, soya,
   rice, maize, steel/rebar, fuel/AGO) — each with density, unit, typical truckload.

## Core architecture
- **Input layers (all owned/derivable):**
  - Origin + destination: accept a NIPOST postcode *or* a place name + state. Resolve via
    the NIPOST Postcode API (Search + Lookup L1 are free, no credits; test keys free and
    unmetered). Cache every resolved address so the derived place grid is ours.
  - Distance: ground on the Nigeria road network (OSM-derived). Use a free/open route
    (OSRM public / OpenRouteService) per corridor; where no hve route is reachable, fall
    back to Haversine × a documented winding factor. Distance method is labelled per quote.
- **Owned rate model (the core IP):**
  - Base long-haul trucking rate per tonne-km, stated as a band with a published anchor
    (e.g. the tralac/World-Bank evidence that WCA container costs average ~US$2.43/km,
    1.5–2.2× South Africa/US; SSATP corridor surveys) — NOT a hidden number.
  - Corridor adjustment factor (Niger Delta feeder, landlocked-neighbour, port-hinterland).
  - Handling/loading uplift per commodity; packaging factor for bagged vs bulk.
  - Road-condition factor (documented proxy where real condition data is absent — labelled
    estimate, never disguised as measured).
  - Result: **low / central / high estimate** per route-commodity, each figure labelled
    with its vintage + source + assumption. No single false-precision number.
- **Commodity table** (`commodities.json`): density, standard truckload (e.g. 30–40 t
  articulated, 20 ft/container equivalents), handling class. Seeded by open sources;
  each row carries a source pointer.

## Honesty rules (match the Flare Tracker standard)
- Every figure is an ESTIMATE and carries {value, unit, source, vintage, assumed}.
- Open/CC-BY/government sources only. NIPOST place data is government-of-Nigeria owned.
- No fake precision: report a band, never a single implied-exact number.
- If a route is un-routable or data-poor, say so and fall back transparently — never invent.
- Operational note mirroring the tracker: these are negotiation-planning ranges, not quotes.

## Ownership guarantees
- **Data:** we cache NIPOST resolutions + generate our own road-distance table + commodity
  table. We own the derived dataset, not a leased API subscription.
- **Methodology:** the rate model, all assumptions and all source vintages are published
  in the repo (`docs/METHODOLOGY.md`), same pattern as KFL-M.
- **Source of truth:** route + commodity lookup is deterministic from our bundled JSON, so
  quotes are reproducible by anyone — including the "I'll audit and Opus as well" standard.

## Deliverables
- `docs/BUILD-BRIEF-KCC.md` (this), `docs/METHODOLOGY.md`, `data/commodities.json`,
  `data/nipost-cache/`, `scripts/build_route_table.py`, `web/public/kcc.html` (house style),
  a `web/functions/api/[[path]].js` (or worker route) `/kcc/quote?from=..&to=..&commodity=..`.
- Open-source the commodity + methodology, keep the NIPOST cache as bundled JSON.
- `framework` version bump appears under a `KCC` changelog line (separate surface, do NOT
  touch Flare Tracker KFL-M versioning).

## Sequencing
Builds in flight: Flare Tracker KFL-M 1.5 (Mini-Grid Siting) — Opus is on it now
(`feat/siting-kflm-1.5`). This KCC-T is the NEXT build. Do not start Opus on two heavy
builds at once (max_in_progress=2). Wait for siting to merge, then run KCC-T the same way.

## Reference
- NIPOST API docs: docs.postcode.gov.ng (Quickstart/Authentication). Base https://api.postcode.gov.ng
- Rate anchors: tralac (WCA ~US$2.43/container-km, 1.5–2.2× SA/US); SSATP World Bank corridor surveys;
  UNCTAD landlocked-transport literature (available on request).
- Repo parent: `/home/ubuntu/kaliabe-flare-ledger` (house tokens, DEVELOPMENT.md discipline).