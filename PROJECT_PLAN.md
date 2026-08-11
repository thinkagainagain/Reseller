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
| 5 | Hosting / repo structure / automation | 🔲 In progress (GitHub repo created, local dir set up) | Phase 2 decisions |
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

### 3.3 Sync architecture (proposed, confirm with user before building)

- Python script (`ebay_sync.py`) using `requests` + a small OAuth token manager
  that refreshes the access token as needed.
- Writes to either:
  - (a) the `.xlsx` directly via `openpyxl` (simplest, but file-locking issues if
    the user has it open), or
  - (b) an intermediate CSV/SQLite that the spreadsheet or a future web dashboard
    reads from (more robust, better fits multi-platform scale-up).
  - **Recommendation:** move to (b) once Mercari/Poshmark/Depop are added — a single
    source-of-truth database avoids N-way spreadsheet sync conflicts. Flag this
    decision to the user before Phase 6.
- Scheduling: cron job on the user's hosting (needs confirmation: does the host
  support cron/Python, or FTP-only? — **open question, see §6**).

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

## 5. Repo Structure

```
Reseller/
├── PROJECT_PLAN.md              <- this file
├── README.md                    <- quick-start for humans
├── GIT-WORKFLOW.md              <- git workflow how-to
├── .gitignore                   <- excludes .env, credentials, raw exports
├── .env.example                 <- template, no real secrets
├── spreadsheet/
│   └── ReBooty_Treasures_Business_Tracker.xlsx
├── scripts/
│   ├── ebay_sync.py
│   ├── oauth_token_manager.py
│   └── requirements.txt
├── docs/
│   └── SOP.md                   <- Phase 4 output
└── data/                        <- (gitignored) local exports/cache if using CSV/SQLite approach
```

**Security note for the agent:** eBay Client ID/Secret and refresh tokens must
never be committed. Confirm `.gitignore` includes `.env`, `*.token`, `/data/` before
the first commit that touches credentials.

---

## 6. Open Questions (resolve with the user before deep implementation)

1. **Hosting capability** — does the user's hosting support cron + Python/PHP
   execution, or is it FTP/static-file-only? This determines whether sync can run
   on the host or must run locally on the user's laptop on a schedule.
2. **Data store long-term** — stay on the `.xlsx` as source of truth, or migrate to
   SQLite/Postgres once Mercari/Poshmark/Depop/Meta/Google Merchant are all synced?
   Recommend deciding this before building the second platform integration, to
   avoid rework.
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
