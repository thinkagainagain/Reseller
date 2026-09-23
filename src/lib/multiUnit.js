const MAX_UNITS = 999;

function asList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// Intake's per-photo Qty / Label / Cost rows arrive as parallel form fields
// (multer gives a plain string for one photo, an array for several), in the
// same order as the uploaded files. Returns one entry per photo; anything
// missing or nonsense falls back to a single unit with no label/cost rather
// than rejecting the whole batch.
function parseUnitRows(body, photoCount) {
  const quantities = asList(body.unit_quantity);
  const labels = asList(body.unit_label);
  const costs = asList(body.unit_cost);

  const rows = [];
  for (let i = 0; i < photoCount; i += 1) {
    const qty = Number.parseInt(quantities[i], 10);
    const label = typeof labels[i] === 'string' ? labels[i].trim().slice(0, 60) : '';
    const cost = costs[i] === undefined || costs[i] === '' ? null : Number(costs[i]);
    rows.push({
      quantity: Number.isInteger(qty) && qty >= 1 ? Math.min(qty, MAX_UNITS) : 1,
      variantLabel: label || null,
      purchaseCost: Number.isFinite(cost) && cost >= 0 ? cost : null,
    });
  }
  return rows;
}

module.exports = { parseUnitRows };
