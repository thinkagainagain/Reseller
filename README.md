# ReBooty Treasures — Business Systems

Node.js/Express web app for ReBooty Treasures LLC: inventory tracking (starting
with a photo-based intake tool), marketplace API sync, tax export, and SOPs for
a reselling business (eBay, Mercari, Poshmark, Depop, Facebook Marketplace,
Google Merchant Center).

Start here: [PROJECT_PLAN.md](PROJECT_PLAN.md) — full status, decisions made,
open questions, and next steps.

## Layout

- `src/` — the app: Express server, routes, SQLite (via Knex) migrations/seeds, EJS views
- `public/` — static assets and intake photo uploads (gitignored)
- `spreadsheet/` — the original business tracker workbook (kept as reference/export target)
- `scripts/` — reserved for one-off/ops scripts
- `docs/` — SOPs and process documentation
- `data/` — local-only SQLite database file (gitignored, not committed)

## Setup

1. Copy `.env.example` to `.env` and fill in real values — at minimum
   `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` to get the app running.
   `.env` is gitignored and must never be committed.
2. `npm install`
3. `npm run migrate` then `npm run seed` — creates `data/rebooty.sqlite3` and
   seeds platform fee rates + your admin login.
4. `npm run dev` — starts the app at `http://localhost:3000`.
5. See [GIT-WORKFLOW.md](GIT-WORKFLOW.md) for the branching/commit workflow
   used in this repo.
