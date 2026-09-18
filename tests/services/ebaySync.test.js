const { test } = require('node:test');
const assert = require('node:assert/strict');
const { looksLikeOwnSku, resolveActiveListingStatus } = require('../../src/services/ebaySync');

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
