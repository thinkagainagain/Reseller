const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { nextSku, maxSkuNumber, skuFromNumber, normalizePrefix, DEFAULT_PREFIX } = require('../lib/nextSku');
const storage = require('../lib/storage');
const { parseUnitRows } = require('../lib/multiUnit');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const MAX_PHOTOS = 30;

router.get('/intake', (req, res) => {
  res.render('intake/intake', { error: null, defaultPrefix: DEFAULT_PREFIX, maxPhotos: MAX_PHOTOS });
});

router.post('/intake', upload.array('photos', MAX_PHOTOS), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.render('intake/intake', { error: 'Take at least one photo before saving.', defaultPrefix: DEFAULT_PREFIX, maxPhotos: MAX_PHOTOS });
  }

  const today = new Date().toISOString().slice(0, 10);
  const multiItem = req.body.multi_item === 'on';

  if (multiItem) {
    // Batch mode: each uploaded photo is a different item -- one SKU, one
    // inventory row, one photo per file. Numbered in memory off a single
    // lookup (same pattern as ebaySync.js) instead of round-tripping
    // nextSku() per photo, since a batch can be 30 files.
    const prefix = normalizePrefix(req.body.sku_prefix);
    const existing = await db('inventory').where('sku', 'like', `${prefix}-%`).select('sku');
    let skuNum = maxSkuNumber(existing, prefix);

    // Multi-unit: each photo is one variation (e.g. one color) with its own
    // Qty / Label / Cost per unit -- still one SKU per photo, matching how
    // eBay gives each variation its own SKU and quantity.
    const multiUnit = req.body.multi_unit === 'on';
    const unitRows = multiUnit ? parseUnitRows(req.body, req.files.length) : [];

    const inventoryRows = [];
    const photoRows = [];
    for (const [index, file] of req.files.entries()) {
      const sku = skuFromNumber(++skuNum, prefix);
      const ext = path.extname(file.originalname) || '.jpg';
      const filename = `1${ext}`;
      await storage.putObject(`${sku}/${filename}`, file.buffer);
      photoRows.push({ sku, file_path: `/uploads/${sku}/${filename}` });
      const unit = unitRows[index];
      inventoryRows.push({
        sku,
        date_acquired: today,
        status: 'Intake',
        item_name: null,
        purchase_cost: unit ? unit.purchaseCost : null,
        quantity: unit ? unit.quantity : 1,
        variant_label: unit ? unit.variantLabel : null,
        multi_unit: multiUnit,
      });
    }

    await db.transaction(async (trx) => {
      await trx('inventory').insert(inventoryRows);
      await trx('intake_photos').insert(photoRows);
    });

    return res.redirect('/intake/queue');
  }

  const sku = await nextSku(db, req.body.sku_prefix);

  const photoRows = [];
  for (const [index, file] of req.files.entries()) {
    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `${index + 1}${ext}`;
    await storage.putObject(`${sku}/${filename}`, file.buffer);
    photoRows.push({ sku, file_path: `/uploads/${sku}/${filename}` });
  }

  const itemName = req.body.item_name?.trim() || null;
  const purchaseCost = req.body.purchase_cost ? Number(req.body.purchase_cost) : null;

  await db.transaction(async (trx) => {
    await trx('inventory').insert({
      sku,
      date_acquired: today,
      status: 'Intake',
      item_name: itemName,
      purchase_cost: purchaseCost,
    });
    await trx('intake_photos').insert(photoRows);
  });

  res.redirect('/intake/queue');
});

router.get('/intake/queue', async (req, res) => {
  const items = await db('inventory')
    .where({ status: 'Intake' })
    .orderBy('date_acquired', 'desc');

  const photos = await db('intake_photos').whereIn(
    'sku',
    items.map((i) => i.sku)
  );

  const firstPhotoBySku = {};
  for (const photo of photos) {
    if (!firstPhotoBySku[photo.sku]) {
      firstPhotoBySku[photo.sku] = photo.file_path.replace('/uploads/', '/uploads/thumb/');
    }
  }

  const totalTiedUp = items.reduce((sum, item) => sum + Number(item.purchase_cost || 0) * Number(item.quantity || 1), 0);

  res.render('intake/intake-queue', { items, firstPhotoBySku, totalTiedUp });
});

module.exports = router;
