const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeProfit } = require('../../src/lib/profit');

test('computeProfit applies percent and flat fee to revenue', () => {
  const result = computeProfit({
    sale_price: 100,
    shipping_charged: 10,
    shipping_cost: 5,
    other_fees: 2,
    purchase_cost: 30,
    fee_percent: 0.13,
    flat_fee: 0.3,
  });

  // revenue = 110, platformFee = 110*0.13 + 0.3 = 14.6
  assert.equal(result.revenue, 110);
  assert.ok(Math.abs(result.platformFee - 14.6) < 1e-9);
  assert.ok(Math.abs(result.profit - (110 - 14.6 - 30 - 5 - 2)) < 1e-9);
  assert.ok(Math.abs(result.marginPct - (result.profit / 110) * 100) < 1e-9);
});

test('computeProfit does not divide by zero when revenue is zero', () => {
  const result = computeProfit({
    sale_price: 0,
    shipping_charged: 0,
    shipping_cost: 0,
    other_fees: 0,
    purchase_cost: 20,
    fee_percent: 0.13,
    flat_fee: 0.3,
  });

  assert.equal(result.revenue, 0);
  assert.equal(result.marginPct, 0);
});
