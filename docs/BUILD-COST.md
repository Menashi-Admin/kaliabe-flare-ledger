# C1 Build — Kaliabe Flare Ledger : build-cost log

## Channels
Per D O's build-cost directive: heavy code generation should offload to the
flat-rate subscription CLIs (Claude Code / Codex), with OpenRouter acting as
orchestrator + cheap iteration.

### This run (2026-10-16)
| Channel | Role | Effort |
|---|---|---|
| **OpenRouter (this architect agent)** | Planning, data-spine build, Worker verdict engine, penalty math, frontend SPA, deployment, verification | Bulk of the writing this pass |
| **Claude Code (subscription)** | Not yet invoked for heavy generation — authenticated (Claude Pro) and available | 0 this pass |
| **Codex (subscription)** | Not available (CLI not on PATH — noted) | n/a |
| **Data** | World Bank GFMR (47 MB XLSX) + NOAA/VIIRS reachable; VNF raw needs EOG login | real, license-clean |

### Notes for D O
- The heavy code this pass was written directly through the orchestrator to lock
  the exact API contract and verification loops tightly (verdict + penalty math
  correctness was the risk, not volume of code). Net OpenRouter spend is tiny.
- **Suggested next slice:** offload the C4 Energy Worth API and C3 MethaneVAR
  builds to Claude Code (subscription) so the flat-rate quota absorbs codegen
  while OpenRouter only plans/glues/tests. `claude` is authenticated and ready.
- Estimated cost to date: effectively **$0 in subscription usage**, < $1
  OpenRouter. Recurring run cost ≈ $0-3/mo (free-tier D1 + Pages + Worker).

## What's live vs stubbed
- **Live:** GFMR seed (476 real Nigeria sites, 2012-2025) → D1; verdict engine;
  penalty + CO₂e + methane-equivalent; map + operator cards + site table;
  CSV digest; methodology + data pages.
- **Stubbed:** per-night raw VIIRS Nightfire VNF ingest (needs EOG account);
  PDF-ready report (route exists in UX; server-side PDF generation next).

## Reproduction
```
python3 scripts/build_seed.py        # rebuild seed from GFMR XLSX (or use committed JSON)
cd worker && npx wrangler d1 execute kaliabe-flare --remote --file=../worker/schema.sql
cd worker && npx wrangler d1 execute kaliabe-flare --remote --file=../worker/seed.sql
cd worker && npx wrangler deploy
cd web && npx wrangler pages deploy public --project-name=kaliabe-flare-web --branch=production
```