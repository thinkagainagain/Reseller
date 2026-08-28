# Session handoff

Last updated: 2026-08-27. This is a living "pick up here" doc — overwrite it (don't
accumulate dated copies) whenever a session ends mid-thread on something worth
resuming cleanly.

## Where things stand right now

**Production is live on Render** at `https://rebooty-ops-production.onrender.com`
(no custom domain yet — see Phase 8 below). Everything through today's session
is deployed and confirmed working: `main` and `staging` are in sync at commit
`fb7f4a3`, pushed and deployed this session.

**What shipped today, in order** (all verified live against real production
eBay/inventory data, not just locally):
- **Primary-photo sync**: resync pulls each active listing's real current
  photo from eBay back into the app (`inventory.ebay_primary_photo_url`),
  so the app stays visually in sync when the user swaps in studio photos
  directly on eBay after publish.
- **Sync bug fix**: a listing whose eBay Custom Label already looks like our
  own `RT-####` scheme was being treated as a legacy location code and
  buried in `bin_location` under a spawned duplicate SKU. Fixed to recognize
  and reuse the real SKU directly.
- **Robust listings step 1**: publish now sends *every* photo on a SKU (not
  just the first), with routes to add/remove photos on an existing item.
  eBay's real per-category Condition options (`get_item_condition_policies`)
  now drive a live dropdown instead of one static 6-value guess — confirmed
  these genuinely differ a lot (Books/DVDs: 5-point New→Acceptable; Clothing:
  its own New-with-tags→Pre-owned-Fair scale; most else: plain New/Used).
- **Orders pipeline**: replaces the old instant "sale → Sold" flow with
  **Current** (open orders, sorted SKU→Bin/Loc→Title for pulling items) and
  **Completed** (shipped, with real tracking + real eBay fees). Sync
  auto-detects eBay-label shipments; a manual "mark shipped" form on Current
  covers Pirate Ship (the user's occasional alternate shipping method, which
  eBay never sees). `computeProfit` now prefers the real per-order eBay fee
  over the old estimated percentage when available.
- **Sticky table headers + reachable horizontal scroll**: `.table-scroll` is
  now a bounded-height scroll box (not just `overflow-x`), so column headers
  stay pinned while scrolling 1,300+ rows and the horizontal scrollbar sits
  near the visible screen instead of at the bottom of a huge table.

## Open items to pick up next

1. **Sync performance is a real, hit-in-production problem, not yet fixed.**
   `syncActiveListings`/`syncSoldOrders` do one DB round-trip per item,
   sequentially, for 1,300+ items — this outran Render's request timeout
   during this session's production sync (client saw "Bad Gateway" while the
   sync kept running successfully server-side in the background, confirmed
   by watching thumbnails populate across repeated page reloads). Needs
   batched DB writes or a background-job model before this gets worse as
   inventory grows.
2. **Automatic periodic sync** — user wants this eventually (no cron exists
   despite it being an early plan), explicitly said **hold the build** for
   now. When built: no push notification, just keep the dashboard current
   automatically so logging in shows fresh data. Should land after #1 above
   is fixed, not before.
3. **Category-specific Item Specifics beyond Condition** — confirmed live via
   `get_item_aspects_for_category` that Books need Author/Book Title/
   Language, DVDs need Movie/TV Title/Format, Vinyl needs Artist, Clothing
   needs Style/Department/Dress Length, none of which have fields today.
   Deliberately deferred — needs flexible per-SKU field storage (a key/value
   table), not more fixed columns. Scoped as its own session.
4. **Phase 8 DNS cutover** — the only remaining piece of the Hostinger→Render
   migration (full history below). Blocked on one decision: user is
   considering a new, catchier domain/brand instead of
   `ops.rebootytreasures.com`, motivated by the app feeling like a real
   product now, not just an internal tool. Confirm which domain before
   executing — don't assume the old one by default.
5. **Dead code worth a look eventually**: `src/services/ebayPublish.js`'s
   `SCHEDULE_DAYS_OUT = 20` / `SchedulingInfo` request is harmless but
   misleading — eBay silently ignores it regardless of what's sent (confirmed
   live twice, see below), so "Publish" already means "goes live now," this
   code just doesn't admit it. Low priority, not touched this session.

## Key non-obvious findings worth remembering

- **eBay ignores `SchedulingInfo`/`StartTime` for this account, even with an
  active Basic Store subscription** (which should be sufficient per eBay's
  own rules — that was the leading theory and it's ruled out). Confirmed
  twice live: an `AddFixedPriceItemResponse`'s own `StartTime` came back as
  *today*, not the requested date, and the item was immediately live in
  eBay's Active list. No support case filed (user: eBay support has a poor
  track record) — the fix was moving listing "robustness" work into the app
  itself, before Publish, instead of relying on an eBay-side hold.
- **The user still sometimes navigates to the old Hostinger deployment out of
  habit** instead of `rebooty-ops-production.onrender.com` — if a sync or
  any eBay action ever fails with the classic
  `server_error`/500-from-token-endpoint signature again, check the URL bar
  before assuming the Render migration regressed.
- **Verification gotcha**: eBay API calls made through a server launched via
  the Browser-pane `preview_start` tool fail with a TLS
  `UNABLE_TO_VERIFY_LEAF_SIGNATURE` error — that sandbox appears to
  intercept/proxy outbound HTTPS in a way Node's default trust store
  rejects. Workaround that's worked repeatedly: launch via Bash
  (`node src/server.js &`), then point the Browser pane at that URL with
  `preview_start({url: ...})` for the visual/interactive parts. A plain
  Bash-run script never hits this either.
- eBay's real order/fulfillment data (pulled live, not from docs) exposes
  real per-order fees (`totalMarketplaceFee`), real net payout
  (`paymentSummary.totalDueSeller`), and real tracking/carrier/ship-date once
  `orderFulfillmentStatus` is `FULFILLED` — but **no delivered status
  anywhere**. Confirmed by reading the actual API response.

## Hostinger → Render migration (background, mostly historical)

**Why**: eBay's OAuth token endpoint was 500ing specifically for requests
from Hostinger's shared-hosting IP for weeks — confirmed via independent
`fetch` and `curl` clients both getting a deliberate rejection from eBay's
real backend, not a code bug. Combined with the user reconsidering
"productize this as a SaaS someday" more seriously, that justified a real
infrastructure move. Full phased plan, if the detailed history is ever
needed: `C:\Users\lucas\.claude\plans\misty-riding-dawn.md`.

**Status: Phases 0–7 complete and verified** (persistent sessions, Docker,
R2 photo storage, staging + production both provisioned on Render, real
data migrated, a real production eBay publish confirmed working end to end,
Hostinger's IP-reputation problem confirmed gone on Render's IP). **Only
Phase 8 (DNS cutover) remains**, blocked on the domain decision above. Once
decided: update `APP_PUBLIC_URL`, add the custom domain in Render, update
DNS, re-run the Phase 7 verification checklist against the real domain
(fresh TLS + DNS propagation are new variables), then leave Hostinger
paused-but-present for a 2–4 week rollback window before decommissioning.

A finalized support ticket about the Hostinger IP issue was submitted and
Hostinger was "looking into it" as of 2026-08-22
([docs/hostinger-ebay-500-support-ticket.md](hostinger-ebay-500-support-ticket.md))
— now moot for the migration itself (Render's the permanent fix regardless)
but check there if Hostinger ever actually responds, since it's still live
during the rollback window.

## Other context (established, not changing)

The app's folder structure (centralized `src/config/`, per-feature
`src/views/` subfolders, `npm test` scaffold) is stable — see
[DEPLOYMENT.md](../DEPLOYMENT.md) (still describes the Hostinger deploy flow,
needs rewriting once Phase 8 lands) and [README.md](../README.md) for layout.
