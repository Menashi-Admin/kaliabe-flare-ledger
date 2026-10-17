# Build record — KFL-M 1.3 enrichment (live & opportunity)

Pass of 2026-10-17, led by Claude Code (Opus 5.5) against `docs/BUILD-BRIEF-ENRICH.md`. Built in order
B → C → A → D.

## What shipped

| Part | Fields (API `/api/sites`, per site) | Source | Status |
|---|---|---|---|
| **B. Population** | `pop5km` `pop10km` `pop25km` `pop50km` `nearest_settlement` `nearest_settlement_lga` `nearest_settlement_pop` `dist_km` `main_centre_25km` `main_centre_25km_pop` `main_centre_25km_dist_km` `state` `state_basis` | GRID3 NGA Population v3.0 (100 m), GRID3 Settlement Points — CC BY 4.0 | real, all 476 sites |
| **C. Power gap** | `gas_available_GWh` `electric_potential_MW` `households_servable` `people_within_10km_not_grid` `rural_access_proxy_pct` `rural_access_basis` `gap_label` = estimate; `national.opportunity`, `operators[].opportunity` | WDI + NDHS 2023-24; assumptions in `meta.constants.gap` | real inputs, labelled estimates |
| **A. Live thermal** | `live_last_seen` `live_nights_detected` `live_window_nights` `live_nights_detected_pct` `live_mean_bright_ti4_K` `live_mean_frp_MW` `live_detected_24h` `live_site_burning` `live_status` `live_flag` | NASA FIRMS VIIRS 375 m NRT | real first snapshot; daily GitHub Action |
| **D. Security** | `sec_lga` `sec_lga_12m` `sec_area25_12m` `sec_area50_12m` `sec_trend` `sec_trend_detail` `sec_point_status`; `sec_events_10km/25km/50km` = null | ACLED monthly events by LGA (HDX) + OCHA COD-AB | LGA aggregates real; point counts pending a myACLED account |

## Example values (production, 2026-10-17)

- **Oso** (s_3987, ExxonMobil, offshore, nearest state Rivers):
  - Population: pop10km 0 · pop50km 939,704 · nearest settlement Obianga (Eastern Obolo), 20.6 km.
  - Generation opportunity: 3,084 GWh/yr → 141 MW → 870,000 households.
  - Live: burning, 5/8 nights (62.5%), bright_ti4 324.7 K, FRP 4.41 MW, **flagged "under-report (live check) — investigate"**.
  - Security: flat.
- **Egbema West** (s_4041a, NEPL, Imo):
  - Population: pop10km 120,915 · pop50km 5,582,677 · nearest settlement Ase Imeonite, 6.2 km.
  - Generation opportunity: 2,849 GWh/yr → 130 MW → 810,000 households → 79,000 people within 10 km
    without access (Imo proxy 34.3%).
  - Live: not detected in the 8-night window.
  - Security: Ohaji/Egbema LGA; 27 political-violence events and 59 fatalities in the 25 km LGA area
    (2025-10 … 2026-09); trend flat.
- **Odidi** (s_3941, NEPL, Delta):
  - Generation opportunity: 2,124 GWh/yr → 97 MW → 600,000 households → 5,300 people within 10 km
    without access.
  - Live: burning 62.5%, flagged.
  - Security: rising (12 vs 7 events).
- **National opportunity:** 66,015 GWh/yr · 3,014 MW · 19 million households. 24 sites live-burning,
  55 detected in the last 24 h, 8 flagged.

## Scheduler

`.github/workflows/live-thermal.yml`:
- runs at 06:30 UTC daily, plus `workflow_dispatch`;
- runs `scripts/live_thermal.py` (stdlib only) and commits `web/public/data/live/`.

The Worker fetches the committed `live_thermal.json` from raw.githubusercontent.com with a 15-minute cache.
It falls back to the snapshot bundled at deploy time, and reports which one it used in
`meta.enrichment.live.origin`. The refresh needs no redeploy and no Cloudflare secret.

## Honest gaps

- **ACLED point events:** need a myACLED account, so the per-site radius counts are null and marked
  pending. The `--api` path is written but untested against the live API. The
  `data/samples/acled_point_sample_SYNTHETIC.csv` fixture is invented, used for `--self-test` only.
- **State rural access:** derived (state rate × national rural/total), because no rural-by-state figure
  is published.
- **Manual refreshes:** population, access and security are refreshed by hand plus a Worker redeploy.
