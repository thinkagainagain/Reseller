const db = require('../db');
const config = require('../config');
const { nextSku, maxSkuNumber, skuFromNumber } = require('../lib/nextSku');
const { getAccessToken } = require('./ebayAuth');
const { getActiveListings } = require('./ebayTradingApi');

const FULFILLMENT_ORDER_URL = `${config.ebay.apiBase}/sell/fulfillment/v1/order`;
const ORDER_LOOKBACK_DAYS = 3;
const ORDER_PAGE_LIMIT = 50;

function toDateOnly(isoString) {
  if (!isoString) return null;
  return isoString.slice(0, 10);
}

// A Custom Label that already looks like one of our generated SKUs (any
// prefix -- Intake's SKU Prefix field means it's not always "RT", see
// src/lib/nextSku.js) is a real SKU that failed to match an existing row --
// not a legacy pre-app location code. Misfiling it into bin_location (the
// old assumption) both loses the real identifier and spawns a duplicate row
// under a fresh generated SKU.
function looksLikeOwnSku(value) {
  return Boolean(value) && /^[A-Z]{1,10}-\d{3,}$/i.test(value);
}

async function syncActiveListings() {
  const accessToken = await getAccessToken(['https://api.ebay.com/oauth/api_scope/sell.inventory.readonly']);
  const listings = await getActiveListings(accessToken);

  // One bulk read replaces what used to be up to 2 lookup queries per
  // listing, sequentially, plus a full-table scan re-run for every single
  // newly created SKU (nextSku querying the whole table fresh each call) --
  // that per-item chatter, not the eBay API call itself, was what outran
  // Render's request timeout during a real production sync.
  const allInventory = await db('inventory').select(
    'sku', 'ebay_item_id', 'bin_location', 'first_listed_date', 'date_listed', 'ebay_primary_photo_url'
  );
  const bySku = new Map(allInventory.map((row) => [row.sku, row]));
  const byItemId = new Map(allInventory.filter((row) => row.ebay_item_id).map((row) => [row.ebay_item_id, row]));
  let nextSkuNum = maxSkuNumber(allInventory);

  const updates = [];
  const inserts = [];
  let matchedBySku = 0;
  let binLocationBackfilled = 0;

  for (const listing of listings) {
    // Match by our own SKU first (set via eBay's "Custom Label" field when
    // you manually list an item you already ran through Intake), so an item
    // already tracked as Waiting to List gets updated in place instead of
    // spawning a duplicate row. Falls back to eBay's Item ID for listings
    // we've already synced before.
    let existing = listing.sku ? bySku.get(listing.sku) : undefined;
    const matchedViaSku = Boolean(existing);
    if (matchedViaSku) matchedBySku += 1;
    if (!existing) existing = byItemId.get(listing.itemId);

    if (existing) {
      // If this item was only found via Item ID (not SKU), eBay's Custom
      // Label still holds whatever was there before this app renumbered
      // anything -- for legacy listings that's the old location code you
      // used to store there. Preserve it in bin_location (once) instead of
      // letting it disappear once we eventually push a real RT-XXXX SKU up.
      // Never overwrite a bin_location you've already filled in by hand.
      const shouldBackfillBinLocation =
        !matchedViaSku && !existing.bin_location && listing.sku && listing.sku !== existing.sku
        && !looksLikeOwnSku(listing.sku);
      if (shouldBackfillBinLocation) binLocationBackfilled += 1;

      updates.push({
        sku: existing.sku,
        fields: {
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
          ebay_primary_photo_url: listing.galleryUrl || existing.ebay_primary_photo_url,
          updated_at: db.fn.now(),
        },
      });
    } else {
      // If eBay's Custom Label already looks like one of our own RT-####
      // SKUs, it IS the real identifier (this row just failed to match
      // above) -- use it directly rather than generating a new number and
      // burying the real SKU in bin_location. Otherwise it's a genuine
      // legacy pre-app location code, preserved in bin_location same as
      // always.
      const ownSku = looksLikeOwnSku(listing.sku);
      const sku = ownSku ? listing.sku : skuFromNumber(++nextSkuNum);
      inserts.push({
        sku,
        item_name: listing.title,
        list_price: listing.price,
        ebay_item_id: listing.itemId,
        status: 'Active',
        first_listed_date: toDateOnly(listing.startTime),
        date_listed: toDateOnly(listing.startTime),
        date_acquired: null,
        ebay_primary_photo_url: listing.galleryUrl || null,
        bin_location: ownSku ? null : listing.sku || null,
      });
      if (!ownSku && listing.sku) binLocationBackfilled += 1;
    }
  }

  // All writes share one held connection/transaction instead of each
  // paying its own connection-acquisition round trip -- the dominant cost
  // against a remote pooled Postgres (Supabase), not the number of bytes
  // moved.
  await db.transaction(async (trx) => {
    for (const { sku, fields } of updates) {
      await trx('inventory').where({ sku }).update(fields);
    }
    if (inserts.length > 0) {
      await trx('inventory').insert(inserts);
    }
  });

  return {
    totalListings: listings.length,
    created: inserts.length,
    updated: updates.length,
    matchedBySku,
    binLocationBackfilled,
  };
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

// Fetches the real tracking number/carrier/ship date for an order that
// eBay reports as FULFILLED -- only called for orders not already marked
// shipped in our own DB, so a normal sync doesn't re-fetch this for every
// past sale every time. Uses the order's own fulfillmentHrefs (present once
// a shipping label -- eBay's own or one whose tracking got pasted into eBay
// -- has been recorded against the order); returns null for anything else,
// including orders shipped via a separate tool (e.g. Pirate Ship) that
// never gets reported back to eBay at all -- those need the manual
// "mark shipped" fallback in the Orders UI instead.
async function fetchShipmentDetails(accessToken, order) {
  if (order.orderFulfillmentStatus !== 'FULFILLED') return null;
  const href = order.fulfillmentHrefs?.[0];
  if (!href) return null;

  const res = await fetch(href, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;

  const data = await res.json();
  return {
    trackingNumber: data.shipmentTrackingNumber || null,
    shippingCarrier: data.shippingCarrierCode || null,
    shippedDate: toDateOnly(data.shippedDate),
  };
}

async function syncSoldOrders() {
  const accessToken = await getAccessToken(['https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly']);
  const orders = await fetchRecentOrders(accessToken);

  let newSales = 0;
  let updatedSales = 0;
  let backfilledInventory = 0;
  let markedShipped = 0;

  for (const order of orders) {
    // Real per-order eBay fee is available immediately at sale time,
    // independent of shipping method -- but only unambiguous to attribute
    // when the order has exactly one line item; skip rather than guess a
    // split for multi-item orders.
    const orderId = order.orderId || null;
    const lineItems = order.lineItems || [];
    const ebayActualFee = lineItems.length === 1 && order.totalMarketplaceFee?.value
      ? Number(order.totalMarketplaceFee.value)
      : null;

    for (const lineItem of lineItems) {
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

      let saleRowId;
      if (existingSale) {
        await db('sales_log').where({ id: existingSale.id }).update({
          sale_price: salePrice,
          shipping_charged: shippingCharged,
          order_id: orderId,
          ebay_actual_fee: ebayActualFee,
          updated_at: db.fn.now(),
        });
        saleRowId = existingSale.id;
        updatedSales += 1;
      } else {
        const [inserted] = await db('sales_log')
          .insert({
            sku: inventoryRow.sku,
            platform: 'eBay',
            sale_date: saleDate,
            sale_price: salePrice,
            shipping_charged: shippingCharged,
            order_id: orderId,
            ebay_actual_fee: ebayActualFee,
          })
          .returning('id');
        saleRowId = inserted?.id ?? inserted;
        newSales += 1;
      }

      // Only worth checking fulfillment for a sale that isn't already
      // marked shipped -- avoids a second HTTP call per past sale on every
      // future sync run.
      if (!existingSale?.shipped_date) {
        const shipment = await fetchShipmentDetails(accessToken, order);
        if (shipment?.trackingNumber) {
          await db('sales_log').where({ id: saleRowId }).update({
            tracking_number: shipment.trackingNumber,
            shipping_carrier: shipment.shippingCarrier,
            shipped_date: shipment.shippedDate,
            updated_at: db.fn.now(),
          });
          markedShipped += 1;
        }
      }
    }
  }

  return { totalOrders: orders.length, newSales, updatedSales, backfilledInventory, markedShipped };
}

async function runSync() {
  const listingsResult = await syncActiveListings();
  const ordersResult = await syncSoldOrders();
  return { listings: listingsResult, orders: ordersResult };
}

module.exports = { syncActiveListings, syncSoldOrders, runSync, looksLikeOwnSku };
