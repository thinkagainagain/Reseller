const ExcelJS = require('exceljs');
const { STATUSES } = require('./constants');

// Everything that could physically be in the house. Excludes Sold, Donated,
// Trashed, Returned. Ended stays in on purpose -- an audit is how you find out
// something actually sold elsewhere.
const ON_HAND_STATUSES = ['Intake', 'Ready to Publish', 'Scheduled', 'Active', 'Ended', 'Death Pile'];
const NO_BIN = '__none__';
const SEARCH_COLUMNS = ['sku', 'item_name', 'bin_location', 'ebay_category_name'];
const MAX_TERMS = 6;

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseFilters(query = {}) {
  const status = asText(query.status);
  return {
    keyword: asText(query.q).slice(0, 100),
    category: asText(query.category),
    bin: asText(query.bin),
    status: STATUSES.includes(status) ? status : 'on-hand',
  };
}

function escapeLike(term) {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// Every whitespace-separated word must match somewhere (SKU, title, bin, eBay
// category), so "blue mug" narrows instead of widening. LOWER(...) keeps it
// case-insensitive on both SQLite (dev) and Postgres (production).
function applyFilters(query, filters) {
  if (filters.status === 'on-hand') query.whereIn('status', ON_HAND_STATUSES);
  else query.where({ status: filters.status });

  if (filters.category) query.where('category', filters.category);

  if (filters.bin === NO_BIN) {
    query.where((qb) => qb.whereNull('bin_location').orWhere('bin_location', ''));
  } else if (filters.bin) {
    query.where('bin_location', filters.bin);
  }

  const terms = filters.keyword.toLowerCase().split(/\s+/).filter(Boolean).slice(0, MAX_TERMS);
  for (const term of terms) {
    const pattern = `%${escapeLike(term)}%`;
    query.where((qb) => {
      for (const column of SEARCH_COLUMNS) {
        qb.orWhereRaw(`LOWER(COALESCE(${column}, '')) LIKE ? ESCAPE '\\'`, [pattern]);
      }
    });
  }
  return query;
}

// Grouped by bin so a walk through the house lines up with the printout;
// items with no bin sink to the bottom.
const ORDER_SQL = "CASE WHEN bin_location IS NULL OR bin_location = '' THEN 1 ELSE 0 END, bin_location, sku";

function describeFilters(filters, count) {
  const parts = [];
  if (filters.bin === NO_BIN) parts.push('no location');
  else if (filters.bin) parts.push(`bin: ${filters.bin}`);
  if (filters.keyword) parts.push(`keyword: ${filters.keyword}`);
  if (filters.category) parts.push(`category: ${filters.category}`);
  parts.push(filters.status === 'on-hand' ? 'on hand' : filters.status);
  return `Inventory check — ${parts.join(', ')} — ${count} item${count === 1 ? '' : 's'}`;
}

function filenameFor(filters, isoDate) {
  const slugSource = [filters.bin === NO_BIN ? 'no-location' : filters.bin, filters.keyword].filter(Boolean).join(' ');
  const slug = slugSource.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  return `inventory_check_${isoDate}${slug ? `_${slug}` : ''}.xlsx`;
}

// Header row stays exactly SKU / Title / Location / Found? so the finished
// sheet can be pasted straight back into Import Bin Locations. Page setup is
// there for the printout: fit to one page wide, header row repeated on every
// page, page numbers in the footer.
async function buildWorkbookBuffer(rows, summary) {
  const workbook = new ExcelJS.Workbook();
  const headerText = summary.replace(/&/g, '&&').slice(0, 120);
  const sheet = workbook.addWorksheet('Inventory Check', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: {
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '1:1',
      margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
    headerFooter: { oddHeader: `&L${headerText}&R&D`, oddFooter: '&CPage &P of &N' },
  });

  sheet.columns = [
    { header: 'SKU', key: 'sku', width: 11 },
    { header: 'Title', key: 'title', width: 62 },
    { header: 'Location', key: 'location', width: 22 },
    { header: 'Found?', key: 'found', width: 10 },
  ];

  for (const row of rows) {
    sheet.addRow({ sku: row.sku, title: row.item_name || '', location: row.bin_location || '', found: '' });
  }

  const thin = { style: 'thin', color: { argb: 'FF999999' } };
  sheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
      cell.alignment = { vertical: 'middle', wrapText: true };
      if (rowNumber === 1) {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      }
    });
  });
  if (rows.length > 0) sheet.autoFilter = `A1:D${rows.length + 1}`;

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  ON_HAND_STATUSES, NO_BIN, ORDER_SQL,
  parseFilters, escapeLike, applyFilters, describeFilters, filenameFor, buildWorkbookBuffer,
};
