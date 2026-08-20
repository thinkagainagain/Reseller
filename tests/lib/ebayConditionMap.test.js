const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getConditionId } = require('../../src/lib/ebayConditionMap');

test('getConditionId maps known condition names to their eBay ConditionID', () => {
  assert.equal(getConditionId('New'), 1000);
  assert.equal(getConditionId('Good'), 4000);
});

test('getConditionId returns null for an unmapped condition name', () => {
  assert.equal(getConditionId('Not A Real Condition'), null);
});
