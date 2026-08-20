const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/sku-export', async (req, res) => {
  const count = await db('inventory')
    .where({ status: 'Active' })
    .whereNotNull('ebay_item_id')
    .count('* as count')
    .first();

  res.render('sku-export/sku-export', { count: Number(count.count) });
});

router.get('/sku-export/download', async (req, res) => {
  const rows = await db('inventory')
    .where({ status: 'Active' })
    .whereNotNull('ebay_item_id')
    .select('ebay_item_id', 'sku')
    .orderBy('sku', 'asc');

  const csvLines = ['ItemID,NewSKU'];
  for (const row of rows) {
    csvLines.push(`${row.ebay_item_id},${row.sku}`);
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="rebooty-sku-mapping.csv"');
  res.send(csvLines.join('\n'));
});

module.exports = router;
