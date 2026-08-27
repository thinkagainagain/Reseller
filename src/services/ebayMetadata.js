const config = require('../config');

const METADATA_URL = `${config.ebay.apiBase}/sell/metadata/v1`;

// eBay's real per-category condition options -- confirmed live to vary a lot
// (Books/DVDs use a 5-point New->Acceptable scale, Clothing uses its own
// 6-point New-with-tags->Pre-owned-Fair scale, plenty of categories are just
// New/Used). Public reference data, same app-level-token pattern as
// ebayTaxonomy.js -- no user OAuth scope needed.
async function getConditionPolicy(appAccessToken, categoryId) {
  const url = `${METADATA_URL}/marketplace/EBAY_US/get_item_condition_policies?filter=${encodeURIComponent(`categoryIds:{${categoryId}}`)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${appAccessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay condition policy lookup failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const policy = data.itemConditionPolicies?.[0];
  if (!policy) return null;

  return {
    required: Boolean(policy.itemConditionRequired),
    conditions: (policy.itemConditions || []).map((c) => ({
      id: c.conditionId,
      description: c.conditionDescription,
    })),
  };
}

module.exports = { getConditionPolicy };
