// One-off migration script: pushes each active item's internal RT-#### SKU
// up to eBay's Custom Label field via the Trading API, so future syncs match
// by SKU instead of falling back to Item ID. Safe to re-run -- only touches
// items whose eBay-side SKU doesn't already match ours.
//
// Usage: node src/scripts/pushSkusToEbay.js           (dry run, no writes)
//        node src/scripts/pushSkusToEbay.js --commit   (actually writes)

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const db = require('../db');
const { getAccessToken } = require('../services/ebayAuth');
const { getActiveListings, reviseSku } = require('../services/ebayTradingApi');

const DELAY_MS = 300;
const COMMIT = process.argv.includes('--commit');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const accessToken = await getAccessToken(['https://api.ebay.com/oauth/api_scope/sell.inventory.readonly']);

  console.log('Fetching current active listings from eBay...');
  const listings = await getActiveListings(accessToken);
  const listingByItemId = new Map(listings.map((l) => [l.itemId, l]));

  const rows = await db('inventory')
    .where({ status: 'Active' })
    .whereNotNull('ebay_item_id')
    .select('sku', 'ebay_item_id');

  const needsUpdate = rows.filter((row) => {
    const listing = listingByItemId.get(row.ebay_item_id);
    return listing && listing.sku !== row.sku;
  });

  console.log(`${rows.length} active items checked. ${needsUpdate.length} need their SKU pushed to eBay.`);

  if (!COMMIT) {
    console.log('Dry run only (pass --commit to actually write). Sample of what would change:');
    console.log(needsUpdate.slice(0, 10).map((r) => `  ${r.ebay_item_id} -> ${r.sku}`).join('\n'));
    await db.destroy();
    return;
  }

  let succeeded = 0;
  const failed = [];

  for (const [index, row] of needsUpdate.entries()) {
    try {
      await reviseSku(accessToken, row.ebay_item_id, row.sku);
      succeeded += 1;
    } catch (err) {
      failed.push({ itemId: row.ebay_item_id, sku: row.sku, error: err.message });
    }

    if ((index + 1) % 25 === 0 || index === needsUpdate.length - 1) {
      console.log(`Progress: ${index + 1}/${needsUpdate.length} (${succeeded} succeeded, ${failed.length} failed)`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed.length} failed.`);
  if (failed.length > 0) {
    console.log('Failures:');
    for (const f of failed) {
      console.log(`  ${f.itemId} (${f.sku}): ${f.error.slice(0, 200)}`);
    }
  }

  await db.destroy();
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
