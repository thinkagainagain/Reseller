const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseBinInput, planBinUpdates } = require('../../src/lib/binImport');

const existing = new Map([
  ['RT-0001', { sku: 'RT-0001', item_name: 'Mug A', bin_location: null }],
  ['RT-0002', { sku: 'RT-0002', item_name: 'Mug B', bin_location: 'Old Shelf' }],
  ['RT-0003', { sku: 'RT-0003', item_name: 'Mug C', bin_location: 'Kitchen1' }],
]);

test('parseBinInput reads a tab-separated Excel paste with a header, picking the Location column', () => {
  const text = 'SKU\tTitle\tLocation\tFound?\nRT-0001\tMug A\tKitchen1\tYes\nrt-0002\tMug, "B"\tER Cabinet \t';
  const { entries, error } = parseBinInput(text);
  assert.equal(error, null);
  assert.deepEqual(entries.map((e) => [e.sku, e.location]), [['RT-0001', 'Kitchen1'], ['RT-0002', 'ER Cabinet']]);
});

test('parseBinInput keeps an empty Location cell as blank instead of shifting columns', () => {
  const { entries } = parseBinInput('SKU\tTitle\tLocation\tFound?\nRT-0001\tMug A\t\t');
  assert.equal(entries[0].location, '');
});

test('parseBinInput accepts a headerless two-column paste', () => {
  const { entries, error } = parseBinInput('RT-0001,Kitchen1\nRT-0002,A1');
  assert.equal(error, null);
  assert.equal(entries.length, 2);
});

test('parseBinInput refuses a headerless paste of more than two columns', () => {
  const { error } = parseBinInput('RT-0001\tMug A\tKitchen1');
  assert.match(error, /header row/);
});

test('parseBinInput errors when the header has no Location column', () => {
  const { error } = parseBinInput('SKU\tTitle\nRT-0001\tMug A');
  assert.match(error, /Location/);
});

test('planBinUpdates classifies each row', () => {
  const entries = [
    { sku: 'RT-0001', location: 'Kitchen1' },
    { sku: 'RT-0002', location: 'ER Cabinet' },
    { sku: 'RT-0003', location: 'Kitchen1' },
    { sku: 'RT-9999', location: 'A1' },
    { sku: 'RT-0001', location: 'Dup' },
    { sku: 'RT-0004', location: '' },
    { sku: 'RT-0005', location: 'SOLD' },
    { sku: 'nonsense', location: 'A1' },
  ];
  const { items, counts } = planBinUpdates(entries, existing);
  assert.deepEqual(items.map((i) => i.kind), [
    'set', 'change', 'unchanged', 'missing', 'duplicate', 'blank', 'not-a-location', 'invalid',
  ]);
  assert.equal(counts.set, 1);
  assert.equal(items[1].currentBin, 'Old Shelf');
});
