const express = require('express');
const db = require('../db');

const router = express.Router();

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

router.get('/dashboard', async (req, res) => {
  const [active, waiting, deathPile, sold] = await Promise.all([
    db('inventory').where({ status: 'Active' }).count('* as count').first(),
    db('inventory').where({ status: 'Intake' }).count('* as count').sum('purchase_cost as tiedUp').first(),
    db('inventory').where({ status: 'Death Pile' }).count('* as count').sum('purchase_cost as tiedUp').first(),
    db('inventory').where({ status: 'Sold' }).count('* as count').first(),
  ]);

  const recentSales = await db('sales_log')
    .join('inventory', 'sales_log.sku', 'inventory.sku')
    .select('sales_log.sku', 'inventory.item_name', 'sales_log.platform', 'sales_log.sale_date', 'sales_log.sale_price')
    .orderBy('sales_log.sale_date', 'desc')
    .limit(10);

  const today = toDateOnly(new Date());
  const weekAgo = toDateOnly(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  const [listedToday, listedThisWeek, listingDurations] = await Promise.all([
    db('inventory').where('first_listed_date', today).count('* as count').first(),
    db('inventory').where('first_listed_date', '>=', weekAgo).count('* as count').first(),
    db('inventory')
      .whereNotNull('date_acquired')
      .whereNotNull('first_listed_date')
      .select('date_acquired', 'first_listed_date'),
  ]);

  let avgDaysToList = null;
  if (listingDurations.length > 0) {
    const totalDays = listingDurations.reduce((sum, row) => {
      const days = (new Date(row.first_listed_date) - new Date(row.date_acquired)) / (24 * 60 * 60 * 1000);
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
    listedToday: Number(listedToday.count),
    listedThisWeek: Number(listedThisWeek.count),
    avgDaysToList,
  });
});

module.exports = router;
