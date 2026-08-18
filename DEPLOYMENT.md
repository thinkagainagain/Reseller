# Deploying to Production (Hostinger)

How changes get from this repo to `https://ops.rebootytreasures.com`. Reconstructed
from commit history and `.env.example` (2026-08-18) — see the note at the bottom if
any step doesn't match what you see in hPanel.

## How it works

The app runs on Hostinger Business Premium hosting as a Node.js app under hPanel,
connected directly to this GitHub repo (`thinkagainagain`, branch `main`). Every
`git push` to `main` triggers Hostinger to pull the latest commit and deploy it into
a **brand-new versioned folder** — it does not update files in place.

This versioned-folder behavior is why a few things in this app work the way they do:

- **Uploaded intake photos live outside the app's source tree** (`REBOOTY_UPLOADS_DIR`,
  see [uploadsDir.js](src/lib/uploadsDir.js)). Anything saved under a path relative to
  the app folder (like a plain `public/uploads`) gets orphaned in the *previous*
  deploy's folder the moment the next deploy happens.
- **CSS is cache-busted with a file-modified-time query string**
  ([server.js](src/server.js)) so browsers/Hostinger's CDN don't keep serving a stale
  `style.css` after a deploy.
- **Database migrations run automatically on server boot** (`db.migrate.latest()` in
  [server.js](src/server.js), before `app.listen()`), so a fresh deploy always ends up
  on the current schema without a manual migration step.

## Everyday deploy workflow

```bash
git status
git add <changed files>
git commit -m "Describe what changed and why"
git push
```

Once pushed, Hostinger picks it up and deploys automatically. Give it a minute, then
check the live site to confirm the change is there (hard-refresh or check the page
for the new content — CSS/JS are cache-busted but HTML from a browser's own cache can
still look stale).

## Environment variables

Set once in hPanel's Node.js app panel, **not** in the repo — `.env` is gitignored
and never gets deployed. A fresh deploy reuses whatever's already set in hPanel, so
env vars don't need to be re-entered on every push, only when a new one is introduced
(check [.env.example](.env.example) for the current full list and what each one is
for).

One naming gotcha: hPanel silently refuses to save a variable named exactly
`UPLOADS_DIR` (confirmed reserved/internal collision on Hostinger's end) — that's why
it's `REBOOTY_UPLOADS_DIR` instead. If a future env var mysteriously won't save, try
prefixing it.

## Known issue: eBay OAuth token endpoint 500s from Hostinger's network

eBay's `POST /identity/v1/oauth2/token` (used by [ebayAuth.js](src/services/ebayAuth.js)
for every sync/publish action) intermittently returns a 500 specifically when the
request originates from Hostinger's server — the exact same request succeeds from
every other network tested (local machine, Claude Code's own environment). Root cause
still unconfirmed; open with Hostinger support.

- **Workaround**: run the affected action (sync, publish) from a local machine or
  Claude Code's Bash access against production data directly
  (`DB_CLIENT=pg DATABASE_URL=... APP_PUBLIC_URL=https://ops.rebootytreasures.com`),
  bypassing Hostinger's network entirely.
- **Diagnostic tool**: `/sync/diagnose` (linked from the Sync page) runs the token
  request via both Node `fetch` and a raw `curl` process from wherever the app is
  actually running, and prints sanitized status/headers/body for both — built
  specifically to generate evidence for a Hostinger support ticket. Check whether
  this has been resolved before assuming the workaround is still needed.

## If this doc goes stale

This was written by reading git history and `.env.example`, not by directly
inspecting hPanel's dashboard — nobody had eyes on the actual Git-deployment settings
screen while writing it. If deploys stop showing up automatically after a push, the
most likely explanation is that hPanel's auto-deploy toggle got turned off or the
branch tracking changed, in which case check hPanel → your Node.js app → Git/Deploy
settings directly and update this doc with what's actually there.
