require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { runSync } = require('../services/ebaySync');

runSync()
  .then(({ listings, orders }) => {
    console.log(
      `Listings: ${listings.totalListings} active (${listings.created} new, ${listings.updated} updated, ` +
        `${listings.matchedBySku} matched by SKU). ` +
        `Orders: ${orders.totalOrders} checked (${orders.newSales} new sales, ${orders.updatedSales} updated, ` +
        `${orders.backfilledInventory} inventory rows backfilled).`
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error('eBay sync failed:', err);
    process.exit(1);
  });
