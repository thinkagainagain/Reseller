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
  res.render('inventory/inventory', { items });
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
  res.render('inventory/sold', { items });
});

router.get('/inventory/death-pile', async (req, res) => {
  const items = await db('inventory')
    .where({ status: 'Death Pile' })
    .orderBy('date_acquired', 'asc');

  const totalTiedUp = items.reduce((sum, item) => sum + Number(item.purchase_cost || 0), 0);

  res.render('inventory/death-pile', { items, totalTiedUp });
});

router.get('/inventory/:sku/edit', async (req, res) => {
  const item = await db('inventory').where({ sku: req.params.sku }).first();
  if (!item) {
    return res.status(404).send('SKU not found');
  }

  const returnMap = { queue: 'queue', 'death-pile': 'death-pile', sold: 'sold' };
  const returnTo = returnMap[req.query.from] || 'inventory';

  const hasPhoto = Boolean(await db('intake_photos').where({ sku: item.sku }).first());

  res.render('inventory/inventory-edit', { item, constants, returnTo, hasPhoto, aiDraft: false, error: null });
});

router.post('/inventory/:sku/edit', async (req, res) => {
  const { sku } = req.params;
  const {
    item_name, category, source, condition, purchase_cost, list_price,
    bin_location, status, death_pile_reason, death_pile_action_plan,
    date_acquired, notes, description, brand, item_size, color,
    year_manufactured, country_of_origin, ebay_category_id, ebay_category_name,
    weight_lbs, weight_oz, package_length, package_width, package_height,
    item_type, return_to,
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
      brand: brand?.trim() || null,
      item_size: item_size?.trim() || null,
      color: color?.trim() || null,
      year_manufactured: year_manufactured?.trim() || null,
      country_of_origin: country_of_origin?.trim() || null,
      ebay_category_id: ebay_category_id?.trim() || null,
      ebay_category_name: ebay_category_name?.trim() || null,
      weight_lbs: weight_lbs === '' ? null : Number(weight_lbs),
      weight_oz: weight_oz === '' ? null : Number(weight_oz),
      package_length: package_length === '' ? null : Number(package_length),
      package_width: package_width === '' ? null : Number(package_width),
      package_height: package_height === '' ? null : Number(package_height),
      item_type: item_type?.trim() || null,
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
  const { return_to, clarification } = req.body;

  const item = await db('inventory').where({ sku }).first();
  if (!item) {
    return res.status(404).send('SKU not found');
  }

  const returnMap = { queue: 'queue', 'death-pile': 'death-pile', sold: 'sold' };
  const returnTo = returnMap[return_to] || 'inventory';
  const hasPhoto = Boolean(await db('intake_photos').where({ sku }).first());

  try {
    const draft = await generateListingDraft(sku, clarification?.trim() || null);
    const notes = item.notes && draft.notes
      ? `${draft.notes}\n\n---\n\n${item.notes}`
      : draft.notes || item.notes;
    res.render('inventory/inventory-edit', {
      item: {
        ...item,
        item_name: draft.title,
        description: draft.description,
        brand: draft.brand ?? item.brand,
        item_size: draft.item_size ?? item.item_size,
        color: draft.color ?? item.color,
        year_manufactured: draft.year_manufactured ?? item.year_manufactured,
        country_of_origin: draft.country_of_origin ?? item.country_of_origin,
        list_price: draft.list_price ?? item.list_price,
        category: draft.category,
        condition: draft.condition,
        ebay_category_id: draft.ebay_category_id ?? item.ebay_category_id,
        ebay_category_name: draft.ebay_category_name ?? item.ebay_category_name,
        notes,
      },
      constants,
      returnTo,
      hasPhoto,
      aiDraft: true,
      error: null,
    });
  } catch (err) {
    res.render('inventory/inventory-edit', {
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
