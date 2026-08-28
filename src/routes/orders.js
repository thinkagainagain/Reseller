const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/orders/current', async (req, res) => {
  const items = await db('sales_log')
    .join('inventory', 'inventory.sku', 'sales_log.sku')
    .whereNull('sales_log.shipped_date')
    .select(
      'sales_log.id',
      'inventory.sku',
      'inventory.bin_location',
      'inventory.item_name',
      'sales_log.platform',
      'sales_log.sale_date',
      'sales_log.sale_price'
    )
    .orderBy(['inventory.sku', 'inventory.bin_location', 'inventory.item_name']);

  res.render('orders/current', { items });
});

router.get('/orders/completed', async (req, res) => {
  const items = await db('sales_log')
    .join('inventory', 'inventory.sku', 'sales_log.sku')
    .whereNotNull('sales_log.shipped_date')
    .select(
      'inventory.sku',
      'inventory.item_name',
      'inventory.bin_location',
      'sales_log.sale_price',
      'sales_log.platform',
      'sales_log.sale_date',
      'sales_log.shipped_date',
      'sales_log.tracking_number',
      'sales_log.shipping_carrier',
      'sales_log.ebay_actual_fee'
    )
    .orderBy('sales_log.shipped_date', 'desc');

  res.render('orders/completed', { items });
});

router.post('/orders/:salesLogId/ship', async (req, res) => {
  const { salesLogId } = req.params;
  const { tracking_number, shipping_carrier } = req.body;

  await db('sales_log')
    .where({ id: salesLogId })
    .update({
      tracking_number: tracking_number?.trim() || null,
      shipping_carrier: shipping_carrier?.trim() || null,
      shipped_date: new Date().toISOString().slice(0, 10),
      updated_at: db.fn.now(),
    });

  res.redirect('/orders/current');
});

module.exports = router;
