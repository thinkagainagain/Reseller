const { test } = require('node:test');
const assert = require('node:assert/strict');
const { looksLikeOwnSku, resolveActiveListingStatus, pickSkuForNewListing } = require('../../src/services/ebaySync');

test('looksLikeOwnSku recognizes the default RT prefix', () => {
  assert.equal(looksLikeOwnSku('RT-0001'), true);
});

test('looksLikeOwnSku recognizes a custom Intake prefix', () => {
  assert.equal(looksLikeOwnSku('JS-0042'), true);
});

test('looksLikeOwnSku rejects a legacy bin-location-style code', () => {
  assert.equal(looksLikeOwnSku('Shelf3'), false);
  assert.equal(looksLikeOwnSku('A1'), false);
});

test('looksLikeOwnSku rejects blank/missing values', () => {
  assert.equal(looksLikeOwnSku(''), false);
  assert.equal(looksLikeOwnSku(null), false);
  assert.equal(looksLikeOwnSku(undefined), false);
});

test('resolveActiveListingStatus keeps a stocked Active listing Active', () => {
  assert.equal(resolveActiveListingStatus('Active', 3), 'Active');
});

test('resolveActiveListingStatus moves an out-of-stock Active listing to Ended', () => {
  assert.equal(resolveActiveListingStatus('Active', 0), 'Ended');
});

test('resolveActiveListingStatus never reopens a row already resolved elsewhere', () => {
  assert.equal(resolveActiveListingStatus('Sold', 0), 'Sold');
  assert.equal(resolveActiveListingStatus('Death Pile', 0), 'Death Pile');
  assert.equal(resolveActiveListingStatus('Ended', 0), 'Ended');
});

test('resolveActiveListingStatus pulls a row from any prior status back to Active once restocked', () => {
  assert.equal(resolveActiveListingStatus('Ready to Publish', 5), 'Active');
  assert.equal(resolveActiveListingStatus('Scheduled', 5), 'Active');
});

test('pickSkuForNewListing uses the listing\'s own-looking SKU as-is when unclaimed', () => {
  const used = new Set();
  const result = pickSkuForNewListing('RT-0042', used, () => { throw new Error('should not generate'); });
  assert.deepEqual(result, { sku: 'RT-0042', usingOwnSku: true, isDuplicateLabel: false });
  assert.equal(used.has('RT-0042'), true);
});

test('pickSkuForNewListing generates a fresh SKU for a non-own-looking Custom Label', () => {
  const used = new Set();
  let counter = 0;
  const result = pickSkuForNewListing('Shelf B3', used, () => `RT-${++counter}`);
  assert.deepEqual(result, { sku: 'RT-1', usingOwnSku: false, isDuplicateLabel: false });
});

test('pickSkuForNewListing falls back to a generated SKU when two listings share the same own-looking Custom Label', () => {
  // Reproduces a real production case: two different eBay listings (a
  // relist or a copied listing) both carry Custom Label "RT-1491". The
  // first claims it outright; the second must not collide with it.
  const used = new Set();
  const first = pickSkuForNewListing('RT-1491', used, () => { throw new Error('should not generate'); });
  assert.deepEqual(first, { sku: 'RT-1491', usingOwnSku: true, isDuplicateLabel: false });

  const second = pickSkuForNewListing('RT-1491', used, () => 'RT-1492');
  assert.deepEqual(second, { sku: 'RT-1492', usingOwnSku: false, isDuplicateLabel: true });
  assert.equal(used.has('RT-1492'), true);
});

test('pickSkuForNewListing skips a generated number that an earlier own-SKU listing in the batch already claimed', () => {
  // The sequential counter only knows what's in the DB, not what other
  // listings in this same batch already claimed via their own Custom
  // Label -- it must not hand out a number that collides with one of those.
  const used = new Set(['RT-0100']); // already claimed via an own-SKU listing earlier in the loop
  const sequence = ['RT-0100', 'RT-0101'];
  let i = 0;
  const result = pickSkuForNewListing('Shelf B3', used, () => sequence[i++]);
  assert.deepEqual(result, { sku: 'RT-0101', usingOwnSku: false, isDuplicateLabel: false });
});

const { flattenListing, variationLabelFromAspects, statusAfterSale } = require('../../src/services/ebaySync');

test('flattenListing leaves a plain listing as a single entry', () => {
  const [entry, ...rest] = flattenListing({ itemId: '1', sku: 'RT-0001', price: 10, quantityAvailable: 1, variations: [] });
  assert.equal(rest.length, 0);
  assert.equal(entry.isVariation, false);
  assert.equal(entry.sku, 'RT-0001');
});

test('flattenListing splits a variation listing into one entry per variation, ignoring the listing-level SKU', () => {
  const entries = flattenListing({
    itemId: '9', sku: 'PARENT', title: 'Pyrex bowl', price: 10, quantityAvailable: 5,
    variations: [
      { sku: 'RT-0010', label: 'Red', price: 12, quantityAvailable: 3 },
      { sku: 'RT-0011', label: 'Blue', price: 0, quantityAvailable: 2 },
    ],
  });
  assert.deepEqual(
    entries.map((e) => [e.itemId, e.sku, e.variantLabel, e.price, e.quantityAvailable, e.isVariation]),
    [['9', 'RT-0010', 'Red', 12, 3, true], ['9', 'RT-0011', 'Blue', 10, 2, true]]
  );
});

test('variationLabelFromAspects matches the Trading API label format', () => {
  assert.equal(variationLabelFromAspects([{ name: 'Color', value: 'Blue' }, { name: 'Size', value: 'Large' }]), 'Blue / Large');
  assert.equal(variationLabelFromAspects(undefined), null);
});

test('statusAfterSale marks a one-of-a-kind item Sold on its sale', () => {
  assert.equal(statusAfterSale({ status: 'Active', quantity: 1, multi_unit: false }), 'Sold');
});

test('statusAfterSale keeps a multi-unit SKU Active while eBay still has units left', () => {
  assert.equal(statusAfterSale({ status: 'Active', quantity: 2, multi_unit: true }), 'Active');
});

test('statusAfterSale marks a multi-unit SKU Sold once its last unit is gone', () => {
  assert.equal(statusAfterSale({ status: 'Active', quantity: 0, multi_unit: true }), 'Sold');
  assert.equal(statusAfterSale({ status: 'Ended', quantity: 0, multi_unit: true }), 'Sold');
});
