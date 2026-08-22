const path = require('path');

// Single source of truth for env var reads -- loaded once here rather than
// separately in server.js/knexfile.js/seeds (each of which is a different
// entry point: the app server, the standalone `knex` CLI, and seed runs).
// Requiring this module triggers the dotenv load as a side effect, so each
// entry point still gets .env loaded no matter which one starts first.
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

module.exports = {
  app: {
    port: process.env.PORT || 3000,
    publicUrl: process.env.APP_PUBLIC_URL,
    sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  },
  auth: {
    adminUsername: process.env.ADMIN_USERNAME,
    adminPassword: process.env.ADMIN_PASSWORD,
  },
  db: {
    client: process.env.DB_CLIENT || 'better-sqlite3',
    file: process.env.DB_FILE || './data/rebooty.sqlite3',
    url: process.env.DATABASE_URL,
    // Supabase (and Render/managed Postgres generally) requires SSL; a local
    // docker-compose Postgres doesn't support it at all. Defaults on since
    // every real deployment needs it -- set DB_SSL=false for local Docker.
    ssl: process.env.DB_SSL !== 'false',
  },
  uploads: {
    dir: process.env.REBOOTY_UPLOADS_DIR,
  },
  storage: {
    // Auto-selects R2 once bucket/credentials are present; otherwise falls
    // back to local disk (REBOOTY_UPLOADS_DIR, or public/uploads for plain
    // `npm run dev`). A container's own filesystem doesn't survive redeploys
    // or scale past one instance, so R2 is required for Render.
    driver: process.env.R2_BUCKET ? 'r2' : 'local',
    r2: {
      endpoint: process.env.R2_ENDPOINT,
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      bucket: process.env.R2_BUCKET,
    },
  },
  ebay: {
    clientId: process.env.EBAY_CLIENT_ID,
    clientSecret: process.env.EBAY_CLIENT_SECRET,
    devId: process.env.EBAY_DEV_ID,
    refreshToken: process.env.EBAY_REFRESH_TOKEN,
    env: process.env.EBAY_ENV || 'production',
    // Every eBay API host used to be hardcoded to production across the
    // service files below, so EBAY_ENV=sandbox had no actual effect on which
    // host was called. This is the single place that decision is made now.
    apiBase:
      (process.env.EBAY_ENV || 'production') === 'sandbox'
        ? 'https://api.sandbox.ebay.com'
        : 'https://api.ebay.com',
    paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID,
    returnPolicyId: process.env.EBAY_RETURN_POLICY_ID,
    fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID,
    shipFromPostalCode: process.env.EBAY_SHIP_FROM_POSTAL_CODE,
    shipFromCountry: process.env.EBAY_SHIP_FROM_COUNTRY,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  serpapi: {
    key: process.env.SERPAPI_KEY,
  },
};
