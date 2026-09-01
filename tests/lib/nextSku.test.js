const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nextSku, maxSkuNumber, skuFromNumber, normalizePrefix } = require('../../src/lib/nextSku');

// Matches how the real function calls it:
// db('inventory').where('sku', 'like', `${prefix}-%`).select('sku')
function fakeDb(rows) {
  return () => ({
    where(column, _op, pattern) {
      const prefix = pattern.slice(0, -1); // strip the trailing "%"
      return { select: async () => rows.filter((r) => r.sku && r.sku.startsWith(prefix)) };
    },
  });
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

test('nextSku numbers a custom prefix independently from RT', async () => {
  const rows = [{ sku: 'RT-0050' }, { sku: 'JS-0001' }, { sku: 'JS-0002' }];
  assert.equal(await nextSku(fakeDb(rows), 'JS'), 'JS-0003');
  assert.equal(await nextSku(fakeDb(rows)), 'RT-0051');
});

test('nextSku normalizes a messy prefix (lowercase, stray characters)', async () => {
  const sku = await nextSku(fakeDb([{ sku: 'AB-0001' }]), '  ab! ');
  assert.equal(sku, 'AB-0002');
});

test('nextSku falls back to RT when the prefix is blank', async () => {
  const sku = await nextSku(fakeDb([]), '   ');
  assert.equal(sku, 'RT-0001');
});

test('maxSkuNumber computes the same max from an in-memory row batch, no query needed', () => {
  assert.equal(maxSkuNumber([{ sku: 'RT-0007' }, { sku: 'RT-0003' }]), 7);
});

test('maxSkuNumber respects a custom prefix', () => {
  assert.equal(maxSkuNumber([{ sku: 'RT-0099' }, { sku: 'JS-0004' }], 'JS'), 4);
});

test('skuFromNumber pads and prefixes like nextSku does', () => {
  assert.equal(skuFromNumber(8), 'RT-0008');
});

test('skuFromNumber accepts a custom prefix', () => {
  assert.equal(skuFromNumber(3, 'JS'), 'JS-0003');
});

test('normalizePrefix uppercases, strips non-letters, and caps length', () => {
  assert.equal(normalizePrefix('js'), 'JS');
  assert.equal(normalizePrefix(' Js 42! '), 'JS');
  assert.equal(normalizePrefix('reallylongprefix'), 'REALLYLONG');
  assert.equal(normalizePrefix(''), 'RT');
  assert.equal(normalizePrefix(undefined), 'RT');
});
