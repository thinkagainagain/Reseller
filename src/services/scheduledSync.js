const config = require('../config');
const { runSync } = require('./ebaySync');

const SYNC_INTERVAL_MS = 20 * 60 * 1000; // within the 15-30 min polling window
const STARTUP_DELAY_MS = 30 * 1000; // let migrations/listen settle first

let running = false;

async function runOnce() {
  // A slow prior run (or a burst of eBay API latency) must not pile up a
  // second overlapping sync on the next tick.
  if (running) return;
  running = true;
  try {
    const { listings, orders } = await runSync();
    console.log(
      `[scheduled sync] Listings: ${listings.totalListings} active (${listings.created} new, ${listings.updated} updated). ` +
        `Orders: ${orders.totalOrders} checked (${orders.newSales} new sales, ${orders.markedShipped} marked shipped).`
    );
  } catch (err) {
    // A transient eBay/network failure should not take down the web process
    // or stop future ticks -- just log and try again next interval.
    console.error('[scheduled sync] failed:', err.message);
  } finally {
    running = false;
  }
}

function startScheduledSync() {
  if (!config.ebay.clientId || !config.ebay.clientSecret || !config.ebay.refreshToken) {
    console.log('[scheduled sync] eBay credentials not configured -- skipping automatic sync.');
    return;
  }

  setTimeout(() => {
    runOnce();
    setInterval(runOnce, SYNC_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

module.exports = { startScheduledSync };
