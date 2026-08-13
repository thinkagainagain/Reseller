const db = require('../db');
const nextSku = require('../lib/nextSku');
const { getAccessToken } = require('./ebayAuth');
const { getActiveListings } = require('./ebayTradingApi');

const FULFILLMENT_ORDER_URL = 'https://api.ebay.com/sell/fulfillment/v1/order';
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

  for (const listing of listings) {
    const existing = await db('inventory').where({ ebay_item_id: listing.itemId }).first();

    if (existing) {
      await db('inventory').where({ sku: existing.sku }).update({
        item_name: listing.title,
        list_price: listing.price,
        date_listed: toDateOnly(listing.startTime) || existing.date_listed,
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
      });
      created += 1;
    }
  }

  return { totalListings: listings.length, created, updated };
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

      let inventoryRow = await db('inventory').where({ ebay_item_id: itemId }).first();

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
      } else if (inventoryRow.status !== 'Sold') {
        await db('inventory').where({ sku: inventoryRow.sku }).update({ status: 'Sold', updated_at: db.fn.now() });
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
