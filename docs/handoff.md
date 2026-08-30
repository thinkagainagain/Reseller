# Session handoff

Last updated: 2026-08-30. This is a living "pick up here" doc — overwrite it (don't
accumulate dated copies) whenever a session ends mid-thread on something worth
resuming cleanly.

## Where things stand right now

**Production is live on Render** at `https://rebooty-ops-production.onrender.com`
(no custom domain yet — see Phase 8 below). `main` is at commit `3da2e8d`, deployed
and verified working against real production data this session.

**`staging` is one commit ahead of `main`**, at `526d7e2` — it has everything `main`
has, plus the auto-sync-every-20-min feature (`scheduledSync.js`), which is
**deliberately held back from production**. See item 1 below before promoting it.

**What shipped today, in order** (all verified live against real production
eBay/inventory/R2 data, not just locally):
- **Fixed images hanging forever on Waiting to List.** The R2 client had no
  request timeout, so a stalled Render→R2 connection hung the `/uploads/*`
  route indefinitely with no error and nothing logged — confirmed live: a
  real photo, a different real photo, and even a made-up nonexistent SKU all
  hung 20s+ identically. Added a 5s connect / 10s request timeout
  (`@smithy/node-http-handler`'s `NodeHttpHandler`) plus real error logging.
  **The underlying cause of the stall itself was never identified** — R2 was
  reachable fine from outside Render at the time, so this was likely a
  transient Render→R2 network hiccup, not a code bug. If images ever fail to
  load again, it'll now fail fast and log the real error instead of hanging
  — check Render's logs for `[uploads]` first.
- **Thumbnails on Waiting to List.** New cached, resized route
  (`/uploads/thumb/:sku/:filename`, 500px wide, quality 70, generated once
  and cached in R2 next to the original via `sharp`). An 8.7MB real photo
  came back as a 20KB thumbnail — same ~99% reduction confirmed on real
  production photos. Also capped `.card img`'s height (was unbounded
  `width:100%`, so a portrait phone photo could fill most of the screen per
  item) — verified that CSS rule is only used by this one page before
  scoping the change.
- **Batched the eBay active-listings sync.** `syncActiveListings` was doing
  up to ~3 sequential DB round-trips per listing (2 existence lookups + a
  full-table re-scan for every single new SKU via the old `nextSku`) — this,
  not the eBay API call, was what outran Render's request timeout during a
  real sync last session. Now does one bulk read to build in-memory
  sku/item-id maps, then writes everything inside a single transaction.
  Verified against the real production eBay account: 1,322 active listings,
  1,308 updates + 14 inserts, correct counts, no errors. `nextSku`'s
  row-scanning logic is now reusable (`maxSkuNumber`/`skuFromNumber` in
  `src/lib/nextSku.js`) instead of being locked inside one function that
  always re-queries.
- **Fixed a Docker build bug that nearly shipped a broken deploy silently.**
  The Dockerfile's `RUN npm ci --omit=dev --omit=optional` was added
  earlier to exclude `better-sqlite3` (a real optional dep of ours), but
  `--omit=optional` strips *every* optional dependency in the whole
  resolved tree — including `sharp`'s own `optionalDependencies`, which is
  how it ships its per-platform native binary. That silently produced a
  container where `require('sharp')` throws at startup, crashing before
  `/healthz` could ever respond — so Render just kept serving the *previous*
  build indefinitely with no visible error, which looked exactly like a
  stuck/slow deploy (repeated `302 → /login`, the old code's fallback for an
  unmatched route) rather than a crash. Fixed by re-installing just sharp's
  subtree (with optional deps included) right after the omit=optional pass.
  **Worth remembering**: any *future* dependency that ships a native binary
  via `optionalDependencies` (not just sharp) will hit this exact same trap
  under the current Dockerfile — check for this pattern first if a deploy
  ever "succeeds" but the app never actually comes up.

## Open items to pick up next

1. **Auto-sync-every-20-min — on hold, explicitly, as of 2026-08-30.** It's
   fully built and live on `staging` (`scheduledSync.js`, calls the now-batched
   `runSync()` on a timer) but the user asked to leave it off production for
   now, no timeline given. We also talked through *how* to make sync
   lighter — conclusion: eBay's Trading API (`GetMyeBaySelling`) has no
   "only what changed" option for active listings, so there's no way to make
   the eBay-fetch side itself incremental; the batching fix above was the
   real lever (turns "hundreds of round-trips" into a handful) and
   auto-sync will inherit that benefit automatically whenever it does get
   promoted. When picking this back up: just cherry-pick `4125284`/`f64b5f9`
   (same commit, staging hash) onto `main`, no new work needed unless the
   cadence/approach itself needs to change.
2. **Phase 8 DNS cutover** — the only remaining piece of the Hostinger→Render
   migration (full history below). Still blocked on one decision: user was
   considering a new, catchier domain/brand instead of
   `ops.rebootytreasures.com`. Confirm which domain before executing — don't
   assume the old one by default.
3. **Category-specific Item Specifics beyond Condition** — confirmed live via
   `get_item_aspects_for_category` that Books need Author/Book Title/
   Language, DVDs need Movie/TV Title/Format, Vinyl needs Artist, Clothing
   needs Style/Department/Dress Length, none of which have fields today.
   Deliberately deferred — needs flexible per-SKU field storage (a key/value
   table), not more fixed columns. Scoped as its own session.
4. **Dead code worth a look eventually**: `src/services/ebayPublish.js`'s
   `SCHEDULE_DAYS_OUT = 20` / `SchedulingInfo` request is harmless but
   misleading — eBay silently ignores it regardless of what's sent (confirmed
   live twice), so "Publish" already means "goes live now," this code just
   doesn't admit it. Low priority.
5. ~~Sync performance~~ — **fixed this session**, see above. Was the top
   open item from the last handoff; no longer applies.

## Key non-obvious findings worth remembering

- **The Docker `--omit=optional` trap** (full detail above) — any optional
  native-binary dependency, not just sharp, will hit this.
- **AWS SDK v3's `S3Client` has no default request timeout.** A stalled
  socket hangs forever with no error unless you pass a `requestHandler`
  with explicit `connectionTimeout`/`requestTimeout`
  (`src/lib/storage.js`). Worth checking this is still in place if the R2
  client config ever gets touched again.
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
