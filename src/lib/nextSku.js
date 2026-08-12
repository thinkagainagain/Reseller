const PREFIX = 'RT-';
const PAD_LENGTH = 4;

async function nextSku(db) {
  const rows = await db('inventory').select('sku');

  let max = 0;
  for (const { sku } of rows) {
    if (sku && sku.startsWith(PREFIX)) {
      const n = parseInt(sku.slice(PREFIX.length), 10);
      if (!Number.isNaN(n) && n > max) {
        max = n;
      }
    }
  }

  const next = max + 1;
  return PREFIX + String(next).padStart(PAD_LENGTH, '0');
}

module.exports = nextSku;
