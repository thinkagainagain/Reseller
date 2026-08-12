const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/inventory', async (req, res) => {
  const items = await db('inventory').orderBy('date_acquired', 'desc');
  res.render('inventory', { items });
});

module.exports = router;
