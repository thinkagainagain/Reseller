const express = require('express');
const db = require('../db');

const router = express.Router();

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

  res.render('dashboard', {
    activeCount: Number(active.count),
    waitingCount: Number(waiting.count),
    waitingTiedUp: Number(waiting.tiedUp || 0),
    deathPileCount: Number(deathPile.count),
    deathPileTiedUp: Number(deathPile.tiedUp || 0),
    soldCount: Number(sold.count),
    recentSales,
  });
});

module.exports = router;
