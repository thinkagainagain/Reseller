const express = require('express');
const db = require('../db');
const constants = require('../lib/constants');

const router = express.Router();

router.get('/sales/new', async (req, res) => {
  const sku = req.query.sku || '';
  const item = sku ? await db('inventory').where({ sku }).first() : null;

  res.render('sales/sale-new', {
    item,
    sku,
    constants,
    today: new Date().toISOString().slice(0, 10),
    error: null,
  });
});

router.post('/sales', async (req, res) => {
  const {
    sku, platform, sale_date, sale_price, shipping_charged, shipping_cost, other_fees,
    tracking_number,
  } = req.body;

  const item = await db('inventory').where({ sku }).first();
  if (!item) {
    return res.render('sales/sale-new', {
      item: null,
      sku,
      constants,
      today: sale_date || new Date().toISOString().slice(0, 10),
      error: `No item found with SKU "${sku}".`,
    });
  }

  await db.transaction(async (trx) => {
    await trx('sales_log').insert({
      sku,
      platform,
      sale_date,
      sale_price: Number(sale_price || 0),
      shipping_charged: shipping_charged === '' ? 0 : Number(shipping_charged),
      shipping_cost: shipping_cost === '' ? null : Number(shipping_cost),
      other_fees: other_fees === '' ? 0 : Number(other_fees),
      tracking_number: tracking_number?.trim() || null,
      // Manual sales (Poshmark, Mercari, etc.) are logged with everything
      // already known up front, unlike eBay's auto-detected sale-then-
      // later-ship flow -- so they go straight to Completed rather than
      // sitting in the Current queue with nothing left to fill in.
      shipped_date: sale_date,
    });

    if (item.status !== 'Sold') {
      await trx('inventory').where({ sku }).update({ status: 'Sold', updated_at: trx.fn.now() });
    }
  });

  res.redirect('/orders/completed');
});

module.exports = router;
