# Hostinger support ticket — eBay token endpoint 500s from this hosting account

Status: **revised, ready to submit** — updated per Hostinger support's follow-up
request for multiple timestamped examples, non-sensitive headers, confirmed
cross-network success, and the outbound-IP/dedicated-IP questions. Language around
cause (IP reputation vs. routing vs. an eBay-side rule) was then softened to
possibilities rather than conclusions, per Hostinger's second reply.

Copy everything below the line into the Hostinger support ticket reply.

---

**Subject:** Outbound requests to api.ebay.com consistently rejected with 500 —
follow-up with timestamped examples and outbound IP

Hi,

Thanks for the detailed follow-up. Confirming the scope: this ticket concerns a
runtime rejection from eBay's API (HTTP 500 on every request from this account), not
a deployment/build failure — I've separately confirmed the app's own Git
auto-deploy pipeline is working correctly (latest deploy succeeded, site is live and
serving normal traffic), so no build logs should be needed here unless something
else turns up.

**Confirmed: identical requests succeed from other networks.** The exact same code,
same credentials, sent from my home network (not on Hostinger) returns a normal
`200 OK` with a valid access token every time. Only requests originating from this
hosting account fail.

**Outbound IP for this account:** `212.1.209.194` (captured directly from the
server via a public IP-echo lookup, alongside each test below).

**Three timestamped examples**, each run via both Node's `fetch` and a raw `curl`
process (two independent HTTP clients) from the server itself, one right after
another:

| UTC timestamp | Client | Status | Duration | eBay POP ID | x-envoy-upstream-service-time |
|---|---|---|---|---|---|
| 2026-08-21T00:04:24.512Z | fetch | 500 | 288ms | UFES2-RNOAZ05-api | 57ms |
| 2026-08-21T00:04:24.512Z | curl | 500 | 235ms | UFES2-SLCAZ03-api | 64ms |
| 2026-08-21T00:04:30.176Z | fetch | 500 | 188ms | UFES2-SLCAZ03-api | 53ms |
| 2026-08-21T00:04:30.176Z | curl | 500 | 279ms | UFES2-RNOAZ05-api | 66ms |
| 2026-08-21T00:04:36.178Z | fetch | 500 | 185ms | UFES2-LVSAZ01-api | 41ms |
| 2026-08-21T00:04:36.178Z | curl | 500 | 266ms | UFES2-RNOAZ05-api | 46ms |

All six responses are byte-identical in body:

```
{"error":"server_error","error_description":"server encountered an unexpected condition that prevented it from fulfilling the request"}
```

Representative non-sensitive response headers (consistent across all six, only the
`rlogid`/`x-traffic-request-id`/POP ID/timestamp vary per request):

```
server: ebay-proxy-server
x-cdn: Akamai
x-ebay-pop-id: UFES2-RNOAZ05-api
x-envoy-upstream-service-time: 57
strict-transport-security: max-age=31536000
cache-control: max-age=0, no-cache, no-store
content-type: application/json
content-length: 135
```

These headers show the request reaches eBay's real edge (Akamai) and backend
(Envoy processed each request in 41-66ms before rejecting it) — so this isn't a
dropped connection or something blocked before leaving your network. The requests
reach eBay's edge and return a consistent HTTP 500 only when sent from this hosting
account; the cause may involve source-IP reputation, routing, or an eBay-side
account/security rule — I don't have enough visibility to say which.

**My questions for you:**

1. Can you confirm this is in fact the account's outbound IP for external HTTPS
   requests (`212.1.209.194`), and whether it's shared across other Hostinger
   customers?
2. Is a static or dedicated outbound IP available for this hosting plan? I'm not
   assuming this would fix it — but if source-IP reputation turns out to be a factor,
   it seems like a reasonable thing to rule in or out.

Happy to run more tests or provide additional detail — I have a diagnostic tool
built into the app that reproduces this on demand from the server itself, so
turnaround on any follow-up test is quick.

App path: `/home/u661531966/domains/ops.rebootytreasures.com/hbuilds/current/nodejs`
Domain: `ops.rebootytreasures.com`

Thanks,
Sean_Lucas
