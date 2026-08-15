const express = require('express');
const { runSync } = require('../services/ebaySync');

const router = express.Router();

router.get('/sync', (req, res) => {
  res.render('sync', { result: null, error: null });
});

router.post('/sync/run', async (req, res) => {
  try {
    const { listings, orders } = await runSync();
    res.render('sync', { result: { listings, orders }, error: null });
  } catch (err) {
    res.render('sync', { result: null, error: err.message });
  }
});

module.exports = router;
