require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');

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

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));
// Served separately from UPLOADS_ROOT (which lives outside the app's own
// source tree in production) rather than as part of public/ -- see
// src/lib/uploadsDir.js for why.
app.use('/uploads', express.static(UPLOADS_ROOT));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
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

const PORT = process.env.PORT || 3000;

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
