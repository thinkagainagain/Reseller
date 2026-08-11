# ReBooty Treasures — Business Systems

Ops repo for ReBooty Treasures LLC: inventory/profit tracking, marketplace API
sync, tax export, and SOPs for a reselling business (eBay, Mercari, Poshmark,
Depop, Facebook Marketplace, Google Merchant Center).

Start here: [PROJECT_PLAN.md](PROJECT_PLAN.md) — full status, decisions made,
open questions, and next steps.

## Layout

- `spreadsheet/` — the business tracker workbook (inventory, sales, tax summary)
- `scripts/` — marketplace API sync scripts (eBay first, others to follow)
- `docs/` — SOPs and process documentation
- `data/` — local-only cache/exports (gitignored, not committed)

## Setup

1. Copy `.env.example` to `.env` and fill in real credentials. `.env` is
   gitignored and must never be committed.
2. See [GIT-WORKFLOW.md](GIT-WORKFLOW.md) for the branching/commit workflow
   used in this repo.
