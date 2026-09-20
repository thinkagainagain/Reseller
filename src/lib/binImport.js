const SKU_PATTERN = /^[A-Z]{1,10}-\d{3,}$/i;
const LOCATION_HEADERS = ['location', 'bin', 'bin location', 'bin_location', 'bin/location'];
const MAX_LOCATION_LENGTH = 100;

function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { cells.push(cell); cell = ''; }
    else cell += ch;
  }
  cells.push(cell);
  return cells;
}

// Excel copies cells tab-separated; a saved CSV is comma-separated.
function splitLine(line) {
  return (line.includes('\t') ? line.split('\t') : parseCsvLine(line)).map((c) => c.trim());
}

function parseBinInput(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { entries: [], error: 'Nothing was pasted.' };

  const table = lines.map(splitLine);
  let skuIdx = 0;
  let locIdx = 1;
  let dataRows = table;

  if (table[0][0].toLowerCase() === 'sku') {
    locIdx = table[0].findIndex((h) => LOCATION_HEADERS.includes(h.toLowerCase()));
    if (locIdx === -1) {
      return { entries: [], error: 'Found a SKU header but no "Location" (or "Bin") column next to it.' };
    }
    dataRows = table.slice(1);
  } else if (!table.every((row) => row.length === 2)) {
    return {
      entries: [],
      error: 'When pasting more than two columns, include the header row (SKU, ..., Location) so the right columns can be found.',
    };
  }

  const entries = dataRows.map((row, i) => ({
    line: i + 1,
    sku: (row[skuIdx] || '').toUpperCase(),
    location: (row[locIdx] || '').trim(),
  }));
  return { entries, error: null };
}

// existingBySku: Map of sku -> { sku, item_name, bin_location }. Pure so it can
// run the same checks at preview time and again at apply time, rather than
// trusting whatever the browser sends back.
function planBinUpdates(entries, existingBySku) {
  const seen = new Set();
  const items = entries.map((entry) => {
    const { sku, location } = entry;
    const base = { ...entry };

    if (!SKU_PATTERN.test(sku)) return { ...base, kind: 'invalid', note: 'Not a recognizable SKU' };
    if (seen.has(sku)) return { ...base, kind: 'duplicate', note: 'SKU appears more than once — first one wins' };
    seen.add(sku);

    if (!location) return { ...base, kind: 'blank', note: 'No location in the sheet' };
    if (location.toLowerCase() === 'sold') return { ...base, kind: 'not-a-location', note: '"SOLD" isn\'t a bin location' };
    if (location.length > MAX_LOCATION_LENGTH) return { ...base, kind: 'invalid', note: 'Location is unreasonably long' };

    const existing = existingBySku.get(sku);
    if (!existing) return { ...base, kind: 'missing', note: 'SKU not found in inventory' };

    const withItem = { ...base, itemName: existing.item_name, currentBin: existing.bin_location || null };
    if (existing.bin_location === location) return { ...withItem, kind: 'unchanged', note: 'Already set' };
    return { ...withItem, kind: existing.bin_location ? 'change' : 'set', note: '' };
  });

  const counts = {};
  for (const item of items) counts[item.kind] = (counts[item.kind] || 0) + 1;
  return { items, counts };
}

const APPLIES = new Set(['set', 'change']);

module.exports = { parseBinInput, planBinUpdates, APPLIES, SKU_PATTERN };
