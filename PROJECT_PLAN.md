# ReBooty Treasures LLC — Business Systems Project Plan

**Owner:** ReBooty Treasures LLC (sole proprietorship / single-member LLC)
**Location:** Nassau County, FL (home-based)
**Business model:** Sources used/secondhand items, resells across eBay, Mercari, Poshmark,
Depop, with Meta (Facebook Marketplace) and Google Merchant Center being built out.
**Scale (as of Aug 2026):** ~1,300 active inventory items, ~400-item "death pile" backlog.
**Filing status:** Schedule C (sole prop / single-member LLC).

This file is the onboarding doc for whichever agent (human or Claude Code) picks up
the next phase of work. It captures what's been decided, what's been built, what's
still open, and the recommended order of operations. Read this fully before writing code.

---

## 1. Project Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | Core inventory/profit tracking spreadsheet | ✅ Done | — |
| 2 | eBay API integration (auto-pull inventory + sales) | 🔲 Not started | Phase 1, eBay Dev account |
| 3 | Tax export system for accountant | 🔲 Partially done (Monthly Tax Summary tab exists; needs polish + PDF export) | Phase 1 |
| 4 | Written SOP (sourcing → listing → shipping → reconciling) | 🔲 Not started | none, can run in parallel |
| 5 | Hosting / repo structure / automation | 🔲 In progress (Node/Express/SQLite app scaffolded locally, Intake tool built; not yet deployed to Hostinger) | Phase 2 decisions |
| 6 | Additional marketplace integrations (Mercari, Poshmark, Depop, Meta, Google Merchant) | 🔲 Not started | Phase 2 as template |

**Recommended build order:** finish Phase 2 (eBay) end-to-end as the reference
implementation, since its patterns (auth, data mapping, sync cadence) will be reused
for Mercari/Poshmark/Depop later. Phase 4 (SOP) can be drafted in parallel by a
human or a separate agent thread — it doesn't block engineering work.

---

## 2. What Already Exists

### 2.1 The spreadsheet: `ReBooty_Treasures_Business_Tracker.xlsx`

Built in openpyxl, formula-driven, zero recalculation errors verified via LibreOffice
headless recalc. Lives wherever the user has stored their download — **not yet in
this repo**. First task for the agent: get this file (or a re-derived version) into
the repo under `/spreadsheet/` or migrate its logic into a database (see open
questions, §5 [sic, §6]).

**Tabs and schema:**

**Active Inventory** (`A2:N1500`, 1500 data rows provisioned)

| Col | Field | Type |
|---|---|---|
| A | SKU | text, unique, e.g. `RT-0001` |
| B | Bin Location | text |
| C | Item Name | text |
| D | Category | dropdown: Clothing, Shoes, Accessories, Electronics, Home Goods, Toys/Collectibles, Books/Media, Jewelry, Sporting Goods, Tools, Furniture, Other |
| E | Source | dropdown: Thrift Store, Estate Sale, Yard/Garage Sale, Auction, Wholesale/Liquidation, Online Sourcing, Donation Received, Consignment, Other |
| F | Date Acquired | date |
| G | Purchase Cost | currency |
| H | Condition | dropdown: New, Like New, Excellent, Good, Fair, Poor/Parts |
| I | Platforms Listed | text (free text, comma-separated) |
| J | List Price | currency |
| K | Date Listed | date |
| L | Days Listed | formula: `IF(K="","",IF(M="Sold","",TODAY()-K))` |
| M | Status | dropdown: Active, Sold, Death Pile, Donated, Trashed, Returned |
| N | Notes | text |

**Death Pile** (`A2:K500`) — linked to Active Inventory by SKU (columns B-F are
`INDEX/MATCH` lookups). Adds: Priority (High/Medium/Low), Action Plan (Relist Lower
Price / Bundle / Photograph Better / List New Platform / Discount-Offer / Donate /
Discard / Keep Watching), Target Action Date, Notes.

**Sales Log** (`A2:R2000`) — this is the target for API-synced data.

| Col | Field | Source |
|---|---|---|
| A | SKU | **input / API** |
| B | Item Name | formula, looked up from Active Inventory |
| C | Platform | **input / API** — must match Platform Fees sheet values exactly: `eBay`, `Mercari`, `Poshmark (≥$15)`, `Poshmark (<$15 flat)`, `Depop`, `Facebook Marketplace`, `Google Merchant`, `Other` |
| D | Sale Date | **input / API** |
| E | Sale Price | **input / API** |
| F | Shipping Charged (to buyer) | **input / API** |
| G | Shipping Cost (you paid) | **input / API** (may need to be back-filled manually if API doesn't return label cost) |
| H | Fee % | formula, looked up from Platform Fees |
| I | Fee Flat $ | formula, looked up from Platform Fees |
| J | Platform Fee $ | formula: `(E+F)*H+I` |
| K | Other Fees (ads/processing) | **input / API** |
| L | COGS (item cost) | formula, looked up from Active Inventory by SKU |
| M | Total Costs | formula: `G+J+K+L` |
| N | Net Profit | formula: `E+F-M` |
| O | ROI % | formula: `N/L` |
| P | Date Acquired | formula, lookup |
| Q | Days to Sell | formula: `D-P` |
| R | Total Revenue | formula: `E+F` |

All formula columns are guarded with `IF(A="","",...)` so unpopulated rows don't
pollute AVERAGE()-based dashboard KPIs with phantom $0 values — preserve this
pattern if the sheet is regenerated.

**Platform Fees** — editable reference table the Sales Log formulas read from.
Current rates on file (verify against official sources before relying on them long-term —
they change often):

| Platform | Fee % | Flat Fee | Notes | Last Verified |
|---|---|---|---|---|
| eBay | 13.6% | $0.40 (or $0.30 if order ≤$10) | % on item+shipping+tax; Store subscription drops to ~12.7% | Jul 2026 |
| Mercari | 10% | $0 | Flat on item + buyer-paid shipping | 2026 |
| Poshmark (≥$15) | 20% | $0 | | May 2026 |
| Poshmark (<$15 flat) | 0% | $2.95 | | May 2026 |
| Depop | 3.3% | $0.45 | 0% commission in US/UK, payment processing only | 2026 |
| Facebook Marketplace | 5% | $0 | Local pickup = $0, zero out manually | 2026 |
| Google Merchant Center | 0% | $0 | Not a marketplace commission — free listings, Shopping Ads billed separately as CPC | 2026 |

### 2.2 Business context / decisions already made

- Excel/Power Query is **not** viable for the eBay OAuth flow — a script is required.
- eBay uses OAuth 2.0 (three-legged), not a static API key. Refresh token ~18mo,
  access token ~2hr.
- User prefers polling (every 15-30 min via cron) over standing up a webhook
  receiver for real-time push notifications — lower complexity, acceptable latency.
- Tax set-aside rate default: 30% (editable in Monthly Tax Summary `B1`) — covers
  self-employment tax (~15.3%) + estimated income tax, user should confirm with
  accountant.
- COGS must **only** flow through Active Inventory → Sales Log, never be
  double-logged in Expenses.

---

## 3. Phase 2 Detail: eBay API Integration

### 3.1 Credentials & setup (user must do manually, agent can guide)

1. Create app at developer.ebay.com → obtain **Client ID** and **Client Secret**.
2. Complete three-legged OAuth consent as the seller to get a **refresh token**.
3. Store credentials in `.env` (never committed) — see §5 repo structure.

### 3.2 APIs to use

- **Inventory API** (`/sell/inventory/v1/`) — active listings → maps to Active Inventory.
- **Fulfillment API** (`/sell/fulfillment/v1/order`) — orders/sales → maps to Sales Log.
- Legacy **Trading API** (`GetMyeBaySelling`) is a fallback if REST coverage gaps appear.

### 3.3 Sync architecture (decided — supersedes the original Python/xlsx sketch)

The project pivoted from "Python script writing into the `.xlsx`" to a
Node.js/Express web app backed by SQLite, because the actual deliverable is a
live dashboard + browser-based tools (intake, later others), not just a data
pipeline. See `src/db/migrations/` for the current schema and `src/routes/`
for the app structure.

- eBay sync will live as an Express route/service (`src/services/ebaySync.js`,
  not yet built) using a small OAuth token manager that refreshes the access
  token as needed — same OAuth mechanics as originally planned in §3.1, just
  JS instead of Python.
- Writes to SQLite (`data/rebooty.sqlite3`, gitignored) via Knex — the same
  database the whole app (intake, inventory, dashboard) reads from. This
  supersedes the old "(a) direct `.xlsx` write vs (b) intermediate CSV/SQLite"
  choice in §6; (b) won, and the "intermediate" store is now simply *the*
  store, since the web dashboard is the primary interface, not the `.xlsx`.
- Scheduling: cron/Task Scheduler polling every 15-30 min — chosen over a
  live webhook receiver for lower complexity at this scale (a webhook would
  need an always-on public HTTPS endpoint with eBay's challenge-response
  verification; polling needs none of that). **Resolved:** the user has
  always-on Hostinger Business Premium hosting, which supports Node.js apps
  via hPanel, so this can run on the host once deployed — not just locally.

### 3.4 Field mapping (eBay → Sales Log)

| eBay field | Sales Log column |
|---|---|
| `sku` | A |
| `title` | B (or verify against Active Inventory match) |
| marketplace = eBay | C |
| `lastModifiedDate` / order creation date | D |
| `lineItems[].total.value` | E |
| `lineItems[].deliveryCost.value` | F |
| (not returned by API — manual) | G |
| computed via Platform Fees | H, I, J |
| N/A unless Promoted Listings pulled separately | K |

---

## 4. Phase 4 Detail: SOP (not yet drafted)

Planned sections (draft outline for whoever writes it):

1. Sourcing checklist (what to buy / avoid, pricing thresholds, condition grading)
2. Intake process (SKU assignment, bin assignment, photographing, weighing for shipping)
3. Listing process per platform (title/description templates, pricing formula tied
   to Platform Fees sheet so margin targets are consistent)
4. Shipping process (packaging, carrier choice, label buying)
5. Reconciliation (daily/weekly: update Sales Log, check Dashboard KPIs)
6. Death pile triage cadence (e.g. weekly review of anything >60 days unlisted)
7. Monthly/quarterly financial routine (Monthly Tax Summary export, set-aside transfer)

---

## 5. Repo Structure (current — Node/Express/SQLite app, supersedes the original Python sketch)

```
Reseller/
├── PROJECT_PLAN.md              <- this file
├── README.md                    <- quick-start for humans
├── GIT-WORKFLOW.md              <- git workflow how-to
├── .gitignore                   <- excludes .env, node_modules/, /data/, /public/uploads/
├── .env.example                 <- template, no real secrets
├── package.json
├── src/
│   ├── server.js                 <- Express bootstrap (session, view engine, routes)
│   ├── db/
│   │   ├── knexfile.js
│   │   ├── index.js              <- exported knex instance (SQLite)
│   │   ├── migrations/           <- users, platform_fees, inventory, intake_photos,
│   │   │                            listing_history, sales_log
│   │   └── seeds/                <- platform_fees rates, admin user
│   ├── routes/                   <- auth.js, intake.js, inventory.js (eBay sync route TBD)
│   ├── middleware/requireAuth.js
│   ├── lib/                      <- constants.js (dropdown enums), nextSku.js
│   └── views/                    <- EJS templates
├── public/
│   ├── css/, manifest.json       <- PWA manifest for "Add to Home Screen"
│   └── uploads/                  <- (gitignored) intake photos, {sku}/*.jpg
├── spreadsheet/
│   └── ReBooty_Treasures_Business_Tracker.xlsx  <- original workbook; app is now
│                                    the primary interface, this stays as reference/export target
├── scripts/                      <- reserved for one-off/ops scripts, currently empty
├── docs/
│   └── SOP.md                   <- Phase 4 output
└── data/                        <- (gitignored) rebooty.sqlite3 lives here
```

**Security note for the agent:** eBay Client ID/Secret and refresh tokens must
never be committed. Confirm `.gitignore` includes `.env`, `*.token`, `/data/`,
and `/public/uploads/` before the first commit that touches credentials.

**Lifecycle note:** `inventory.status` now includes `Intake` as a distinct
stage from `Death Pile` — items sit in Intake from the moment they're
photographed until they're actually listed (or diverted to the permanent
Death Pile for a specific blocker, tracked in `death_pile_reason`). Keeping
these separate matters for metrics: folding stale Death Pile items into an
"average days from purchase to listing" number would badly inflate it.

---

## 6. Open Questions (resolve with the user before deep implementation)

1. ~~**Hosting capability**~~ — **Resolved.** User has Hostinger Business
   Premium (shared hosting), which supports Node.js apps via hPanel. Sync can
   run on the host, not just locally.
2. ~~**Data store long-term**~~ — **Resolved.** SQLite via the Node/Express app
   (see §3.3, §5) is the source of truth going forward; the `.xlsx` is no
   longer the primary interface.
3. **Shipping cost capture** — eBay's API doesn't cleanly return what the seller
   paid for a label if purchased outside eBay. Confirm workflow (buy labels through
   eBay so cost is in the API response, or accept a manual entry step).
4. **Google Merchant Center** — this isn't a marketplace with its own checkout/fee
   cut; clarify whether the user is running their own storefront (Shopify/WooCommerce/etc.)
   that Google Shopping ads point to, since that changes what "syncing sales" even
   means for that channel.
5. **Accountant handoff format** — confirm whether the accountant wants the Monthly
   Tax Summary as-is, a PDF export, or a specific categorization scheme before
   finalizing Phase 3.

---

## 7. Immediate Next Actions for the Agent

1. Confirm repo structure above with the user (or adjust to their existing local
   directory layout).
2. Set up `.gitignore` and `.env.example` first, before any credential-adjacent code.
3. Walk the user through eBay Developer account + app creation (§3.1) if not done.
4. Build `oauth_token_manager.py` (get + refresh access token, store refresh token
   securely — do not hardcode).
5. Build `ebay_sync.py` for **read-only** pulls first (Inventory API, Fulfillment
   API) writing to a CSV in `/data/` — validate field mapping against a handful of
   real listings/orders before wiring into the live spreadsheet.
6. Only after manual validation, wire the sync to write into
   `ReBooty_Treasures_Business_Tracker.xlsx` (or the chosen data store per open
   question #2).
7. Resolve open question #1 (hosting capability) before building the scheduler.

---

## 8. Future Consideration: Cross-Platform Listing Sync (not scoped yet)

Inspired by tools like Nifty.ai, Vendoo, and List Perfectly: use eBay as the
source-of-truth inventory and automatically crosslist to Poshmark, Mercari, and
Depop, delisting everywhere the moment an item sells on any one platform (to
avoid selling the same physical item twice).

**This is not a natural extension of the Phase 6 marketplace sync work** and
should not be scoped as "the same pattern as eBay, three more times." The
blocker is API access, which is fundamentally different per platform:

- **eBay** — genuine public developer API, self-serve registration. This is why
  Phase 2/6 sync has been straightforward to plan.
- **Poshmark** — no public third-party seller API as of research done 2026-08-12.
- **Mercari** — no confirmed public seller API found as of the same research pass.
- **Depop** — appears to have *some* "official API" now (referenced by Vendoo's
  blog as of 2026), but it reads as a partner-level integration Vendoo specifically
  secured, not a self-serve developer signup. Do not assume equivalent access is
  available to a solo shop without checking directly.

Without official API access, crosslisting/delisting on a platform means
**browser automation** — a script that logs into the actual website and drives
the UI. That carries a materially different risk profile than the eBay OAuth
work: it breaks whenever the site's HTML changes, it typically runs against
those platforms' bot/automation terms of service, and it risks account
suspension if detected. This is not a decision to make casually or bundle
silently into Phase 6.

**If/when this gets picked up:**
1. Check each platform's current developer/partner terms directly first — this
   space shifts (Depop's API status changed recently) and stale assumptions here
   should not be trusted.
2. Decide per-platform: pursue official/partner API access, accept
   automation risk with eyes open, or leave that platform as manual-entry-only.
3. Treat this as its own phase with its own risk sign-off from the user, not an
   auto-included part of Phase 6.
