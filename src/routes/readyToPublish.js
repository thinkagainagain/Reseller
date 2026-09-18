const express = require('express');
const db = require('../db');
const { publishMultiple, SCHEDULE_DAYS_OUT } = require('../services/ebayPublish');

const router = express.Router();

router.get('/inventory/ready-to-publish', async (req, res) => {
  const items = await db('inventory')
    .where({ status: 'Ready to Publish' })
    .orderBy('date_acquired', 'asc');

  res.render('ready-to-publish/ready-to-publish', { items, results: null });
});

router.get('/inventory/scheduled', async (req, res) => {
  const items = await db('inventory')
    .where({ status: 'Scheduled' })
    .orderBy('date_submitted', 'asc');

  // date_submitted is when we pushed it to eBay; the actual go-live date
  // isn't stored, so estimate it from the same SCHEDULE_DAYS_OUT offset
  // ebayPublish.js used when it built the ScheduleTime sent to eBay.
  const itemsWithEstimate = items.map((item) => {
    let estimatedLiveDate = null;
    if (item.date_submitted) {
      const d = new Date(item.date_submitted);
      d.setDate(d.getDate() + SCHEDULE_DAYS_OUT);
      estimatedLiveDate = d.toISOString().slice(0, 10);
    }
    return { ...item, estimatedLiveDate };
  });

  res.render('ready-to-publish/scheduled', { items: itemsWithEstimate });
});

router.post('/inventory/push-to-ebay', async (req, res) => {
  let { skus } = req.body;
  if (!skus) skus = [];
  if (!Array.isArray(skus)) skus = [skus];

  const results = skus.length > 0 ? await publishMultiple(skus) : [];

  const items = await db('inventory')
    .where({ status: 'Ready to Publish' })
    .orderBy('date_acquired', 'asc');

  res.render('ready-to-publish/ready-to-publish', { items, results });
});

module.exports = router;
