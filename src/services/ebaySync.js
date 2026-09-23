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

// A listing still returned by ActiveList but with nothing left to sell
// (eBay's "Out of Stock" control keeps it listed at 0 qty rather than
// ending it) isn't really active for our purposes -- park an Active row in
// Ended for manual review instead of leaving it look sellable. Only ever
// downgrades a row we already considered Active -- never reopens/overwrites
// one already resolved to Sold, Death Pile, etc. syncSoldOrders (run right
// after this in a full sync) still gets the final say: if it finds a real
// order for this item, it overwrites Ended back to Sold.
function resolveActiveListingStatus(existingStatus, quantityAvailable) {
  if (quantityAvailable !== 0) return 'Active';
  return existingStatus === 'Active' ? 'Ended' : existingStatus;
}

// Decides the SKU for a listing that didn't match any existing inventory row
// (a genuinely new insert). Prefers the listing's own Custom Label when it
// looks like one of our SKUs, but two different eBay listings can carry the
// same stale/copied Custom Label -- confirmed in production, where this
// collided on the DB's unique sku constraint and rolled back the *entire*
// sync batch, not just the one bad listing. `skusUsedThisBatch` is a Set
// this call may add to; `generateNext` mints a fresh sequential SKU (already
// bound to the running counter) each time it's called, and is also used to
// skip past any number an earlier "own SKU" listing in this same batch
// already claimed but that was never actually in the DB to begin with.
function pickSkuForNewListing(rawListingSku, skusUsedThisBatch, generateNext) {
  const ownSku = looksLikeOwnSku(rawListingSku);
  if (ownSku && !skusUsedThisBatch.has(rawListingSku)) {
    skusUsedThisBatch.add(rawListingSku);
    return { sku: rawListingSku, usingOwnSku: true, isDuplicateLabel: false };
  }

  let sku;
  do {
    sku = generateNext();
  } while (skusUsedThisBatch.has(sku));
  skusUsedThisBatch.add(sku);

  return { sku, usingOwnSku: false, isDuplicateLabel: ownSku };
}

// A multi-variation listing (one listing, e.g. 4 colors x 3 each) becomes
// one entry per variation, each matched to its own SKU/inventory row, so the
// per-listing logic below doesn't need to know which kind it's looking at.
// The listing-level SKU (Custom Label) is ignored for these -- each
// variation's own SKU field is what identifies it.
function flattenListing(listing) {
  if (!listing.variations || listing.variations.length === 0) {
    return [{ ...listing, isVariation: false, variantLabel: null }];
  }
  return listing.variations.map((variation) => ({
    ...listing,
    sku: variation.sku,
    price: variation.price || listing.price,
    quantityAvailable: variation.quantityAvailable,
    isVariation: true,
    variantLabel: variation.label,
  }));
}

// Joins eBay's variation aspects ([{ name: 'Color', value: 'Red' }]) the same
// way ebayTradingApi's variationLabel does, so a sale on a variation with no
// SKU can still find the row sync created for it.
function variationLabelFromAspects(aspects) {
  return (aspects || []).map((aspect) => String(aspect.value ?? '').trim()).filter(Boolean).join(' / ') || null;
}

// What an inventory row's status should become once an eBay order for it
// turns up. A one-of-a-kind item is simply Sold. A multi-unit row stays
// Active while eBay still reports units left to sell (syncActiveListings,
// run just before this in a full sync, has already copied eBay's remaining
// count into `quantity` and moved a sold-out row to Ended), so only the
// last unit's sale marks it Sold.
function statusAfterSale(row) {
  if (row.multi_unit && row.status === 'Active' && Number(row.quantity) > 0) return row.status;
  return 'Sold';
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
    'sku', 'status', 'ebay_item_id', 'bin_location', 'first_listed_date', 'date_listed', 'ebay_primary_photo_url',
    'quantity', 'multi_unit', 'variant_label'
  );
  const bySku = new Map(allInventory.map((row) => [row.sku, row]));
  // Variations of one listing all share its Item ID, so an Item ID alone is
  // only a safe fallback match when exactly one row carries it; variations
  // fall back to Item ID + variant label instead.
  const rowsPerItemId = new Map();
  for (const row of allInventory) {
    if (row.ebay_item_id) rowsPerItemId.set(row.ebay_item_id, (rowsPerItemId.get(row.ebay_item_id) || 0) + 1);
  }
  const byItemId = new Map(
    allInventory.filter((row) => row.ebay_item_id && rowsPerItemId.get(row.ebay_item_id) === 1).map((row) => [row.ebay_item_id, row])
  );
  const byItemIdAndLabel = new Map(
    allInventory.filter((row) => row.ebay_item_id && row.variant_label).map((row) => [`${row.ebay_item_id}|${row.variant_label}`, row])
  );
  let nextSkuNum = maxSkuNumber(allInventory);

  const updates = [];
  const inserts = [];
  // Guards against two different listings sharing the same Custom Label on
  // eBay's side (seen in production: a relist or a copied listing can carry
  // over the old SKU) -- without this, the second "ownSku" insert collides
  // with the first on the DB's unique sku constraint and the whole batch
  // transaction below rolls back, silently skipping every listing in this
  // sync, not just the bad one.
  const skusUsedThisBatch = new Set();
  let matchedBySku = 0;
  let binLocationBackfilled = 0;
  let endedOutOfStock = 0;
  let duplicateCustomLabels = 0;
  let endedMissing = 0;

  let variationsSynced = 0;

  for (const listing of listings.flatMap(flattenListing)) {
    if (listing.isVariation) variationsSynced += 1;

    // Match by our own SKU first (set via eBay's "Custom Label" field when
    // you manually list an item you already ran through Intake, or each
    // variation's own SKU field), so an item already tracked as Waiting to
    // List gets updated in place instead of spawning a duplicate row. Falls
    // back to eBay's Item ID (plus variant label, for variations) for
    // listings we've already synced before.
    let existing = listing.sku ? bySku.get(listing.sku) : undefined;
    const matchedViaSku = Boolean(existing);
    if (matchedViaSku) matchedBySku += 1;
    if (!existing) {
      existing = listing.isVariation
        ? byItemIdAndLabel.get(`${listing.itemId}|${listing.variantLabel}`)
        : byItemId.get(listing.itemId);
    }

    // Anything that can hold more than one unit tracks eBay's remaining
    // count; a normal one-of-a-kind listing leaves `quantity` alone.
    const isMultiUnit = listing.isVariation || listing.quantityAvailable > 1 || Boolean(existing?.multi_unit);
    const unitFields = isMultiUnit ? { quantity: listing.quantityAvailable, multi_unit: true } : {};

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

      const newStatus = resolveActiveListingStatus(existing.status, listing.quantityAvailable);
      if (newStatus === 'Ended' && existing.status !== 'Ended') endedOutOfStock += 1;

      updates.push({
        sku: existing.sku,
        fields: {
          item_name: listing.title,
          list_price: listing.price,
          status: newStatus,
          ebay_item_id: listing.itemId,
          // first_listed_date is set once and never overwritten -- it's the
          // "time to list" anchor, so a relist under a new Item ID must not
          // reset it.
          first_listed_date: existing.first_listed_date || toDateOnly(listing.startTime),
          date_listed: toDateOnly(listing.startTime) || existing.date_listed,
          bin_location: shouldBackfillBinLocation ? listing.sku : existing.bin_location,
          // The gallery photo is the whole listing's, not this variation's --
          // don't let it replace a variation's own photo once it has one.
          ebay_primary_photo_url: listing.isVariation
            ? existing.ebay_primary_photo_url || listing.galleryUrl
            : listing.galleryUrl || existing.ebay_primary_photo_url,
          ...unitFields,
          ...(listing.isVariation && !existing.variant_label ? { variant_label: listing.variantLabel } : {}),
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
      const { sku, usingOwnSku, isDuplicateLabel } = pickSkuForNewListing(
        listing.sku,
        skusUsedThisBatch,
        () => skuFromNumber(++nextSkuNum)
      );

      if (isDuplicateLabel) {
        duplicateCustomLabels += 1;
        console.error(
          `[scheduled sync] eBay item ${listing.itemId} has Custom Label "${listing.sku}", which another ` +
            `listing in this same sync already claimed -- generating a new SKU instead. Check eBay for ` +
            'a duplicated/copied listing with a stale Custom Label.'
        );
      }

      inserts.push({
        sku,
        item_name: listing.title,
        list_price: listing.price,
        ebay_item_id: listing.itemId,
        status: isMultiUnit ? resolveActiveListingStatus('Active', listing.quantityAvailable) : 'Active',
        first_listed_date: toDateOnly(listing.startTime),
        date_listed: toDateOnly(listing.startTime),
        date_acquired: null,
        ebay_primary_photo_url: listing.galleryUrl || null,
        bin_location: usingOwnSku ? null : listing.sku || null,
        variant_label: listing.variantLabel,
        ...unitFields,
      });
      if (!usingOwnSku && listing.sku) binLocationBackfilled += 1;
    }
  }

  // A row that was Active last sync but isn't in this fresh ActiveList pull
  // at all (not even at 0 qty) means the listing itself ended on eBay --
  // sold without Out of Stock control, or ended manually. Same Ended
  // treatment as the 0-qty case above, and same deferral to syncSoldOrders
  // for the final word on whether it actually sold.
  const seenItemIds = new Set(listings.map((listing) => listing.itemId));
  const updatedSkus = new Set(updates.map((update) => update.sku));
  for (const row of allInventory) {
    if (row.status !== 'Active' || !row.ebay_item_id) continue;
    if (updatedSkus.has(row.sku)) continue; // already handled above (matched this pull)
    if (seenItemIds.has(row.ebay_item_id)) continue; // shouldn't happen given the check above, but stay safe
    updates.push({ sku: row.sku, fields: { status: 'Ended', updated_at: db.fn.now() } });
    endedMissing += 1;
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
    endedOutOfStock,
    duplicateCustomLabels,
    endedMissing,
    variationsSynced,
  };
}

async function fetchRecentOrders(accessToken, lookbackDays) {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
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

async function syncSoldOrders(lookbackDays = ORDER_LOOKBACK_DAYS) {
  const accessToken = await getAccessToken(['https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly']);
  const orders = await fetchRecentOrders(accessToken, lookbackDays);

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

      const variantLabel = variationLabelFromAspects(lineItem.variationAspects);

      let inventoryRow = null;
      if (lineItemSku) {
        inventoryRow = await db('inventory').where({ sku: lineItemSku }).first();
      }
      if (!inventoryRow && variantLabel) {
        inventoryRow = await db('inventory').where({ ebay_item_id: itemId, variant_label: variantLabel }).first();
      }
      if (!inventoryRow && !variantLabel) {
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
          variant_label: variantLabel,
          multi_unit: Boolean(variantLabel),
        });
        inventoryRow = { sku };
        backfilledInventory += 1;
      } else {
        const newStatus = statusAfterSale(inventoryRow);
        if (newStatus !== inventoryRow.status || inventoryRow.ebay_item_id !== itemId) {
          await db('inventory').where({ sku: inventoryRow.sku }).update({
            status: newStatus,
            ebay_item_id: itemId,
            updated_at: db.fn.now(),
          });
        }
      }

      const salePrice = Number(lineItem.total?.value ?? 0);
      const shippingCharged = Number(lineItem.deliveryCost?.shippingCost?.value ?? 0);
      const saleDate = toDateOnly(order.creationDate);
      const lineItemId = lineItem.lineItemId ? String(lineItem.lineItemId) : null;
      const unitsSold = Number.parseInt(lineItem.quantity, 10) || 1;

      // A multi-unit SKU can sell more than once on the same day, so each
      // eBay line item is its own sale. Falls back to the old SKU + date
      // match only for rows logged before line item IDs were recorded (or
      // logged by hand via Log Sale), never one already claimed by a
      // different line item.
      let existingSale = lineItemId
        ? await db('sales_log').where({ ebay_line_item_id: lineItemId }).first()
        : null;
      if (!existingSale) {
        existingSale = await db('sales_log')
          .where({ sku: inventoryRow.sku, platform: 'eBay', sale_date: saleDate })
          .whereNull('ebay_line_item_id')
          .where((qb) => qb.whereNull('order_id').orWhere('order_id', orderId))
          .first();
      }

      let saleRowId;
      if (existingSale) {
        await db('sales_log').where({ id: existingSale.id }).update({
          sale_price: salePrice,
          shipping_charged: shippingCharged,
          order_id: orderId,
          ebay_actual_fee: ebayActualFee,
          ebay_line_item_id: lineItemId,
          quantity: unitsSold,
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
            ebay_line_item_id: lineItemId,
            quantity: unitsSold,
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

module.exports = {
  syncActiveListings,
  syncSoldOrders,
  runSync,
  looksLikeOwnSku,
  resolveActiveListingStatus,
  pickSkuForNewListing,
  flattenListing,
  variationLabelFromAspects,
  statusAfterSale,
};
