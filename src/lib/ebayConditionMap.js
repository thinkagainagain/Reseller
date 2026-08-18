// eBay's generic ConditionID enum. Technically category-dependent (some
// categories only accept a subset), but this generic set is a reasonable
// starting point -- correct against real error responses if eBay rejects one.
const CONDITION_ID_BY_NAME = {
  New: 1000,
  'Like New': 1500,
  Excellent: 3000,
  Good: 4000,
  Fair: 5000,
  'Poor/Parts': 7000,
};

function getConditionId(conditionName) {
  return CONDITION_ID_BY_NAME[conditionName] || null;
}

module.exports = { getConditionId };
