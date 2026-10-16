# Deployed Cloudflare references (C1)
- Account: Menashiconsulting@gmail.com's Account — id `81ef1e9fd8bae6b8771f020149a763fd`
- D1 database `kaliabe-flare` — uuid `3fb2bfee-90b9-4a6d-8c1a-3ab6fdf87f16`
- Worker `kaliabe-flare` — https://kaliabe-flare.menashiconsulting.workers.dev
- Pages project `kaliabe-flare-web` (prod branch `production`) — https://kaliabe-flare-web.pages.dev
- Zone `menashi.dev` — id `43dfd281d1f74506c4134ebada233bba` (no prod cutover; preview only)
- CF API token scopes confirmed: account:read, workers:*, d1:write, pages:write, zone:read, ssl_certs:write
  (user-level /user/tokens/verify returns Invalid — but all account-scoped deploy actions work; wrangler verified.)