const path = require('path');

// Photos must live outside the app's own source tree. Hostinger's auto-deploy
// creates a brand-new versioned folder for every push -- anything saved under
// __dirname-relative paths (like the old public/uploads) gets orphaned in the
// previous deploy's folder the moment the next deploy happens. UPLOADS_DIR
// points at a stable location that survives deploys; falls back to a local
// public/uploads folder for local dev, where this isn't a concern.
const UPLOADS_ROOT = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '..', '..', 'public', 'uploads');

module.exports = { UPLOADS_ROOT };
