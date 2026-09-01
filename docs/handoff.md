# Session handoff

Last updated: 2026-09-01. This is a living "pick up here" doc — overwrite it (don't
accumulate dated copies) whenever a session ends mid-thread on something worth
resuming cleanly.

## Where things stand right now

**Production is live on Render** at `https://rebooty-ops-production.onrender.com`
(no custom domain yet — see Phase 8 below). `main` is at commit `d65569f`, deployed
and confirmed live.

**`staging` is one commit ahead of `main`**, at `c12e989` — it has everything `main`
has, plus the auto-sync-every-20-min feature (`scheduledSync.js`), which is
**deliberately held back from production**, no timeline set. To promote it later:
cherry-pick `4125284`/`f64b5f9` (same commit, staging hash) onto `main`, no new work
needed unless the approach itself changes.

**What shipped this session (2026-09-01), on top of everything from 2026-08-30**
(R2 timeout fix, thumbnails, batched sync, the Docker `--omit=optional` fix — all
already live, see git log if the detail is ever needed again):
- **Configurable SKU prefix at Intake.** New "SKU prefix" field on the Intake
  form, defaulting to `RT` (same as always), editable per item — e.g. `CC-0001`
  when listing on someone else's behalf. Each prefix numbers independently
  (`RT` and `CC` don't share a counter). Confirmed intentional design, not a
  gap: there's still only **one** inventory table and **one** Waiting to
  List / Inventory page — a different-prefix item shows up in the exact same
  lists, same eBay sync/publish pipeline, distinguished only by its SKU
  column. No separate "store" and nothing to navigate between.
  - `nextSku(db, rawPrefix)` in `src/lib/nextSku.js` now normalizes
    (uppercase, letters-only, capped at 10 chars, falls back to `RT` if
    blank) and filters by prefix via SQL `LIKE` instead of always scanning
    for `RT-`.
  - `looksLikeOwnSku` in `src/services/ebaySync.js` was hardcoded to
    `/^RT-\d+$/` — generalized to any short-letter-prefix + digits pattern,
    otherwise a custom-prefix SKU published to eBay would get misfiled into
    `bin_location` as a "legacy code" on the next sync instead of being
    recognized as our own.
  - Verified against the real local dev DB (1,338 real synced rows) and live
    in production with a real photo submission.

## Open items to pick up next

1. **HEIC photos don't generate thumbnails (found 2026-09-01, not fixed —
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

## Key non-obvious findings worth remembering

- **HEIC photos aren't safe to assume will "just work"** anywhere in this
  app (see open item 1) — sharp's HEIF decoder has already failed on at
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
