const PREFIX = 'RT-';
const PAD_LENGTH = 4;

function skuFromNumber(n) {
  return PREFIX + String(n).padStart(PAD_LENGTH, '0');
}

// Pulled out so callers that already have a batch of rows in memory (e.g. a
// sync loop creating several new SKUs in one pass) can compute this once
// instead of re-querying the whole table for every single new row.
function maxSkuNumber(rows) {
  let max = 0;
  for (const { sku } of rows) {
    if (sku && sku.startsWith(PREFIX)) {
      const n = parseInt(sku.slice(PREFIX.length), 10);
      if (!Number.isNaN(n) && n > max) {
        max = n;
      }
    }
  }
  return max;
}

async function nextSku(db) {
  const rows = await db('inventory').select('sku');
  return skuFromNumber(maxSkuNumber(rows) + 1);
}

module.exports = { nextSku, maxSkuNumber, skuFromNumber };
