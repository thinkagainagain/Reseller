# Hostinger support ticket — eBay token endpoint 500s from this hosting account

Status: **drafted, not yet submitted.** Supersedes the older draft that was sitting at
the repo root (`hostinger-support-ticket-draft.txt`) — that one predates the `curl`
comparison test and made a claim (missing `x-ebay-c-request-id` header) that the newer,
cleaner evidence below doesn't actually support. Safe to delete the old file once this
one is submitted.

Copy everything below the line into the Hostinger support ticket form as-is.

---

**Subject:** Outbound requests to api.ebay.com consistently rejected with 500 — likely
IP-based, not a connectivity fault

Hi,

My Node.js app on `ops.rebootytreasures.com` (Node 22.x, deployed via your Git
auto-deploy) makes outbound HTTPS POST requests to eBay's OAuth token endpoint
(`https://api.ebay.com/identity/v1/oauth2/token`). Every single request made from this
hosting account fails with a 500, while the identical request (same code, same
credentials) succeeds every time from every other network I've tested it from (home
connection, a separate cloud environment).

To rule out anything specific to my app's HTTP client, I tested two completely
independent tools from this server: Node's built-in `fetch` and a raw `curl` process.
Both fail identically:

- **Node fetch:** `500`, 351ms, `{"error":"server_error","error_description":"server
  encountered an unexpected condition that prevented it from fulfilling the request"}`
- **curl:** same `500`, 200ms, byte-identical response body

Both responses carry legitimate eBay infrastructure headers — `server:
ebay-proxy-server`, an Akamai CDN header, `x-ebay-pop-id`, a real `rlogid`, and
`x-envoy-upstream-service-time` (59-95ms, indicating their backend actually processed
the request before rejecting it). So this isn't a dropped connection or something being
blocked before it leaves your network — the request reaches eBay's real backend and
gets a deliberate rejection there, specifically when it originates from this server.

That points most likely at eBay reacting to this hosting account's outbound IP address
(shared-hosting IP ranges are commonly flagged by anti-abuse/fraud systems on API
providers). Two things that would help:

1. Can you confirm the outbound IP address this account uses for external HTTPS
   requests, and whether it's shared across other customers?
2. Is a static or dedicated outbound IP available for this hosting plan? If this is an
   IP-reputation issue on eBay's side, a clean dedicated IP would likely resolve it
   without needing eBay's cooperation at all.

Happy to provide the raw headers/timestamps from a live run if useful — I have an
internal diagnostic page that reproduces this on demand from the server itself.

App path: `/home/u661531966/domains/ops.rebootytreasures.com/hbuilds/current/nodejs`
Domain: `ops.rebootytreasures.com`

Thanks,
Lucas
