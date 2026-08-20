# Session handoff

Last updated: 2026-08-20. This is a living "pick up here" doc — overwrite it (don't
accumulate dated copies) whenever a session ends mid-thread on something worth
resuming cleanly.

## Where things stand right now

**Open issue: eBay's OAuth token endpoint 500s specifically for requests from
Hostinger's server.** The exact same request (same code, same credentials) succeeds
from every other network tested. This has been under investigation across several
sessions, first surfacing during the "Ready to Publish" push-to-eBay work.

**What's confirmed, as of this session:**
- Not a malformed-request problem — the code already builds the request exactly the
  way it should (`URLSearchParams`, correct `Content-Type`, correct Basic auth).
- Not a client-library bug — tested with two independent HTTP clients from the
  server itself (Node's `fetch` and a raw `curl` process via
  [`/sync/diagnose`](../src/routes/sync.js)); both get the identical `500
  server_error`.
- Not a dropped connection / pre-emptive block — both responses carry real eBay
  backend headers (`server: ebay-proxy-server`, Akamai CDN, `x-ebay-pop-id`, a real
  `rlogid`, `x-envoy-upstream-service-time` showing actual processing time). The
  request reaches eBay's backend and gets a deliberate rejection there.
- Current best theory: eBay's backend is reacting to Hostinger's outbound IP
  specifically (shared-hosting IP ranges commonly get flagged by anti-abuse
  heuristics on API providers) — not a Hostinger network fault, and not something
  fixable in this app's code.

**Diagnostic tool** (built this session): `/sync/diagnose` on the live site — runs
the token request via both `fetch` and `curl` from wherever the server actually is,
shows sanitized status/headers/body for both, safe to copy into a support ticket.
Route: [src/routes/sync.js](../src/routes/sync.js). View:
[src/views/sync/sync-diagnose.ejs](../src/views/sync/sync-diagnose.ejs).

**Workaround in use:** run sync/publish actions from a local machine (or Claude
Code's Bash access) against production data directly
(`DB_CLIENT=pg DATABASE_URL=... APP_PUBLIC_URL=https://ops.rebootytreasures.com`),
bypassing Hostinger's network entirely. Still needed until the underlying issue is
resolved.

**eBay developer support is effectively unreachable** — Lucas's assessment, not
independently verified this session. Support-ticket effort is going to Hostinger
instead, on the theory that a dedicated/static outbound IP from them could sidestep
the problem even without eBay's involvement.

## Immediate next step

A Hostinger support ticket is drafted and ready to submit at
[docs/hostinger-ebay-500-support-ticket.md](hostinger-ebay-500-support-ticket.md).
**Lucas needs to submit this himself** — Claude doesn't log into third-party
accounts or enter credentials, so this can't be done end-to-end by the agent. Once
submitted, the next session should pick up by checking whether Hostinger has
responded and what they said.

The older draft at the repo root (`hostinger-support-ticket-draft.txt`, untracked,
not committed) is now superseded by the docs/ version and can be deleted once the
new one is submitted — it made a claim (missing `x-ebay-c-request-id` header) that
the newer curl-comparison evidence doesn't actually support.

## Other recent work (probably not relevant to the above, but recent)

The app's folder structure was reorganized this session — centralized env-var
config (`src/config/`), a global 404/error handler, views regrouped into
per-feature subfolders matching `routes/`, dead `scripts/` folder removed, and a
Node built-in test scaffold added (`npm test`). Fully shipped and verified both
locally and on the live site. See [DEPLOYMENT.md](../DEPLOYMENT.md) for how deploys
work and [README.md](../README.md) for the current layout.
