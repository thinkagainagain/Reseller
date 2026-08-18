const express = require('express');
const db = require('../db');
const { computeProfit } = require('../lib/profit');

const router = express.Router();

const PROFIT_WINDOW_DAYS = 90;

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function monthLabel(dateStr) {
  const [year, month] = dateStr.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function rollUp(rows, keyFn) {
  const buckets = new Map();

  for (const row of rows) {
    const key = keyFn(row);
    if (!buckets.has(key)) {
      buckets.set(key, { key, revenue: 0, profit: 0, count: 0 });
    }
    const bucket = buckets.get(key);
    const { revenue, profit } = computeProfit(row);
    bucket.revenue += revenue;
    bucket.profit += profit;
    bucket.count += 1;
  }

  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    marginPct: bucket.revenue > 0 ? (bucket.profit / bucket.revenue) * 100 : 0,
  }));
}

router.get('/dashboard', async (req, res) => {
  const [active, waiting, deathPile, sold] = await Promise.all([
    db('inventory').where({ status: 'Active' }).count('* as count').first(),
    db('inventory').where({ status: 'Intake' }).count('* as count').sum('purchase_cost as tiedUp').first(),
    db('inventory').where({ status: 'Death Pile' }).count('* as count').sum('purchase_cost as tiedUp').first(),
    db('inventory').where({ status: 'Sold' }).count('* as count').first(),
  ]);

  const saleSelect = [
    'sales_log.sku', 'inventory.item_name', 'sales_log.platform', 'sales_log.sale_date',
    'sales_log.sale_price', 'sales_log.shipping_charged', 'sales_log.shipping_cost',
    'sales_log.other_fees', 'inventory.purchase_cost', 'platform_fees.fee_percent', 'platform_fees.flat_fee',
  ];

  const recentSalesRaw = await db('sales_log')
    .join('inventory', 'sales_log.sku', 'inventory.sku')
    .join('platform_fees', 'sales_log.platform', 'platform_fees.platform')
    .select(saleSelect)
    .orderBy('sales_log.sale_date', 'desc')
    .limit(10);

  const recentSales = recentSalesRaw.map((sale) => ({ ...sale, ...computeProfit(sale) }));

  const profitWindowStart = toDateOnly(new Date(Date.now() - PROFIT_WINDOW_DAYS * 24 * 60 * 60 * 1000));
  const profitWindowSales = await db('sales_log')
    .join('inventory', 'sales_log.sku', 'inventory.sku')
    .join('platform_fees', 'sales_log.platform', 'platform_fees.platform')
    .select(saleSelect)
    .where('sales_log.sale_date', '>=', profitWindowStart);

  const monthlyProfit = rollUp(profitWindowSales, (row) => row.sale_date.slice(0, 7))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((bucket) => ({ ...bucket, label: monthLabel(bucket.key) }));

  const platformProfit = rollUp(profitWindowSales, (row) => row.platform)
    .sort((a, b) => b.profit - a.profit)
    .map((bucket) => ({ ...bucket, label: bucket.key }));

  const today = toDateOnly(new Date());
  const weekAgo = toDateOnly(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  const [listedToday, listedThisWeek, listingDurations] = await Promise.all([
    db('inventory').where('first_listed_date', today).count('* as count').first(),
    db('inventory').where('first_listed_date', '>=', weekAgo).count('* as count').first(),
    db('inventory')
      .whereNotNull('date_acquired')
      .whereNotNull('date_submitted')
      .select('date_acquired', 'date_submitted'),
  ]);

  let avgDaysToList = null;
  if (listingDurations.length > 0) {
    const totalDays = listingDurations.reduce((sum, row) => {
      const days = (new Date(row.date_submitted) - new Date(row.date_acquired)) / (24 * 60 * 60 * 1000);
      return sum + days;
    }, 0);
    avgDaysToList = totalDays / listingDurations.length;
  }

  res.render('dashboard', {
    activeCount: Number(active.count),
    waitingCount: Number(waiting.count),
    waitingTiedUp: Number(waiting.tiedUp || 0),
    deathPileCount: Number(deathPile.count),
    deathPileTiedUp: Number(deathPile.tiedUp || 0),
    soldCount: Number(sold.count),
    recentSales,
    monthlyProfit,
    platformProfit,
    listedToday: Number(listedToday.count),
    listedThisWeek: Number(listedThisWeek.count),
    avgDaysToList,
  });
});

module.exports = router;
