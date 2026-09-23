const express = require('express');
const db = require('../db');
const { STATUSES } = require('../lib/constants');
const {
  ON_HAND_STATUSES, NO_BIN, ORDER_SQL,
  parseFilters, applyFilters, describeFilters, filenameFor, buildWorkbookBuffer, itemTitle,
} = require('../lib/inventoryCheck');

const router = express.Router();
const PREVIEW_LIMIT = 300;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function distinctValues(column) {
  const rows = await db('inventory')
    .whereIn('status', ON_HAND_STATUSES)
    .whereNotNull(column)
    .where(column, '<>', '')
    .distinct(column)
    .orderBy(column);
  return rows.map((row) => row[column]);
}

router.get('/inventory/check', async (req, res) => {
  const filters = parseFilters(req.query);

  const [{ count }, items, bins, categories] = await Promise.all([
    applyFilters(db('inventory'), filters).count('* as count').first(),
    applyFilters(db('inventory'), filters)
      .select('sku', 'item_name', 'variant_label', 'quantity', 'bin_location', 'status')
      .orderByRaw(ORDER_SQL)
      .limit(PREVIEW_LIMIT),
    distinctValues('bin_location'),
    distinctValues('category'),
  ]);

  const exportParams = new URLSearchParams();
  if (filters.keyword) exportParams.set('q', filters.keyword);
  if (filters.bin) exportParams.set('bin', filters.bin);
  if (filters.category) exportParams.set('category', filters.category);
  if (filters.status !== 'on-hand') exportParams.set('status', filters.status);

  res.render('inventory/inventory-check', {
    filters, items, total: Number(count), previewLimit: PREVIEW_LIMIT,
    bins, categories, itemTitle, statuses: STATUSES, noBin: NO_BIN, exportQuery: exportParams.toString(),
  });
});

router.get('/inventory/check/export.xlsx', async (req, res) => {
  const filters = parseFilters(req.query);
  const rows = await applyFilters(db('inventory'), filters)
    .select('sku', 'item_name', 'variant_label', 'quantity', 'bin_location')
    .orderByRaw(ORDER_SQL);

  const buffer = await buildWorkbookBuffer(rows, describeFilters(filters, rows.length));
  res.setHeader('Content-Type', XLSX_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filenameFor(filters, new Date().toISOString().slice(0, 10))}"`);
  res.send(Buffer.from(buffer));
});

module.exports = router;
