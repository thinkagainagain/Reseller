const db = require('../db');
const { getAccessToken } = require('./ebayAuth');
const { addFixedPriceItem } = require('./ebayTradingApi');
const { getConditionId } = require('../lib/ebayConditionMap');

const SCHEDULE_DAYS_OUT = 20; // safety margin under eBay's ~21-day scheduling cap

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function validateItem(item, hasPhoto) {
  const missing = [];
  if (!item.item_name) missing.push('Title');
  if (!item.description) missing.push('Description');
  if (!item.list_price) missing.push('List price');
  if (!item.ebay_category_id) missing.push('eBay category');
  if (!item.condition) missing.push('Condition');
  if (!hasPhoto) missing.push('Photo');
  if (item.weight_lbs === null || item.weight_lbs === undefined) missing.push('Weight (lbs)');
  if (item.weight_oz === null || item.weight_oz === undefined) missing.push('Weight (oz)');
  if (!item.package_length) missing.push('Package length');
  if (!item.package_width) missing.push('Package width');
  if (!item.package_height) missing.push('Package height');
  return missing;
}

async function publishToEbay(sku) {
  const item = await db('inventory').where({ sku }).first();
  if (!item) {
    throw new Error(`No inventory row found for ${sku}`);
  }

  const photo = await db('intake_photos').where({ sku }).orderBy('id', 'asc').first();
  const missing = validateItem(item, Boolean(photo));
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  const conditionId = getConditionId(item.condition);
  if (!conditionId) {
    throw new Error(`No eBay ConditionID mapping for condition "${item.condition}"`);
  }

  const appUrl = process.env.APP_PUBLIC_URL;
  const shipFromPostalCode = process.env.EBAY_SHIP_FROM_POSTAL_CODE;
  const shipFromCountry = process.env.EBAY_SHIP_FROM_COUNTRY;
  const paymentPolicyId = process.env.EBAY_PAYMENT_POLICY_ID;
  const returnPolicyId = process.env.EBAY_RETURN_POLICY_ID;
  const fulfillmentPolicyId = process.env.EBAY_FULFILLMENT_POLICY_ID;

  if (!appUrl || !shipFromPostalCode || !shipFromCountry || !paymentPolicyId || !returnPolicyId || !fulfillmentPolicyId) {
    throw new Error(
      'Missing one of APP_PUBLIC_URL / EBAY_SHIP_FROM_POSTAL_CODE / EBAY_SHIP_FROM_COUNTRY / ' +
      'EBAY_PAYMENT_POLICY_ID / EBAY_RETURN_POLICY_ID / EBAY_FULFILLMENT_POLICY_ID in .env'
    );
  }

  const startTime = new Date(Date.now() + SCHEDULE_DAYS_OUT * 24 * 60 * 60 * 1000).toISOString();

  const listing = {
    title: item.item_name,
    description: item.description,
    categoryId: item.ebay_category_id,
    conditionId,
    price: item.list_price,
    sku: item.sku,
    shipFromCountry,
    shipFromPostalCode,
    pictureUrl: `${appUrl}${photo.file_path}`,
    paymentPolicyId,
    returnPolicyId,
    fulfillmentPolicyId,
    startTime,
    weightLbs: item.weight_lbs,
    weightOz: item.weight_oz,
    packageLength: item.package_length,
    packageWidth: item.package_width,
    packageHeight: item.package_height,
    itemSpecifics: {
      Brand: item.brand,
      Color: item.color,
      Size: item.item_size,
      'Country/Region of Manufacture': item.country_of_origin,
      Type: item.item_type,
    },
  };

  const accessToken = await getAccessToken(['https://api.ebay.com/oauth/api_scope/sell.inventory.readonly']);
  const result = await addFixedPriceItem(accessToken, listing);

  await db('inventory').where({ sku }).update({
    status: 'Scheduled',
    ebay_item_id: result.itemId,
    date_submitted: toDateOnly(new Date()),
    updated_at: db.fn.now(),
  });

  return result;
}

async function publishMultiple(skus) {
  const results = [];
  for (const sku of skus) {
    try {
      const result = await publishToEbay(sku);
      results.push({ sku, success: true, itemId: result.itemId, startTime: result.startTime });
    } catch (err) {
      results.push({ sku, success: false, error: err.message });
    }
  }
  return results;
}

module.exports = { publishToEbay, publishMultiple };
