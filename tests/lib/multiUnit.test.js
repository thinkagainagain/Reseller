const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseUnitRows } = require('../../src/lib/multiUnit');

test('parseUnitRows pairs each photo with its Qty / Label / Cost by position', () => {
  const rows = parseUnitRows(
    { unit_quantity: ['3', '3'], unit_label: ['Red', ' Blue '], unit_cost: ['4.50', ''] },
    2
  );
  assert.deepEqual(rows, [
    { quantity: 3, variantLabel: 'Red', purchaseCost: 4.5 },
    { quantity: 3, variantLabel: 'Blue', purchaseCost: null },
  ]);
});

test('parseUnitRows handles a single photo (fields arrive as plain strings)', () => {
  assert.deepEqual(parseUnitRows({ unit_quantity: '12', unit_label: '', unit_cost: '2' }, 1), [
    { quantity: 12, variantLabel: null, purchaseCost: 2 },
  ]);
});

test('parseUnitRows falls back to one unit for missing or nonsense input', () => {
  const rows = parseUnitRows({ unit_quantity: ['0', 'abc'], unit_cost: ['-1'] }, 3);
  assert.deepEqual(rows.map((r) => r.quantity), [1, 1, 1]);
  assert.equal(rows[0].purchaseCost, null);
});
