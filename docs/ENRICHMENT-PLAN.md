# Data enrichment plan — live feed, security/OSINT, and the generation gap

*KFL-M 1.3 feature research — Enrichment. Every source below was reachability-tested 2026-10-17
and the licence row is authoritative. Nothing proprietary is ingested.*

## TL;DR

The Ledger currently proves *a site flared and how much*. The business-development layer
turns each site into a **monetisable opportunity brief**: the flared gas as free fuel, the
nearby population as demand, the electrification deficit as the market gap, and the live
satellite thermal + conflict OSINT as the current-ground-truth overlay.

Four capability adds, mapped to sources:

| Capability | Primary source | Lic / cost | Reachability 17 Oct |
|---|---|---|---|
| **A. Live flare thermal (temperature satellite)** | NASA FIRMS — VIIRS-375m C2 active-fire NRT | Open (NASA data); free | **VERIFIED** (110,303 detections in global 24h, `bright_ti4` K + FRP MW) |
| **B. Population centres + demand** | GRID3 NGA Population v3.0 (Aug 2025) / WorldPop | CC-BY 4.0 | **VERIFIED** (tile service live) |
| **C. Power infrastructure + access gap** | World Bank/ESMAP "Tracking SDG7"; NBS/NERC; WRI GPPD v1.3 (cross-check) | Open / CC-BY | GPPD **VERIFIED** (34,936 plants; NGA undercounted → cross-check only) |
| **D. Security & OSINT overlay** | ACLED (Nigeria) event data | Open with myACLED account | HDX package discoverable (register to pull) |

## A. Live flare thermal — "is it burning now?"

NASA FIRMS serves near-real-time VIIRS-375m active-fire/hotspot detections as CSV by day. Each
row: lat, lon, `bright_ti4` (K, hot pixel), `frp` (fire radiative power, MW), acq_date/time,
satellite, confidence, day/night. Flares show as stable, very-high-`bright_ti4`, day/night
persistent hot pixels — distinguishable from bush fires by conf_id and high FRP density.

**Build:** a scheduled Worker job (or Pages cron trigger) pulls the Nigeria-region 24h file each
day, filters to the flare site bounding circles, and stores a per-site "live/last-seen, on 100%
of clear nights, mean bright_ti4, mean FRP". This upgrades the year-archive verdict with a
**current ground-truth check**: a site the archive says is falling but is still burning bright on
50%+ of nights is flagged as under-reported. This is the "we check, live, that nobody can hide
it" claim made true.

## B. Population centres — the demand side

GRID3 Nigeria Population v3.0 (published Aug 2025, Bayesian-modelled, 100 m grid, UN-WPP 2025
scaled, CC-BY 4.0) is the authoritative settlement/population layer. WorldPop is the same lineage.

**Build:** for every flare site, precompute the nearest population centre(s) and the population
within 5/10/25/50 km (from the 100 m grid). Store as site attributes: `pop10km`, `pop50km`,
`nearest_settlement`, `dist_km`. Gazette-dark but population-light is the strongest signal: a
flare with 200k people within 10 km and no grid access is a prime mini-grid / gas-to-power site.

## C. Power infrastructure + access gap — the market gap

- **Inject AT LEAST the state/national access rates** (verified sources below), so each site
  carries an "electrified vs not" expected-demand context:
  - National grid access ~59%, urban ~89%, **rural ~33%** (World Bank / USAID, via PMI/NERC).
  - ~85–105 million Nigerians without grid/household electricity (NBS DHS-based estimates).
  - Oil-producing, largely rural states (Bayelsa, Rivers, Delta, Akwa Ibom) sit at the low end
    of the rural access rate.
- **WRI GPPD v1.3** as a cross-check layer (34,936 plants CC-BY): it undercounts Nigeria's
  off-grid gas fleet, so it is wired as **"known grid plants (WRI) — not exhaustive"**, never
  as definitive.

**Build — the gap math (the deal number).** Per site, compute:
- `gas_available_GWh` = flared m³ × 0.010 MWh/m³ (thermal HHV) — i.e. the fuel currently wasted/yr;
- `electric_potential_MW` = gas_available / 8760 × ~40% (simple-cycle) — the generator size the
  flare could fuel;
- `households_servable` = electric_potential × 8760 × CF ÷ consumption_assumption (state-aware);
- `people_within_10km_not_grid` = pop10km × (1 − state_rural_access) — the addressable market.

This is the "clear gap and pipeline for generation" the client asks to showcase: named sites,
named amounts of wasted fuel, named population left in the dark, and the MW + consumer count it
could serve.

## D. Security / OSINT overlay — de-risking the opportunity

ACLED Nigeria (Africa-file, updated weekly Monday) records conflict events, riots, strategic
developments, explosions, armed clashes with geolocation, dates, actors, fatalities. This is the
credible OSINT base for "is it safe to build / operate there, and has it been getting safer?"

**Build:** 
- Precompute per-site security posture: events within 10/25/50 km, split by event type, with a
  12-month trend ("attacks declining / flat / rising"), stored as `sec_posture` + counts.
- Overlay ACLED event clusters on the map (toggleable), so a prospective partner can see the
  flare, the people, the grid, and the security posture on one screen.
- Citation + data vintage on every security figure (ACLED requires attribution).

Extra OSINT (strengthen, not core): NUPRC/NNPC news, licence/block boundaries, movement of the
Niger Delta Development Commission projects. Kept in a registry, not ingested.

## Roadmap placement

This is **Wave 2** on the FEATURE-SET roadmap: intensity + abatement economics + **EU threshold
check** + **supplier scorecard** + (new) the four enrichment layers above. Build order:
**B (population) → C (gap math) → A (live thermal) → D (security)** — B+C deliver the deal, A
makes it live/verifiable, D de-risks it.

## Constraints (kept)

- Open / CC-BY / NASA-open data only. ACLED needs an account but is freely licensed for
  non-commercial monitoring — confirm commercial-reuse intent before shipping D prominently.
- Source registry + validator (`scripts/validate_sources.py`) must cover every new source.
- Live thermal and ACLED refresh = scheduled. Must stay on the free/baseline Cloudflare tier or
  a GitHub Action cron; no new recurring bill without a client paying for it.
- Every enrichment figure carries vintage + source + licence line, per the honesty rules.