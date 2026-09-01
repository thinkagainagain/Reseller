const DEFAULT_PREFIX = 'RT';
const PAD_LENGTH = 4;
const MAX_PREFIX_LENGTH = 10;

// Letters only, uppercased, capped in length -- keeps generated SKUs safe
// as eBay Custom Label values and keeps looksLikeOwnSku's pattern match
// (src/services/ebaySync.js) reliable. Blank/invalid input falls back to
// the default so the "RT" behavior never breaks even if a form field is
// left empty or tampered with.
function normalizePrefix(raw) {
  const cleaned = String(raw || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, MAX_PREFIX_LENGTH);
  return cleaned || DEFAULT_PREFIX;
}

function skuFromNumber(n, prefix = DEFAULT_PREFIX) {
  return `${prefix}-${String(n).padStart(PAD_LENGTH, '0')}`;
}

// Pulled out so callers that already have a batch of rows in memory (e.g. a
// sync loop creating several new SKUs in one pass) can compute this once
// instead of re-querying per new row. Each prefix numbers independently --
// "RT-0001" and "JS-0001" don't share a counter.
function maxSkuNumber(rows, prefix = DEFAULT_PREFIX) {
  const withDash = `${prefix}-`;
  let max = 0;
  for (const { sku } of rows) {
    if (sku && sku.startsWith(withDash)) {
      const n = parseInt(sku.slice(withDash.length), 10);
      if (!Number.isNaN(n) && n > max) {
        max = n;
      }
    }
  }
  return max;
}

async function nextSku(db, rawPrefix) {
  const prefix = normalizePrefix(rawPrefix);
  const rows = await db('inventory').where('sku', 'like', `${prefix}-%`).select('sku');
  return skuFromNumber(maxSkuNumber(rows, prefix) + 1, prefix);
}

module.exports = { nextSku, maxSkuNumber, skuFromNumber, normalizePrefix, DEFAULT_PREFIX };
