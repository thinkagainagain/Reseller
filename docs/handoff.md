# Session handoff

Last updated: 2026-09-24. This is a living "pick up here" doc — overwrite it (don't
accumulate dated copies) whenever a session ends mid-thread on something worth
resuming cleanly.

## Where things stand right now

**Production is live on Render** at `https://rebooty-ops-production.onrender.com`
(no custom domain yet — see Phase 8 below), deployed from `main`.
As of 2026-09-24, `main` and `staging` are in sync and pushed, and everything
below is live, including multi-unit intake and the variation-SKU matching fixes.

The auto-sync-every-20-min feature (`scheduledSync.js`), previously held back from
production with no timeline set, **is now live** — promoted 2026-09-17.

**What shipped 2026-09-17 and 2026-09-18** (on top of everything already live from
2026-09-01, see git log if that detail is ever needed again):

- **Fixed a real bug: eBay listings were going live instantly instead of held
  ~20 days.** `src/services/ebayTradingApi.js` was sending `<SchedulingInfo>
  <StartTime>` in the `AddFixedPriceItem` request — that's not a real request
  field; `SchedulingInfoType` is an unrelated *response* type (account-level
  scheduling limits from `GeteBayDetails`). eBay silently ignored it and listed
  immediately. Fixed to use `Item.ScheduleTime`, a direct child of `<Item>`
  (confirmed against eBay's docs and a real live push, RT-1574 — landed in
  eBay Seller Hub's own Scheduled tab, held, not live). **This means every
  listing published before 2026-09-17, including the first one (RT-1383,
  2026-08-18), actually went live instantly** despite the app reporting
  success — no way to retroactively fix those, only prevents it going forward.
- **New `/inventory/scheduled` page.** Before this, no page in the app queried
  `status = 'Scheduled'` at all — an item in that status (whether pushed live
  or set by hand) was simply invisible on every list view. Now visible with
  push date, estimated go-live date, and a link to the eBay listing.
- **New `Ended` status bucket + `/inventory/ended` page**, for items eBay sync
  finds out-of-stock (0 qty) or gone entirely from the Active list, with no
  matching eBay order. Doesn't touch eBay itself at all (still 100% read-only
  against eBay — `GetMyeBaySelling` + Fulfillment orders, both existing calls);
  purely local bookkeeping so stale items stop sitting in Active forever (real
  example: RT-0231, "out of stock" on eBay's side for a while, never caught
  before this). If a matching eBay order shows up later (regular sync or the
  new backfill below), it still correctly overwrites to `Sold` with real data
  — Ended is just the "no order found (yet)" bucket. `resolveActiveListingStatus()`
  in `src/services/ebaySync.js` is the pure decision function, directly unit
  tested (`tests/services/ebaySync.test.js`).
- **New "Backfill Orders" action on `/sync`.** The regular rolling sync only
  checks the last 3 days of eBay orders (`ORDER_LOOKBACK_DAYS`), to stay fast.
  This runs the exact same order-matching logic with a configurable lookback
  (up to 730 days) — for catching a sale from further back than the normal
  window ever covers, e.g. from the weeks auto-sync was held back. Use it if
  an item sits in Ended but was suspected to have actually sold on eBay.
- **Dashboard**: new "Sold Elsewhere" tile (all-time revenue + count from
  `sales_log` rows where `platform != 'eBay'` — Poshmark/Depop/Mercari sales
  logged via the existing "Log Sale" flow) and an "Ended" count tile.

**Shipped 2026-09-20** (physical-inventory tooling; local bookkeeping only, nothing
sent to eBay):

- **Import Bin Locations** (`/inventory/import-bins`, live on `main`): paste columns
  copied from Excel (SKU + Location; header row required if more than two columns),
  preview exactly what will be set/changed/skipped, then apply. Blank locations and a
  literal "SOLD" are skipped, so a re-upload can never wipe a bin. Apply re-validates
  against the live DB. Logic in `src/lib/binImport.js` (unit tested). Used for the
  coffee-mug sheet on 2026-09-20 and confirmed working in production. Reason it's an
  in-app page: production's database credentials live only in Render, so scripts run
  from the dev machine can't reach it.
- **Inventory Check** (`/inventory/check`, live on `main`):
  search by keyword (all words must match SKU/title/bin/eBay category), bin location
  (exact, plus "(no location set)"), category, status (default "on hand" = everything
  except Sold/Donated/Trashed/Returned), then download an `.xlsx` grouped by bin with
  the same SKU/Title/Location/Found? columns the import reads, so a checked sheet pastes
  straight back in. Print-ready (one page wide, repeated header row, page numbers). Uses
  the new `exceljs` dependency. Logic in `src/lib/inventoryCheck.js` (unit tested).
  - Bin dropdown = distinct bins currently on at least one on-hand item, not a master
    list; `bin_location` is free text on the edit page, so a new bin is just typed
    there (or arrives via import) and appears in the dropdown automatically.
  - The category dropdown hides itself when no item has a category — currently true for
    every synced eBay listing (`category` is only set for items created through
    Intake), so category search is effectively unused until that field is populated.

- **Security update**: `npm audit fix` (non-forced) bumped multer 2.2.0 → 2.4.0
  (cleared a HIGH DoS advisory on the photo-upload path), plus express, body-parser
  and qs by patch/minor. Verified with real multi-photo intake/add-photo uploads.
  One moderate warning remains on purpose: `uuid` via `exceljs` — not exploitable as
  used, and npm's only fix is a breaking downgrade of exceljs, so leave it.

**Shipped 2026-09-21 to 2026-09-24** (multi-unit intake and sync hardening):

- **Sync no longer takes down the server** (`25701fd`). `server.js` now has
  process-level `unhandledRejection`/`uncaughtException` handlers that log and stay
  up (a TLS failure calling eBay was killing the whole Node process). Also fixed: two
  active eBay listings sharing one Custom Label used to hit the unique `sku`
  constraint and roll back the *entire* sync batch. `pickSkuForNewListing` now
  generates a fresh SKU for the second one and logs it.
- **Multi-item intake** (`d8317ca`): one photo, one item each.
- **Multi-unit intake** (`a90dce8`, migration `017_add_multi_unit_quantity`). Intake's
  multi-item mode has a "More than one unit per item" toggle (Qty / Label /
  Cost-per-unit per photo), so 3 each of 4 colors = 4 SKUs, quantity 3 each, matching
  an eBay multi-variation listing (one SKU + quantity per variation). Sync reads every
  variation (`flattenListing` in `ebaySync.js`) and copies eBay's remaining count into
  `inventory.quantity`. A `multi_unit` row stays Active until its last unit sells
  (`statusAfterSale`). Sales are keyed by `ebay_line_item_id`, so two same-day sales
  of one SKU no longer merge. Profit, tied-up totals, Inventory Check (Qty column)
  and Ready to Publish all account for quantity. Helpers in `src/lib/multiUnit.js`.
- **eBay variation SKU suffix matching** (`5981dda`, then `e165f99`). Even with the
  listing-level SKU blank, eBay's variation editor rewrites a typed SKU `RT-1462`
  into `RT-1462_Bl` (underscore + first letters of the variation value). When two
  values share their first letters, it adds a counter: `RT-1463_Ye` then
  `RT-1465_Ye2`. `ebaySuffixedSkuBase()` maps these back to the Intake SKU. It only
  trusts the base when the suffix (ignoring trailing digits) is the start of that
  variation's own label and no other variation in the listing leads to the same base.
  Order sync accepts the base SKU only if listing sync already tied that row to the
  same eBay Item ID.
  - The first version (`5981dda`) missed the counter case. On the first real
    multi-variation listing (Intake SKUs RT-1462 to RT-1465, eBay SKUs `RT-1462_Bl`,
    `RT-1463_Ye`, `RT-1464_Pi`, `RT-1465_Ye2`), sync treated `RT-1465_Ye2` as a legacy
    location code: it inserted a **new row RT-1466** with `bin_location = RT-1465_Ye2`
    and left the real **RT-1465** stranded in Waiting to List. Fixed in `e165f99`
    (tests use the real SKUs, but the 4th variation's label in the tests,
    "Yellow Swirl", is a guess; only its "Ye" start is known). See open item 1 for
    the production cleanup.

## Open items to pick up next

1. **Finish and verify the RT-1465 / RT-1466 cleanup in production (started
   2026-09-24).** The fix is pushed to `main`. Remaining steps, in this order:
   (a) confirm the Render production deploy of `99da463` (or later) is Live;
   (b) run Sync on `/sync`;
   (c) confirm **RT-1465** now has the listing's `ebay_item_id`, its `variant_label`
   (a "Ye..." color), `multi_unit = true`, eBay's remaining quantity, status Active
   (no longer Waiting to List), and an empty `bin_location`;
   (d) confirm RT-1462 to RT-1464 still look right;
   (e) **only then delete RT-1466** from its edit page (`POST /inventory/:sku/delete`).
   Deleting it earlier is pointless because the 20-min auto-sync recreates it as
   RT-1467. It also won't clear on its own: the Ended sweep skips any row whose Item
   ID was seen this sync. The RT-1466 number is burned, so the next Intake SKU is
   RT-1467. That's fine. If RT-1465 still doesn't match after the sync, get the
   variation's exact label from eBay and check it against `ebaySuffixedSkuBase`.
2. **Watch `/inventory/ended` over the next several syncs.** This is brand
   new logic against real production data — worth checking that what lands
   there actually makes sense (real stale/OOS items, not false positives)
   before trusting it unattended. If eBay's `GetMyeBaySelling` ever returns a
   genuinely incomplete page without erroring (hasn't happened so far — a
   failed page throws rather than silently truncating, see
   `getActiveListings` in `ebayTradingApi.js`), that would show up as
   real Active items wrongly flagged Ended — watch for that specifically if
   `endedMissing` numbers ever look too high on `/sync`.
3. **Old Ended items may need the new Backfill Orders run.** Once a handful of
   items land in Ended from the normal 20-min sync, consider running Backfill
   Orders (e.g. 180–365 days) once to catch any of them that actually did sell
   on eBay a while back and just missed the normal 3-day order window.
4. **HEIC photos don't generate thumbnails (found 2026-09-01, not fixed —
   explicitly deferred by the user).** An iPhone photo saved as `.heic`
   fails in `sharp`'s decoder: `heif: Decoder plugin generated an error:
   Unspecified (7.0)` / `source: bad seek to ...`. Shows as a broken-image
   icon on Waiting to List. **This is bigger than thumbnails** — HEIC isn't
   displayable in most non-Safari browsers at all, so the *original* photo
   almost certainly has the same problem, and eBay's listing-photo fetch
   likely rejects it too once published. User's plan for now: manually
   convert photos to JPEG before uploading, "as long as it's working." The
   real fix, when picked back up: convert HEIC → JPEG server-side (via
   `sharp`) at the moment of upload (both `POST /intake` and
   `POST /inventory/:sku/photos` in `src/routes/`), so the *stored* original
   is always a broadly-compatible format — thumbnails, browser display, and
   eBay publish would all just work automatically off of that, no separate
   fix needed for each.
5. **Phase 8 DNS cutover** — the only remaining piece of the Hostinger→Render
   migration (full history below). Still blocked on one decision: user was
   considering a new, catchier domain/brand instead of
   `ops.rebootytreasures.com`. Confirm which domain before executing — don't
   assume the old one by default.
6. **Category-specific Item Specifics beyond Condition** — confirmed live via
   `get_item_aspects_for_category` that Books need Author/Book Title/
   Language, DVDs need Movie/TV Title/Format, Vinyl needs Artist, Clothing
   needs Style/Department/Dress Length, none of which have fields today.
   Deliberately deferred — needs flexible per-SKU field storage (a key/value
   table), not more fixed columns. Scoped as its own session.
7. **Items not found during a physical inventory check — noted, deliberately not
   built (user, 2026-09-20).** The Inventory Check sheet has a "Found?" column, but
   re-importing only reads SKU + Location; a not-found mark does nothing in the app.
   User's call: no action for now, because items are spread across many bins and are
   checked one bin at a time, so some simply take longer to find — an early "missing"
   flag would be mostly false alarms. If picked up later, options discussed were a
   review bucket (like `Ended`) or a note on the item; ask before building either.
8. **A failed photo save can crash the whole app process (found 2026-09-20, not
   fixed — offered, user hasn't decided).** Express 4 doesn't catch errors from
   `async` route handlers, and `POST /intake` / `POST /inventory/:sku/photos`
   (`await storage.putObject(...)`) have no try/catch, so an R2 failure (seen locally
   as a TLS error; in production it'd be an R2 outage/timeout) is an unhandled
   rejection that exits the process — Render restarts it, but the user gets a dropped
   request instead of an error message. (Update 2026-09-21: `server.js` now has
   process-level handlers, so the process should no longer exit. The request is
   still left hanging with no error page, so the per-route fix is still worth doing.) Fix if wanted: wrap those handlers (or add a
   small async-error wrapper) so it renders an error page instead.
   Also worth knowing: the local `.env` points `R2_BUCKET` at the **staging** bucket, so
   a normal local run writes photos to real cloud storage. To test uploads locally
   without that, launch with `R2_BUCKET= EBAY_CLIENT_ID= node src/server.js` (local disk
   storage, and no eBay auto-sync mutating the dev DB).

## Key non-obvious findings worth remembering

- **eBay rewrites variation SKUs.** Leaving the listing-level SKU blank doesn't stop it:
  eBay's variation editor turns a typed `RT-1462` into `RT-1462_Bl`, and colliding
  prefixes get a counter (`_Ye`, then `_Ye2`). Any new code that matches eBay SKUs to
  ours must go through `ebaySuffixedSkuBase()` (or keep its rules), not an exact
  string match.
- **Cowork sessions can commit but not push this repo.** The Cowork desktop VM has no
  GitHub credentials, so `git push` fails ("could not read Username"). The user
  pushes from their own terminal or GitHub Desktop. That VM also blocks deletes by
  default, which can leave `.git/*.lock` and `tmp_obj_*` files behind mid-commit;
  clear them (with delete permission) before the next git command. Separately, about
  50 files always show as modified in `git status` on that machine. Those are CRLF
  line-ending noise only (`git diff --ignore-cr-at-eol` is empty), so never
  `git add -A` blindly.

- **eBay's `SchedulingInfo`/`StartTime` "account restriction" finding from
  earlier sessions was wrong — it was a code bug, not an eBay account
  limitation.** Corrected 2026-09-17: `SchedulingInfoType` was never a valid
  `AddFixedPriceItem` request field to begin with (it's a response type for
  account-level scheduling limits); the real field is `Item.ScheduleTime`.
  Fixed and confirmed live. If this resurfaces, check `ebayTradingApi.js`'s
  `buildAddFixedPriceItemRequest` first before assuming an eBay-side cause.
- **Branch deploys are separate environments, not just git history**: `main`
  → `rebooty-ops-production` (real business use), `staging` → its own Render
  service with its own Supabase DB/R2 bucket. Pushing to `staging` alone never
  reaches production — check `render.yaml`'s `branch:` field per service, and
  don't assume "pushed" means "live" without checking which branch actually
  deploys where. Also check this doc's "gap between main and staging" note
  before merging everything blindly — staging can be intentionally ahead for
  reasons already decided (like auto-sync was, until 2026-09-17).
- **This app must never write/delete/end a listing or zero its quantity on
  eBay's side, full stop** — explicit user requirement (2026-09-17): eBay is
  the single source of truth across all their tools, and Nifty.ai is the only
  other tool they use that's allowed to delete a listing from eBay. This app
  pulls listings (read) and pushes new listings (create), but every
  status-bucket feature (Ended, Death Pile, Sold, etc.) is purely local
  bookkeeping in our own `inventory` table — never a mutation on eBay's actual
  listing. Keep this constraint in mind before adding any new eBay Trading API
  call that isn't already one of: `GetMyeBaySelling` (read), Fulfillment
  `GET /order` (read), `AddFixedPriceItem` (create new), `ReviseFixedPriceItem`
  (used today only to set the Custom Label/SKU field, nothing else).
- **HEIC photos aren't safe to assume will "just work"** anywhere in this
  app (see open item 4) — sharp's HEIF decoder has already failed on at
  least one real user photo, and HEIC has no broad browser/eBay support
  regardless. Any future feature touching photos should assume HEIC needs
  conversion, not pass-through.
- **The Docker `--omit=optional` trap**: any dependency that ships a native
  binary via `optionalDependencies` (sharp already did — a future package
  could too) will get silently stripped by the Dockerfile's
  `--omit=optional` flag unless explicitly re-installed after, same as the
  fix in the current Dockerfile. A deploy that "succeeds" but the app never
  actually comes up (repeated `302 → /login` from the *previous* build) is
  the symptom to watch for.
- **AWS SDK v3's `S3Client` has no default request timeout.** A stalled
  socket hangs forever with no error unless you pass a `requestHandler`
  with explicit `connectionTimeout`/`requestTimeout` (`src/lib/storage.js`).
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
