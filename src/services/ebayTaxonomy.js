const config = require('../config');

const TAXONOMY_URL = `${config.ebay.apiBase}/commerce/taxonomy/v1`;
const CATEGORY_TREE_ID = '0'; // EBAY_US -- confirmed via get_default_category_tree_id

async function getCategorySuggestion(appAccessToken, query) {
  const url = `${TAXONOMY_URL}/category_tree/${CATEGORY_TREE_ID}/get_category_suggestions?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${appAccessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay category suggestion failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const top = data.categorySuggestions?.[0];
  if (!top) return null;

  const ancestorNames = (top.categoryTreeNodeAncestors || [])
    .slice()
    .reverse()
    .map((a) => a.categoryName);
  const fullPath = [...ancestorNames, top.category.categoryName].join(' > ');

  return { categoryId: top.category.categoryId, categoryName: fullPath };
}

module.exports = { getCategorySuggestion };
