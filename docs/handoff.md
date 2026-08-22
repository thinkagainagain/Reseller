# Session handoff

Last updated: 2026-08-22. This is a living "pick up here" doc — overwrite it (don't
accumulate dated copies) whenever a session ends mid-thread on something worth
resuming cleanly.

## Where things stand right now

**Actively migrating off Hostinger to Render (Docker), with a staging/production
split.** Full phased plan: `C:\Users\lucas\.claude\plans\misty-riding-dawn.md`
(also referenced from Claude's memory as `rebooty-hosting-migration-plan`).
Reason: eBay's OAuth token endpoint has been returning HTTP 500 for weeks, but
only for requests from Hostinger's shared-hosting IP (see below) — combined
with the user re-raising the "productize this as a SaaS someday" idea as more
concrete, that justified a real infrastructure move rather than another patch.

**Migration progress — Phases 0-3 done, verified, and pushed to `main`** (each
auto-deployed to Hostinger as a safe no-op there, since none of it activates
without env vars Hostinger doesn't have set):
- Phase 0 (`085475d`): persistent session store (`connect-pg-simple`) — fixed
  a real bug where logins didn't survive a restart.
- Phase 1 (`1516113`): fixed `EBAY_ENV=sandbox` never actually taking effect —
  every eBay API host was hardcoded to production. `config.ebay.apiBase` is
  the fix.
- Phase 2 (`382b972`): `Dockerfile` + `docker-compose.yml`, verified locally
  (build, all 13 migrations, seed, login, upload, restart the app container,
  session survives). Also fixed two Docker-specific bugs it surfaced: DB SSL
  was hardcoded on (added `DB_SSL` toggle) and a fresh named volume was
  root-owned while the app runs as non-root.
- Phase 3 (`2ae433a`): moved uploaded photos to Cloudflare R2 via a new
  `src/lib/storage.js` (replaces the deleted `src/lib/uploadsDir.js`).
  Verified against a real R2 bucket (`rebooty-uploads-staging`, account
  `5b0d99d2e11a844b9e2ac82d5db6ef77`) — write, byte-identical read-back,
  404 on missing, and delete-through-the-app all confirmed. Also wrote (not
  yet run) `src/scripts/migrateUploadsToR2.js` for the ~1300 real prod
  photos, which only runs in Phase 6 once a prod bucket exists.
- Docker Desktop is installed and working on the user's machine (via WSL2).

**Not yet done — pick up here next**: Phase 4 (provision staging) onward.
Concretely, still need:
1. New Supabase project for staging (`rebooty-ops-staging`) — separate from
   prod, so staging never touches real financial/inventory data.
2. Second R2 bucket (`rebooty-uploads-prod`) — only `rebooty-uploads-staging`
   exists so far.
3. eBay Sandbox app registration + one-time OAuth consent flow to get a
   sandbox `EBAY_REFRESH_TOKEN`, plus sandbox business policy IDs.
4. `git checkout -b staging`, push it.
5. `render.yaml` Blueprint defining both services (not written yet — nothing
   is deployed to Render at all yet, this is still ahead of us).
6. Render account signup, deploy staging, verify end-to-end including a real
   eBay Sandbox publish.
7. Then Phase 6-8: provision production, migrate the real photos, verify
   against a temporary Render URL, cut over DNS.

See the plan file for full detail on each of these — don't re-derive the
reasoning, it's all there (why R2 not a persistent disk, why Sandbox not a
disabled publish flow, the `APP_PUBLIC_URL` chicken-and-egg issue at cutover,
etc).

## Hostinger/eBay networking issue (why this migration started)

**eBay's OAuth token endpoint 500s specifically for requests from Hostinger's
server.** Confirmed via two independent HTTP clients (`fetch` and raw `curl`,
via [`/sync/diagnose`](../src/routes/sync.js)) both hitting eBay's real
backend and getting a deliberate rejection there — not a code bug, not a
dropped connection. Current best theory: eBay's backend reacting to
Hostinger's shared-hosting outbound IP (`212.1.209.194`) specifically.

**Status as of 2026-08-22**: the finalized ticket
([docs/hostinger-ebay-500-support-ticket.md](hostinger-ebay-500-support-ticket.md))
was submitted to Hostinger support and **they are actively looking into it**
(per the user, this session). Awaiting their reply — check there before
assuming this is still open. Since the migration to Render is underway
regardless (a static outbound IP there is the actual fix), Hostinger's
response mostly matters now as a possible faster/interim resolution, not as
the long-term plan.

**Workaround still in use** for anything that needs to hit eBay's API before
the migration completes: run the action from a local machine (or Claude
Code's Bash access) against production data directly
(`DB_CLIENT=pg DATABASE_URL=... APP_PUBLIC_URL=https://ops.rebootytreasures.com`).

## Other context (established, not changing)

The app's folder structure (centralized `src/config/`, per-feature
`src/views/` subfolders, `npm test` scaffold) was reorganized in an earlier
session and is stable — see [DEPLOYMENT.md](../DEPLOYMENT.md) (still describes
the *current* Hostinger deploy flow, will need rewriting once Render is live)
and [README.md](../README.md) for layout.
