# Security Policy

## Reporting a vulnerability

The Kaliabe Flare Ledger processes public, open data only. It holds no credentials, no personal
data, and no operator secrets. Even so, a flaw in the Worker, Pages function, or a build script
should be reported privately.

**Do not open a public issue for a suspected vulnerability.** Use GitHub's private vulnerability
reporting (Security → Report a vulnerability) or contact a maintainer directly so we can act
before details are public.

## Scope in scope

- `worker/src/index.js` (the REST API and verdict engine)
- `web/functions/api/[[path]].js` (the same-origin proxy)
- `web/public/js/*` (client-side logic, XSS/SSRF surfaces)
- `scripts/*` (data ingestion, which touches external sources)
- Dependencies declared in `web/` and `worker/`

## Out of scope

- The public data itself is MIT/open and by design not protected; this is a public record.
- Deliberate absence of auth on the API is by design (read-only open data). Do not report its
  lack of authentication as a vulnerability.
- Absence of analytics/tracking is a feature, not a bug.

## Safe harbor

We will not pursue legal action against researchers who act in good faith, disclose privately,
avoid harming the service, and do not access data they should not (there is none to access).

## Dependency / supply-chain notes

The site pins versions where practical and prefers zero-runtime-dependency implementations
(hand-rolled SVG, print-to-PDF) precisely to reduce attack surface. New dependencies should be
justified in a PR against this policy.