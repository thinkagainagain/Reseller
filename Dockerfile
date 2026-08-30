# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --omit=optional excludes better-sqlite3: it's the local-dev-only SQLite
# fallback (DB_CLIENT=pg always in any container), needs a native build
# toolchain to compile, and has no reason to ever be in this image.
# BUT --omit=optional excludes *every* optional dependency in the whole
# tree, not just our own -- sharp's actual native binary
# (@img/sharp-linux-x64) is published as one of sharp's own
# optionalDependencies (that's how it ships per-platform binaries at all),
# so the first line silently strips it too and `require('sharp')` throws
# at startup with no binary to load. The second line re-adds just sharp's
# subtree with optional deps included, leaving better-sqlite3 alone.
RUN npm ci --omit=dev --omit=optional \
    && npm install --no-save --omit=dev sharp

FROM node:24-bookworm-slim AS runtime
WORKDIR /app

# curl is required at runtime, not just for local debugging -- the
# /sync/diagnose route (src/routes/sync.js) shells out to curl as a second,
# independent HTTP client alongside Node's fetch, specifically to prove eBay's
# token endpoint behaves the same regardless of client. That diagnostic is
# what verifies this migration actually fixed the Hostinger/eBay networking
# issue, so it has to work in the deployed image, not just locally.
# ca-certificates is only a Recommends of curl on Debian, not a hard
# dependency -- --no-install-recommends skips it, leaving curl with no CA
# bundle to validate TLS against (error 77). Node's fetch doesn't hit this
# since it bundles its own root certificates, which is why fetch worked here
# while curl failed with an unexplained TLS error.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
# public/ must ship in the image, not just be present at dev time --
# server.js synchronously stats public/css/style.css at boot for
# cache-busting and will crash on startup if it's missing.
COPY public ./public

RUN chown -R node:node /app

# A fresh named volume is created root-owned by default, and the app runs as
# the non-root `node` user -- pre-creating this path with the right ownership
# here means Docker copies that ownership onto the volume on first mount
# (documented Docker behavior for image-provided volume mount points).
RUN mkdir -p /data/uploads && chown -R node:node /data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:3000/healthz || exit 1

CMD ["node", "src/server.js"]
