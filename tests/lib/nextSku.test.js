const { test } = require('node:test');
const assert = require('node:assert/strict');
const nextSku = require('../../src/lib/nextSku');

// Matches how the real function calls it: db('inventory').select('sku')
function fakeDb(rows) {
  return () => ({ select: async () => rows });
}

test('nextSku starts at RT-0001 for an empty table', async () => {
  const sku = await nextSku(fakeDb([]));
  assert.equal(sku, 'RT-0001');
});

test('nextSku increments past the highest existing RT-#### SKU', async () => {
  const sku = await nextSku(fakeDb([{ sku: 'RT-0007' }, { sku: 'RT-0003' }]));
  assert.equal(sku, 'RT-0008');
});

test('nextSku ignores SKUs that do not match the RT- prefix', async () => {
  const sku = await nextSku(fakeDb([{ sku: 'RT-0002' }, { sku: 'LEGACY-9999' }]));
  assert.equal(sku, 'RT-0003');
});
