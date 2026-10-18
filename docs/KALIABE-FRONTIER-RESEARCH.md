# Kaliabe — Frontier Build Lane Research (2026-10-18)

Purpose: non-flare, Kaliabe-aligned open-source suite opportunities, seeded by the
Diamonds10 (Oxford / Haruna Inuwa) repos + associated energy/supply-chain open data.

## Confirmed live now (Build A done)
- **Energy-infrastructure incident layer** — already merged into the Flare Tracker as
  KFL-M 1.4. Per-site 10/25/50km attack counts, deaths, focus events. Oxford/Inuwa et
  al. 2026, CC BY, zenodo.org/records/15974757.

## Diamonds10 repos worth mining (all under /home/ubuntu if cloned)
| Repo | What it is | Licence | Kaliabe use |
|---|---|---|---|
| `geox_nigeria` | Geospatial commodity-cost model run for Nigeria (green H2, ammonia, cement demand centres). Snakefile + modular rules; weather, demand, technology, transport parameter XLSX per commodity. | MIT (2024, Climate Compatible Growth) | Cement/logistics supply-path cost curves for the industrial-energy report; carbon-credit MRV context. Strong base to fork into a **Nigeria industrial-energy cost atlas**. |
| `Quant_Energy_Infra` | Quantifies energy-infrastructure resilience: power topology, node betweenness-centrality hub scores, pipeline snapping, attacks-within-10km. Ships `power_exposure_report.csv` + `nodes_centralities.csv`. | no LICENSE file (assume research; confirm with author before reuse) | Directly extend the tracker's security layer with **hub-centrality** (which grid node failure cascades worst). Could become a resilience map on kaliabe.ng. |
| `EnergyInsight` | FastAPI backend + news scraper + frontend; energy-news aggregation front. | LICENSE present (check) | A public "Nigeria/continental energy signals" RSS digest page — low-effort, high-SEO companion to the Journal. |
| `data_in_brief_infradataset_Nigeria` | Source of Build A (incidents + crude-loss time series). | CC BY | Done. |

## Non-flare supply-chain lane (Kaliabe-aligned)
- **Liberia agri-commodity traceability** (aligned to EU Deforestation Regulation 2026-27
  deadlines) — a template for a **Nigeria commodity traceability tool** (cocoa, palm,
  soya) for export compliance + carbon-credit adjacency. Open-source eco: INATrace
  (open traceability), FAO Open Foris Ground, Trase (commodity supply-chain facilities
  open data).
- **geox_nigeria cement pathways** → an **industrial-commodity logistics cost tool**:
  "what does it cost to move cement/gas/fertiliser from source X to demand centre Y" —
  directly Kotter to the Dangote/cement industrial-hub data the tracker already touches.

## Prioritised shortlist for a Kaliabe open-source suite
1. **Resilience centrality overlay** (fork Quant_Energy_Infra into tracker as KFL-M 1.6) —
   highest reuse, direct product value.
2. **Nigeria industrial energy-cost atlas** (fork geox_nigeria, MIT) — differentiation,
   feeds carbon-credit + cement + energy prose.
3. **Energy signals RSS/lists page** (from EnergyInsight pattern) — SEO + Journal synergy.
4. **Commodity traceability tool** (INATrace/Trase pattern) — export-compliance wedge.

All four stay open-source, zero-run-cost, and extend the same house (kaliabe.ng + tracker)
rather than starting a new brand.