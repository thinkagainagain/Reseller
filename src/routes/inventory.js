const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const db = require('../db');
const constants = require('../lib/constants');
const { generateListingDraft } = require('../services/aiListingDraft');
const { UPLOADS_ROOT } = require('../lib/uploadsDir');

const router = express.Router();

router.get('/inventory', async (req, res) => {
  const items = await db('inventory')
    .where({ status: 'Active' })
    .orderBy('date_acquired', 'desc');
  res.render('inventory', { items });
});

router.get('/inventory/sold', async (req, res) => {
  const items = await db('inventory')
    .leftJoin('sales_log', 'inventory.sku', 'sales_log.sku')
    .where('inventory.status', 'Sold')
    .select(
      'inventory.sku',
      'inventory.item_name',
      'inventory.bin_location',
      'sales_log.sale_price',
      'sales_log.sale_date',
      'sales_log.platform'
    )
    .orderBy('sales_log.sale_date', 'desc');
  res.render('sold', { items });
});

router.get('/inventory/death-pile', async (req, res) => {
  const items = await db('inventory')
    .where({ status: 'Death Pile' })
    .orderBy('date_acquired', 'asc');

  const totalTiedUp = items.reduce((sum, item) => sum + Number(item.purchase_cost || 0), 0);

  res.render('death-pile', { items, totalTiedUp });
});

router.get('/inventory/:sku/edit', async (req, res) => {
  const item = await db('inventory').where({ sku: req.params.sku }).first();
  if (!item) {
    return res.status(404).send('SKU not found');
  }

  const returnMap = { queue: 'queue', 'death-pile': 'death-pile', sold: 'sold' };
  const returnTo = returnMap[req.query.from] || 'inventory';

  const hasPhoto = Boolean(await db('intake_photos').where({ sku: item.sku }).first());

  res.render('inventory-edit', { item, constants, returnTo, hasPhoto, aiDraft: false, error: null });
});

router.post('/inventory/:sku/edit', async (req, res) => {
  const { sku } = req.params;
  const {
    item_name, category, source, condition, purchase_cost, list_price,
    bin_location, status, death_pile_reason, death_pile_action_plan,
    date_acquired, notes, description, return_to,
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
      description: description?.trim() || null,
      updated_at: db.fn.now(),
    });

  const redirectMap = {
    queue: '/intake/queue',
    'death-pile': '/inventory/death-pile',
    sold: '/inventory/sold',
  };
  res.redirect(redirectMap[return_to] || '/inventory');
});

router.post('/inventory/:sku/generate-ai', async (req, res) => {
  const { sku } = req.params;
  const { return_to } = req.body;

  const item = await db('inventory').where({ sku }).first();
  if (!item) {
    return res.status(404).send('SKU not found');
  }

  const returnMap = { queue: 'queue', 'death-pile': 'death-pile', sold: 'sold' };
  const returnTo = returnMap[return_to] || 'inventory';
  const hasPhoto = Boolean(await db('intake_photos').where({ sku }).first());

  try {
    const draft = await generateListingDraft(sku);
    res.render('inventory-edit', {
      item: { ...item, ...draft },
      constants,
      returnTo,
      hasPhoto,
      aiDraft: true,
      error: null,
    });
  } catch (err) {
    res.render('inventory-edit', {
      item,
      constants,
      returnTo,
      hasPhoto,
      aiDraft: false,
      error: err.message,
    });
  }
});

router.post('/inventory/:sku/delete', async (req, res) => {
  const { sku } = req.params;
  const { return_to } = req.body;

  await db.transaction(async (trx) => {
    await trx('intake_photos').where({ sku }).del();
    await trx('inventory').where({ sku }).del();
  });

  await fs.rm(path.join(UPLOADS_ROOT, sku), { recursive: true, force: true }).catch(() => {});

  const redirectMap = {
    queue: '/intake/queue',
    'death-pile': '/inventory/death-pile',
    sold: '/inventory/sold',
  };
  res.redirect(redirectMap[return_to] || '/inventory');
});

module.exports = router;
