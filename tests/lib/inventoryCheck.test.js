const { test } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
  parseFilters, escapeLike, describeFilters, filenameFor, buildWorkbookBuffer, NO_BIN,
} = require('../../src/lib/inventoryCheck');
const { parseBinInput } = require('../../src/lib/binImport');

test('parseFilters trims input and defaults status to on-hand', () => {
  const f = parseFilters({ q: '  blue mug ', bin: 'Kitchen1' });
  assert.deepEqual(f, { keyword: 'blue mug', category: '', bin: 'Kitchen1', status: 'on-hand' });
});

test('parseFilters only accepts a real status and ignores repeated (array) params', () => {
  assert.equal(parseFilters({ status: 'Sold' }).status, 'Sold');
  assert.equal(parseFilters({ status: 'Bogus' }).status, 'on-hand');
  assert.equal(parseFilters({ q: ['a', 'b'] }).keyword, '');
});

test('escapeLike neutralizes LIKE wildcards', () => {
  assert.equal(escapeLike('50%_off\\'), '50\\%\\_off\\\\');
});

test('describeFilters summarizes the search for the printout header', () => {
  const f = parseFilters({ q: 'mug', bin: 'Kitchen1' });
  assert.equal(describeFilters(f, 24), 'Inventory check — bin: Kitchen1, keyword: mug, on hand — 24 items');
  assert.match(describeFilters(parseFilters({ bin: NO_BIN }), 1), /no location.* 1 item$/);
});

test('filenameFor builds a safe filename from the filters', () => {
  assert.equal(filenameFor(parseFilters({}), '2026-09-21'), 'inventory_check_2026-09-21.xlsx');
  assert.equal(
    filenameFor(parseFilters({ bin: 'ER Cabinet', q: 'mug/"x"' }), '2026-09-21'),
    'inventory_check_2026-09-21_er-cabinet-mug-x.xlsx'
  );
});

test('buildWorkbookBuffer keeps the SKU/Title/Qty/Location/Found? header and one row per item', async () => {
  const rows = [
    { sku: 'RT-0001', item_name: 'Blue "Mug" & Saucer', bin_location: 'Kitchen1' },
    { sku: 'RT-0002', item_name: null, bin_location: null },
  ];
  const buffer = await buildWorkbookBuffer(rows, 'Inventory check — on hand — 2 items');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  assert.deepEqual(sheet.getRow(1).values.slice(1), ['SKU', 'Title', 'Qty', 'Location', 'Found?']);
  assert.equal(sheet.getRow(2).getCell(2).value, 'Blue "Mug" & Saucer');
  assert.equal(sheet.getRow(2).getCell(3).value, 1);
  assert.equal(sheet.getRow(3).getCell(4).value, '');
  assert.equal(sheet.rowCount, 3);
});

test('buildWorkbookBuffer shows a multi-unit SKU with its label and remaining count', async () => {
  const rows = [{ sku: 'RT-0010', item_name: 'Pyrex bowl', variant_label: 'Red', quantity: 3, bin_location: 'A1' }];
  const buffer = await buildWorkbookBuffer(rows, 'x');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const row = workbook.worksheets[0].getRow(2);
  assert.equal(row.getCell(2).value, 'Pyrex bowl (Red)');
  assert.equal(row.getCell(3).value, 3);
});

test('exported sheet still pastes back into Import Bin Locations', () => {
  const pasted = 'SKU\tTitle\tQty\tLocation\tFound?\nRT-0010\tPyrex bowl (Red)\t3\tA1\t';
  const { entries, error } = parseBinInput(pasted);
  assert.equal(error, null);
  assert.deepEqual(entries.map((e) => [e.sku, e.location]), [['RT-0010', 'A1']]);
});

test('buildWorkbookBuffer stores a formula-looking title as text, not a formula', async () => {
  const buffer = await buildWorkbookBuffer([{ sku: 'RT-0003', item_name: '=1+1', bin_location: '' }], 'x');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.equal(workbook.worksheets[0].getRow(2).getCell(2).value, '=1+1');
});
