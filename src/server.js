const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');

const config = require('./config');
const db = require('./db');
const requireAuth = require('./middleware/requireAuth');
const authRoutes = require('./routes/auth');
const intakeRoutes = require('./routes/intake');
const inventoryRoutes = require('./routes/inventory');
const dashboardRoutes = require('./routes/dashboard');
const syncRoutes = require('./routes/sync');
const salesRoutes = require('./routes/sales');
const skuExportRoutes = require('./routes/skuExport');
const readyToPublishRoutes = require('./routes/readyToPublish');
const { UPLOADS_ROOT } = require('./lib/uploadsDir');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Cache-busting query string for /css/style.css -- without this, browsers
// and Hostinger's CDN can keep serving a stale cached copy after a deploy
// even though the HTML (rendered fresh per-request) is already current.
app.locals.cssVersion = fs.statSync(path.join(__dirname, '..', 'public', 'css', 'style.css')).mtimeMs;

// No DB/session dependency -- must stay reachable during migrate-on-boot and
// answer instantly for a hosting platform's health check.
app.get('/healthz', (req, res) => res.status(200).send('ok'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));
// Served separately from UPLOADS_ROOT (which lives outside the app's own
// source tree in production) rather than as part of public/ -- see
// src/lib/uploadsDir.js for why.
app.use('/uploads', express.static(UPLOADS_ROOT));

// Default express-session store is in-process memory -- fine for local SQLite
// dev (always single-instance, throwaway data) but loses every session on
// each restart/redeploy in production. On Postgres, back sessions with the
// same database instead (table created by migration 013, not runtime DDL, so
// concurrent instances booting together can't race on table creation).
const sessionStore =
  config.db.client === 'pg'
    ? new pgSession({
        pool: new Pool({
          connectionString: config.db.url,
          ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
        }),
        tableName: 'session',
        createTableIfMissing: false,
      })
    : undefined;

app.use(
  session({
    store: sessionStore,
    secret: config.app.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }, // 30 days
  })
);

app.use(authRoutes);
app.use(requireAuth, intakeRoutes);
app.use(requireAuth, inventoryRoutes);
app.use(requireAuth, dashboardRoutes);
app.use(requireAuth, syncRoutes);
app.use(requireAuth, salesRoutes);
app.use(requireAuth, skuExportRoutes);
app.use(requireAuth, readyToPublishRoutes);

app.get('/', (req, res) => res.redirect('/dashboard'));

app.use((req, res) => res.status(404).render('errors/404'));

// Express only treats a 4-arg middleware as the error handler -- `next` must
// stay in the signature even though it's never called.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('errors/500');
});

const PORT = config.app.port;

db.migrate
  .latest()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`ReBooty Ops running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to run database migrations on startup:', err);
    process.exit(1);
  });
