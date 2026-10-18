# Development Guide

How to work on the Kaliabe Flare Ledger so you can add features consistently without
breaking the honesty guarantees.

## Mental model

Three layers, three rules:

1. **Worker (`worker/src/index.js`)** — the *source of truth for numbers*: penalty, CO₂e,
   confidence, verdict, trend, percentiles, forecast. Derivation lives here.
2. **Static layers (`web/public/layers/*.geojson`)** — geometry we ship, not query: states, LGAs,
   pipelines.
3. **Client (`web/public/js/`) — presentation and interaction.** `atlas.js` is the overlay
   engine; `ledger-core.js` is the shared maths (also referenced where the Worker briefs need it).

**Rule of thumb:** if a number could be used by an API consumer OR should be the same in a brief
and on the page, derive it in the Worker (or in `ledger-core.js`), never ad hoc in markup.

## The workflow that keeps it coherent

1. **Change one thing at a time.** The docs (`METHODOLOGY.md`, `FEATURE-SET.md`) lock the contract.
   If you're adding a feature, add the spec item first (or reference the existing one).
2. **Regenerate, don't hand-edit.** Data → `scripts/*` → D1. Layer files are produced by
   `fetch_layers*.py` + `compact_layers.py`. If you tweak a GeoJSON by hand it will be overwritten
   and no one will know.
3. **Verify with the scripts before you claim done.**
   - `validate_sources.py` — all sources reachable.
   - The live HTTP checks pattern in the build records (the Opus output files) — re-run the
     relevant ones for any change.
4. **Commit with a real message.** `git commit -m "KFL-M 1.3: <what> — <why>"`. The KFL-M
   version in the API and methodology page tracks the method; bump it on any data/method change.

## Adding a new data layer (e.g. OML blocks, power plants)

1. Find a license-clean source (open / CC-BY / public domain). Add it to `docs/DATA-LICENCES.md`
   and the registry.
2. Add a fetcher in `scripts/fetch_layers*.py` (or a new script) that downloads + clips to the
   Nigeria bbox, then run `compact_layers.py`.
3. Wire it into the AtLaS layer panel in `atlas.js` (legend, count, licence line).
4. Add the validator entry in `scripts/validate_sources.py`.
5. Test on a preview deploy, then production.

## Adding a decision-layer feature (from FEATURE-SET.md)

The roadmap in `docs/FEATURE-SET.md` sequences features by value per unit of effort. When you pick
one:

1. Skim the Wave it belongs to. If it creates a new metric (e.g. abatement economics, EU threshold
   check), add the derivation to the Worker first (single pass, labelled), expose it, then
   present it in the UI.
2. For new filters/thresholds, add them to the `THRESHOLDS` block in `ledger-core.js` and explain
   them on the methodology page.
3. Every feature ends in a decision, cites its source, and labels estimates. If it can't, it
   doesn't ship.

## Standing up the stack fresh

See README "Reproduce it" and `ARCHITECTURE.md`. In short:

```bash
# data
python3 scripts/build_seed.py
python3 scripts/fetch_layers.py && python3 scripts/fetch_layers2.py && python3 scripts/compact_layers.py
python3 scripts/gen_sql.py
python3 scripts/build_siting.py        # solar inputs for /api/siting (KFL-M 1.5)
node scripts/build_invest.mjs          # offline /api/invest run + stress tests -> data/invest*.json (KFL-M 1.6)
python3 scripts/build_digest_csv.py
python3 scripts/build_blog.py
python3 scripts/validate_sources.py

# worker + d1
cd worker && npx wrangler d1 execute kaliabe-flare --remote --file=../worker/schema.sql
cd worker && npx wrangler d1 execute kaliabe-flare --remote --file=../worker/seed.sql
cd worker && npx wrangler deploy

# web — a `main`-branch deploy IS production (Pages project production_branch = main)
cd web && npx wrangler pages deploy public --project-name=kaliabe-flare-web --branch=main
```

Prefer `--local` D1 and a preview Pages deploy first, then production. When about to put
something live, confirm you are actually on `main` and at the commit you intend to ship:
`git branch --show-current` must read `main` and `git status` must be clean.

## Branching & deployment (the rule that keeps testing off production)

- `<Pages project>.pages.dev` has **`production_branch = main`**. It is NOT connected to a Git
  remote, so the GitHub Action pushing to `main` never auto-deploys — production changes only
  happen through an **explicit** `wrangler pages deploy --branch=main` or with the modern
  flagless form from a `main` checkout.
- **All work happens on a branch off `main`.** Never edit on `main` for a change you are still
  testing. Branch, verify in `--local` / a Pages *preview* deploy, then merge to `main` and
  deploy `--branch=main` when it is actually ready to ship.
- A `wrangler pages deploy` without `--branch` while `HEAD` is *not* `main` publishes a
  **preview** deployment and cannot touch the `main` production route — that is the safety
  rail that keeps a testing push from going live.
- The scheduled `live-thermal` GitHub Action writes to `main` (data files only, via its own bot
  commit). It runs `validate_sources.py` in CI on push and never deploys Pages; it is the one
  write-to-`main` exception and is intentional.
- Rule in one line: **feature branch to work, merge to main to release, deploy is explicit.**

## Gotchas

- **Fresh shells:** `~/.npm-global/bin` (for npx/wrangler) is only on PATH after `source
  ~/.bashrc`. Use `source ~/.bashrc &&` or the full path.
- **Native Ubuntu, not WSL.** No `/mnt/c` paths.
- **Disk check before installing** anything new.
- **Prismor** may block agent builds on prompt-injection / db-modification; that's a guardrail,
  not a bug. Use a scoped `prismor allow ... --expires Nh` for your own repo briefs.
- **A stale D1 column** exists from an earlier pass; nothing reads it. Do not build on it.
- **The Niger Delta flag** comes from point-in-polygon against the nine-state union
  (`worker/src/niger-delta.json`), not from D1.