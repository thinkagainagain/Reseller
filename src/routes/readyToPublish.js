const express = require('express');
const db = require('../db');
const { publishMultiple } = require('../services/ebayPublish');

const router = express.Router();

router.get('/inventory/ready-to-publish', async (req, res) => {
  const items = await db('inventory')
    .where({ status: 'Ready to Publish' })
    .orderBy('date_acquired', 'asc');

  res.render('ready-to-publish', { items, results: null });
});

router.post('/inventory/push-to-ebay', async (req, res) => {
  let { skus } = req.body;
  if (!skus) skus = [];
  if (!Array.isArray(skus)) skus = [skus];

  const results = skus.length > 0 ? await publishMultiple(skus) : [];

  const items = await db('inventory')
    .where({ status: 'Ready to Publish' })
    .orderBy('date_acquired', 'asc');

  res.render('ready-to-publish', { items, results });
});

module.exports = router;
