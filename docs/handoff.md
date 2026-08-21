# Session handoff

Last updated: 2026-08-21. This is a living "pick up here" doc — overwrite it (don't
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
- Confirmed outbound IP for the hosting account: `212.1.209.194` (captured live via
  the diagnostic tool, consistent across three separate runs).
- Hostinger support's first reply (received 2026-08-20/21) agreed the request
  reaches eBay and eBay is what returns the 500, but called the IP-reputation theory
  unproven and asked for: timestamps of several failed requests, non-sensitive
  headers/status/body, confirmation of cross-network success, and an explicit ask
  about the account's outbound IP / dedicated IP availability. All of that is now in
  the revised ticket (see below).

**Diagnostic tool** (built this session, extended in the same session): `/sync/diagnose`
on the live site — runs the token request via both `fetch` and `curl` from wherever
the server actually is, plus a live outbound-IP check (via api.ipify.org), shows
sanitized status/headers/body for both, safe to copy into a support ticket. Route:
[src/routes/sync.js](../src/routes/sync.js). View:
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

A revised Hostinger support ticket reply is ready to submit at
[docs/hostinger-ebay-500-support-ticket.md](hostinger-ebay-500-support-ticket.md) —
this is the reply to Hostinger's follow-up questions (see above), with three real
timestamped fetch+curl runs, the confirmed outbound IP, and the account name
corrected to "Sean_Lucas". **This needs to be submitted by hand** — Claude doesn't
log into third-party support portals or enter credentials. Once sent, the next
session should pick up by checking whether Hostinger has replied again (particularly
on the dedicated-IP question, which is the most likely actual fix if the
IP-reputation theory holds).

The older draft at the repo root (`hostinger-support-ticket-draft.txt`, untracked,
not committed) is now fully superseded and safe to delete — it predates both the
curl-comparison test and Hostinger's own follow-up questions.

## Other recent work (probably not relevant to the above, but recent)

The app's folder structure was reorganized this session — centralized env-var
config (`src/config/`), a global 404/error handler, views regrouped into
per-feature subfolders matching `routes/`, dead `scripts/` folder removed, and a
Node built-in test scaffold added (`npm test`). Fully shipped and verified both
locally and on the live site. See [DEPLOYMENT.md](../DEPLOYMENT.md) for how deploys
work and [README.md](../README.md) for the current layout.
