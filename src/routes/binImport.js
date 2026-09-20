const express = require('express');
const db = require('../db');
const { parseBinInput, planBinUpdates, APPLIES } = require('../lib/binImport');

const router = express.Router();

async function loadExisting(skus) {
  const rows = skus.length
    ? await db('inventory').whereIn('sku', skus).select('sku', 'item_name', 'bin_location')
    : [];
  return new Map(rows.map((row) => [row.sku, row]));
}

function render(res, extra = {}) {
  res.render('inventory/import-bins', { pasted: '', error: null, plan: null, applied: null, ...extra });
}

router.get('/inventory/import-bins', (req, res) => render(res));

router.post('/inventory/import-bins/preview', async (req, res) => {
  const pasted = req.body.pasted || '';
  const { entries, error } = parseBinInput(pasted);
  if (error) return render(res, { pasted, error });

  const existing = await loadExisting(entries.map((e) => e.sku));
  const plan = planBinUpdates(entries, existing);
  const updates = plan.items.filter((i) => APPLIES.has(i.kind)).map((i) => ({ sku: i.sku, location: i.location }));
  render(res, { pasted, plan, updatesJson: JSON.stringify(updates) });
});

// Re-runs the same checks against the live DB instead of trusting the preview's
// hidden field, so a stale or edited form can only ever set a bin on a SKU that
// exists.
router.post('/inventory/import-bins/apply', async (req, res) => {
  let submitted = [];
  try {
    submitted = JSON.parse(req.body.updates || '[]');
  } catch (err) {
    return render(res, { error: 'That preview expired or was malformed — paste and preview again.' });
  }

  const entries = submitted.map((u, i) => ({ line: i + 1, sku: String(u.sku || '').toUpperCase(), location: String(u.location || '').trim() }));
  const existing = await loadExisting(entries.map((e) => e.sku));
  const toApply = planBinUpdates(entries, existing).items.filter((i) => APPLIES.has(i.kind));

  await db.transaction(async (trx) => {
    for (const item of toApply) {
      await trx('inventory').where({ sku: item.sku }).update({ bin_location: item.location, updated_at: trx.fn.now() });
    }
  });

  render(res, { applied: toApply.length });
});

module.exports = router;
