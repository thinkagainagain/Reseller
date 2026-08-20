const express = require('express');
const multer = require('multer');
const fs = require('fs/promises');
const path = require('path');
const db = require('../db');
const nextSku = require('../lib/nextSku');
const { UPLOADS_ROOT } = require('../lib/uploadsDir');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/intake', (req, res) => {
  res.render('intake/intake', { error: null });
});

router.post('/intake', upload.array('photos', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.render('intake/intake', { error: 'Take at least one photo before saving.' });
  }

  const sku = await nextSku(db);
  const skuDir = path.join(UPLOADS_ROOT, sku);
  await fs.mkdir(skuDir, { recursive: true });

  const photoRows = [];
  for (const [index, file] of req.files.entries()) {
    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `${index + 1}${ext}`;
    await fs.writeFile(path.join(skuDir, filename), file.buffer);
    photoRows.push({ sku, file_path: `/uploads/${sku}/${filename}` });
  }

  const today = new Date().toISOString().slice(0, 10);
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
      firstPhotoBySku[photo.sku] = photo.file_path;
    }
  }

  const totalTiedUp = items.reduce((sum, item) => sum + Number(item.purchase_cost || 0), 0);

  res.render('intake/intake-queue', { items, firstPhotoBySku, totalTiedUp });
});

module.exports = router;
