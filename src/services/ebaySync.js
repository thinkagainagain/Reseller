const db = require('../db');
const config = require('../config');
const nextSku = require('../lib/nextSku');
const { getAccessToken } = require('./ebayAuth');
const { getActiveListings } = require('./ebayTradingApi');

const FULFILLMENT_ORDER_URL = `${config.ebay.apiBase}/sell/fulfillment/v1/order`;
const ORDER_LOOKBACK_DAYS = 3;
const ORDER_PAGE_LIMIT = 50;

function toDateOnly(isoString) {
  if (!isoString) return null;
  return isoString.slice(0, 10);
}

async function syncActiveListings() {
  const accessToken = await getAccessToken(['https://api.ebay.com/oauth/api_scope/sell.inventory.readonly']);
  const listings = await getActiveListings(accessToken);

  let created = 0;
  let updated = 0;
  let matchedBySku = 0;
  let binLocationBackfilled = 0;

  for (const listing of listings) {
    // Match by our own SKU first (set via eBay's "Custom Label" field when
    // you manually list an item you already ran through Intake), so an item
    // already tracked as Waiting to List gets updated in place instead of
    // spawning a duplicate row. Falls back to eBay's Item ID for listings
    // we've already synced before.
    let existing = null;
    let matchedViaSku = false;

    if (listing.sku) {
      existing = await db('inventory').where({ sku: listing.sku }).first();
      if (existing) {
        matchedBySku += 1;
        matchedViaSku = true;
      }
    }

    if (!existing) {
      existing = await db('inventory').where({ ebay_item_id: listing.itemId }).first();
    }

    if (existing) {
      // If this item was only found via Item ID (not SKU), eBay's Custom
      // Label still holds whatever was there before this app renumbered
      // anything -- for legacy listings that's the old location code you
      // used to store there. Preserve it in bin_location (once) instead of
      // letting it disappear once we eventually push a real RT-XXXX SKU up.
      // Never overwrite a bin_location you've already filled in by hand.
      const shouldBackfillBinLocation =
        !matchedViaSku && !existing.bin_location && listing.sku && listing.sku !== existing.sku;
      if (shouldBackfillBinLocation) binLocationBackfilled += 1;

      await db('inventory')
        .where({ sku: existing.sku })
        .update({
          item_name: listing.title,
          list_price: listing.price,
          status: 'Active',
          ebay_item_id: listing.itemId,
          // first_listed_date is set once and never overwritten -- it's the
          // "time to list" anchor, so a relist under a new Item ID must not
          // reset it.
          first_listed_date: existing.first_listed_date || toDateOnly(listing.startTime),
          date_listed: toDateOnly(listing.startTime) || existing.date_listed,
          bin_location: shouldBackfillBinLocation ? listing.sku : existing.bin_location,
          updated_at: db.fn.now(),
        });
      updated += 1;
    } else {
      const sku = await nextSku(db);
      await db('inventory').insert({
        sku,
        item_name: listing.title,
        list_price: listing.price,
        ebay_item_id: listing.itemId,
        status: 'Active',
        first_listed_date: toDateOnly(listing.startTime),
        date_listed: toDateOnly(listing.startTime),
        date_acquired: null,
        // eBay's existing Custom Label wasn't ours -- it's the seller's old
        // location code from before this app existed. Keep it as a bin
        // location rather than discarding it; our own sku above is the new
        // permanent identifier.
        bin_location: listing.sku || null,
      });
      if (listing.sku) binLocationBackfilled += 1;
      created += 1;
    }
  }

  return { totalListings: listings.length, created, updated, matchedBySku, binLocationBackfilled };
}

async function fetchRecentOrders(accessToken) {
  const since = new Date(Date.now() - ORDER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const filter = `lastmodifieddate:[${since}..]`;

  const allOrders = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const url = `${FULFILLMENT_ORDER_URL}?filter=${encodeURIComponent(filter)}&limit=${ORDER_PAGE_LIMIT}&offset=${offset}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Fulfillment API order fetch failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    allOrders.push(...(data.orders || []));
    total = data.total ?? allOrders.length;
    offset += ORDER_PAGE_LIMIT;
  }

  return allOrders;
}

async function syncSoldOrders() {
  const accessToken = await getAccessToken(['https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly']);
  const orders = await fetchRecentOrders(accessToken);

  let newSales = 0;
  let updatedSales = 0;
  let backfilledInventory = 0;

  for (const order of orders) {
    for (const lineItem of order.lineItems || []) {
      const itemId = String(lineItem.legacyItemId || '');
      if (!itemId) continue;

      const lineItemSku = lineItem.sku ? String(lineItem.sku).trim() : null;

      let inventoryRow = null;
      if (lineItemSku) {
        inventoryRow = await db('inventory').where({ sku: lineItemSku }).first();
      }
      if (!inventoryRow) {
        inventoryRow = await db('inventory').where({ ebay_item_id: itemId }).first();
      }

      if (!inventoryRow) {
        const sku = await nextSku(db);
        await db('inventory').insert({
          sku,
          item_name: lineItem.title,
          ebay_item_id: itemId,
          status: 'Sold',
          date_acquired: null,
        });
        inventoryRow = { sku };
        backfilledInventory += 1;
      } else if (inventoryRow.status !== 'Sold' || inventoryRow.ebay_item_id !== itemId) {
        await db('inventory').where({ sku: inventoryRow.sku }).update({
          status: 'Sold',
          ebay_item_id: itemId,
          updated_at: db.fn.now(),
        });
      }

      const salePrice = Number(lineItem.total?.value ?? 0);
      const shippingCharged = Number(lineItem.deliveryCost?.shippingCost?.value ?? 0);
      const saleDate = toDateOnly(order.creationDate);

      const existingSale = await db('sales_log')
        .where({ sku: inventoryRow.sku, platform: 'eBay', sale_date: saleDate })
        .first();

      if (existingSale) {
        await db('sales_log').where({ id: existingSale.id }).update({
          sale_price: salePrice,
          shipping_charged: shippingCharged,
          updated_at: db.fn.now(),
        });
        updatedSales += 1;
      } else {
        await db('sales_log').insert({
          sku: inventoryRow.sku,
          platform: 'eBay',
          sale_date: saleDate,
          sale_price: salePrice,
          shipping_charged: shippingCharged,
        });
        newSales += 1;
      }
    }
  }

  return { totalOrders: orders.length, newSales, updatedSales, backfilledInventory };
}

async function runSync() {
  const listingsResult = await syncActiveListings();
  const ordersResult = await syncSoldOrders();
  return { listings: listingsResult, orders: ordersResult };
}

module.exports = { syncActiveListings, syncSoldOrders, runSync };
