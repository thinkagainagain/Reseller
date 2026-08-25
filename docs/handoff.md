# Session handoff

Last updated: 2026-08-25. This is a living "pick up here" doc — overwrite it (don't
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

**Phases 4 and 5 are now DONE** (staging fully provisioned, deployed, and
verified end-to-end). Picked up and completed in one session, 2026-08-24
through 2026-08-25:
- [x] `render.yaml` Blueprint written and committed to `main` (`4140f0e`),
      later trimmed to just the staging service (`e006d1e`) so Phase 4 setup
      didn't force filling in placeholder production secrets — see the
      comment at the top of `render.yaml` for how to add production back.
- [x] `staging` branch created and pushed to origin, tracking
      `origin/staging`.
- [x] New Supabase project `rebooty-ops-staging` created (separate from prod).
      Use the **Session pooler** connection string, not "Direct connection" —
      the direct hostname is IPv6-only and doesn't resolve on this network/
      Node setup (`ENOTFOUND`). Pooler string format:
      `postgresql://postgres.<ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres`.
      All 13 migrations + both seeds (`platform_fees`, `admin_user`) run and
      verified clean against it locally. Staging admin login seeded as
      `staging-admin` (password generated this session, stored only in the
      user's own notes / will go straight into Render's secret fields, not
      committed anywhere).
- [x] eBay Sandbox keyset captured: `Client ID`, `Client Secret`, `Dev ID`
      (same eBay dev account as prod, sandbox keyset shown alongside it —
      no new registration needed).
- [x] Sandbox `EBAY_REFRESH_TOKEN` obtained via three-legged OAuth consent
      (RuName `Rebooty_Treasur-RebootyT-Resell-gianap`, scopes
      `sell.inventory.readonly`, `sell.fulfillment.readonly`,
      `sell.account`), verified working via a live `refresh_token` grant.
      **Gotcha hit along the way**: the portal's built-in "Get a User Token
      Here" quick-test box and the "Auth'n'Auth" branded sign-in link both
      produce values that look superficially like what you need but aren't
      an OAuth authorization code — only the second "Your branded eBay
      Sandbox Sign In (**OAuth**)" link under "Get a Token from eBay via Your
      Application" redirects with a real `?code=...` param usable for the
      standard token exchange. Also: the auth code expires in ~5 minutes and
      is single-use, so paste it back immediately.
- [x] Sandbox business policies created via the Account API (the Sandbox
      Business Policies UI doesn't work for test users — a known Sandbox
      limitation). Required an explicit opt-in first:
      `POST /sell/account/v1/program/opt_in {"programType":
      "SELLING_POLICY_MANAGEMENT"}`, then `createPaymentPolicy`/
      `createReturnPolicy`/`createFulfillmentPolicy`. Policy IDs obtained:
      payment `6246729000`, return `6246730000`, fulfillment `6246728000`.
      Ship-from ZIP for staging: `32034` (same as prod — not sensitive).
      All eBay secrets given directly to the user, not stored in this repo.
- [x] Render account created, `rebooty-ops` Blueprint deployed from
      `render.yaml` (staging service only). Live at
      `https://rebooty-ops-staging.onrender.com`.
- [x] **Phase 5 (staging verification) — all checks passed**:
      - `/healthz` → `ok`.
      - Logged in as `staging-admin`, session persisted.
      - Uploaded a real photo through the deployed app, confirmed
        byte-identical read-back through the R2 proxy.
      - Ran a full sandbox `AddFixedPriceItem` publish (item `110590242491`,
        confirmed `Active` via `GetItem`) — first proof the whole OAuth +
        business-policy + Trading API pipeline works against Render. Left in
        place (SKU `RT-0001`, status `Scheduled`) as the working proof, same
        pattern as the first real production listing.
      - Triggered a manual redeploy on Render, confirmed the session
        survived it without re-login — proves Phase 0's persistent session
        store specifically under Render (not just Docker locally).
      **Real finding surfaced along the way** (not a migration bug, already
      flagged in `src/lib/ebayConditionMap.js`'s comment): eBay's allowed
      `ConditionID` values and required item specifics (Size/Type/Color) are
      category-dependent -- a clothing category rejected `condition: 'Good'`
      and required a Size specific that a Mugs-category test item didn't.
      Worth remembering when testing/using clothing categories specifically.
- [ ] **Pick up here next (new session)**: Phase 6 (provision production) --
      add the production service back into `render.yaml` (it was
      deliberately trimmed out for the Phase 4 deploy, see the comment at
      the top of that file), provision a new `rebooty-uploads-prod` R2
      bucket, run `src/scripts/migrateUploadsToR2.js --commit` against the
      real ~1300 photos pulled off Hostinger, deploy production from the
      Blueprint with real secrets and `APP_PUBLIC_URL` pointed at its
      *temporary* `onrender.com` URL (not the real domain yet -- see the
      plan file's Phase 6 sequencing note on why). Then Phase 7 (verify
      against that temporary URL, including the actual point of this whole
      migration: confirming `/sync/diagnose` returns `200` from Render's
      Static Outbound IP where Hostinger 500'd) and Phase 8 (DNS cutover).

**New wrinkle for Phase 8 specifically (raised 2026-08-25, not yet decided)**:
user is now considering buying a new, catchier domain/brand name rather than
keeping `ops.rebootytreasures.com`, motivated by feeling the app is turning
into a real product with market fit ("the intake fills a gap in the reseller
community"), not just an internal tool. This doesn't block Phases 6-7 at all
(both use Render's own temporary `onrender.com` URL regardless). Only
Phase 8's "point DNS at Render" step depends on which domain is final --
confirm with the user which domain to actually cut over to before executing
Phase 8, don't assume `ops.rebootytreasures.com` by default anymore.

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
