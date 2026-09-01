const { test } = require('node:test');
const assert = require('node:assert/strict');
const { looksLikeOwnSku } = require('../../src/services/ebaySync');

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
