# Contributing

Thanks for wanting to improve the Kaliabe Flare Ledger. The project is a public-good
record of flaring in Nigeria, and it stays honest only because contributors push
back on the data, the method and the code.

## Ground rules

1. **Honesty over polish.** Every number must trace to a source. If a figure relies on an
   estimate, say so. Never "we catch all leaks" — nobody does.
2. **No fabricated data.** If a source is unreachable or licence-ambiguous, stub it and flag it.
   Do not invent a value to make a chart look complete.
3. **Open data only.** We ingest open, revocable-by-nobody sources. Proprietary monitoring
   (Kayrros, GHGSat, Enverus) is studied, never ingested.
4. **Derivation stays in one place.** Conversion maths and scenario logic live in
   `web/public/js/ledger-core.js`, shared by the site and the Worker so they cannot disagree.
   If you change a conversion, change it there (and the Worker's own copy if one exists).
5. **Keep run cost at zero.** Prefer print-to-PDF, hand-rolled SVG, free tiers. Do not add a
   service or dependency that creates a recurring bill.

## How to contribute

- **Report a data issue** — a wrong citation, a misattributed site, a bad number. Open an issue
  with the site/field and what you believe is wrong, ideally with a source link.
- **Report a bug** — describe the expected vs actual, and how to reproduce. A failing test helps.
- **Add a feature** — read `docs/FEATURE-SET.md` for the roadmap and its build order. Propose the
  change in an issue first so it fits the roadmap rather than colliding with it.
- **Improve a threshold or filter** — see the `THRESHOLDS` block in `web/public/js/ledger-core.js`
  and its explanation in `docs/METHODOLOGY.md`. Keep defaults documented; explain why any new
  floor exists.

## Development workflow

1. **Work on a branch off `main`. Never do a change you are still testing directly on `main`.**
   `main` is the production branch (Pages `production_branch = main`) — anything merged to
   `main` is a release candidate. Feature branches are where testing happens.
2. Services: Cloudflare Worker + D1 (`worker/`), Cloudflare Pages (`web/`). Local dev via
   `npx wrangler dev --local` in `worker/` (seed from `worker/seed.sql`).
3. Reproduce data locally first — the data flow is in `ARCHITECTURE.md` and the commands are in
   the README's "Reproduce it" section.
4. Verify in a **preview** deploy first (deploy from your feature branch). A Pages deploy only
   reaches production when made explicitly with `--branch=main` from a clean `main` checkout.
   See `docs/DEVELOPMENT.md → Branching & deployment`.
5. Open a PR against `main`. Link the issue it closes and, for data-affecting changes, the
   sources you used. After merge to `main`, deploy production explicitly.

## Verification expectations for a PR

- `python3 scripts/validate_sources.py` passes (all sources reachable, checksums match).
- No NaN in any API response you touch.
- If you changed thresholds: state the new defaults and the effect (e.g. how many sites now
  qualify as rising) in the PR description.
- If you changed the penalty or emissions maths: show the before/after for a named site (Oso is
  the canonical example) and cite the regulation or report.

## Code of conduct

Be constructive. This is a public record about real communities and real companies; a
disagreement about a number is a reason to dig, not to snipe. Assume good faith.

## Project status / contact

See the README for live status. This is a Kaliabe project. For anything not suited to a public
issue, open a discussion and a maintainer will respond.