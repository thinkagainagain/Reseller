const path = require('path');
const config = require('../config');

// Photos must live outside the app's own source tree. Hostinger's auto-deploy
// creates a brand-new versioned folder for every push -- anything saved under
// __dirname-relative paths (like the old public/uploads) gets orphaned in the
// previous deploy's folder the moment the next deploy happens. REBOOTY_UPLOADS_DIR
// points at a stable location that survives deploys; falls back to a local
// public/uploads folder for local dev, where this isn't a concern.
//
// Named with a REBOOTY_ prefix (not plain UPLOADS_DIR) because Hostinger's
// panel silently refused to persist a variable named exactly "UPLOADS_DIR" --
// confirmed via testing that the same value under a different name saves
// fine, so it's a reserved/internal name collision on their end, not
// anything wrong with the value itself.
const UPLOADS_ROOT = config.uploads.dir
  ? path.resolve(config.uploads.dir)
  : path.join(__dirname, '..', '..', 'public', 'uploads');

module.exports = { UPLOADS_ROOT };
