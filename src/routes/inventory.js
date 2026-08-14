const express = require('express');
const db = require('../db');
const constants = require('../lib/constants');

const router = express.Router();

router.get('/inventory', async (req, res) => {
  const items = await db('inventory').orderBy('date_acquired', 'desc');
  res.render('inventory', { items });
});

router.get('/inventory/:sku/edit', async (req, res) => {
  const item = await db('inventory').where({ sku: req.params.sku }).first();
  if (!item) {
    return res.status(404).send('SKU not found');
  }
  res.render('inventory-edit', { item, constants, returnTo: req.query.from === 'queue' ? 'queue' : 'inventory' });
});

router.post('/inventory/:sku/edit', async (req, res) => {
  const { sku } = req.params;
  const {
    item_name, category, source, condition, purchase_cost, list_price,
    bin_location, status, death_pile_reason, death_pile_action_plan,
    date_acquired, notes, return_to,
  } = req.body;

  await db('inventory')
    .where({ sku })
    .update({
      item_name: item_name?.trim() || null,
      category: category || null,
      source: source || null,
      condition: condition || null,
      purchase_cost: purchase_cost === '' ? null : Number(purchase_cost),
      list_price: list_price === '' ? null : Number(list_price),
      bin_location: bin_location?.trim() || null,
      status,
      death_pile_reason: death_pile_reason || null,
      death_pile_action_plan: death_pile_action_plan || null,
      date_acquired: date_acquired || null,
      notes: notes?.trim() || null,
      updated_at: db.fn.now(),
    });

  res.redirect(return_to === 'queue' ? '/intake/queue' : '/inventory');
});

module.exports = router;
