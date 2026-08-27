const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const constants = require('../lib/constants');
const { generateListingDraft } = require('../services/aiListingDraft');
const { getAppAccessToken } = require('../services/ebayAuth');
const { getConditionPolicy } = require('../services/ebayMetadata');
const storage = require('../lib/storage');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Category-specific condition options, e.g. Books use New/Like New/Very
// Good/Good/Acceptable while Clothing uses its own New-with-tags/Pre-owned
// scale -- see get_item_condition_policies. Non-fatal: if eBay's Metadata
// API is unreachable or the category has no policy yet, the edit page just
// falls back to the app's static Condition list.
async function loadConditionPolicy(categoryId) {
  if (!categoryId) return null;
  try {
    const token = await getAppAccessToken();
    return await getConditionPolicy(token, categoryId);
  } catch (err) {
    return null;
  }
}

router.get('/inventory', async (req, res) => {
  const items = await db('inventory')
    .where({ status: 'Active' })
    .orderBy('date_acquired', 'desc');
  res.render('inventory/inventory', { items });
});

router.get('/inventory/sold', async (req, res) => {
  const items = await db('inventory')
    .leftJoin('sales_log', 'inventory.sku', 'sales_log.sku')
    .where('inventory.status', 'Sold')
    .select(
      'inventory.sku',
      'inventory.item_name',
      'inventory.bin_location',
      'sales_log.sale_price',
      'sales_log.sale_date',
      'sales_log.platform'
    )
    .orderBy('sales_log.sale_date', 'desc');
  res.render('inventory/sold', { items });
});

router.get('/inventory/death-pile', async (req, res) => {
  const items = await db('inventory')
    .where({ status: 'Death Pile' })
    .orderBy('date_acquired', 'asc');

  const totalTiedUp = items.reduce((sum, item) => sum + Number(item.purchase_cost || 0), 0);

  res.render('inventory/death-pile', { items, totalTiedUp });
});

router.get('/inventory/:sku/edit', async (req, res) => {
  const item = await db('inventory').where({ sku: req.params.sku }).first();
  if (!item) {
    return res.status(404).send('SKU not found');
  }

  const returnMap = { queue: 'queue', 'death-pile': 'death-pile', sold: 'sold' };
  const returnTo = returnMap[req.query.from] || 'inventory';

  const photos = await db('intake_photos').where({ sku: item.sku }).orderBy('id', 'asc');
  const hasPhoto = photos.length > 0;
  const photoUrl = item.ebay_primary_photo_url || (photos[0] ? photos[0].file_path : null);
  const conditionPolicy = await loadConditionPolicy(item.ebay_category_id);

  res.render('inventory/inventory-edit', { item, constants, returnTo, hasPhoto, photoUrl, photos, conditionPolicy, aiDraft: false, error: null });
});

router.post('/inventory/:sku/edit', async (req, res) => {
  const { sku } = req.params;
  const {
    item_name, category, source, condition, purchase_cost, list_price,
    bin_location, status, death_pile_reason, death_pile_action_plan,
    date_acquired, notes, description, brand, item_size, color,
    year_manufactured, country_of_origin, ebay_category_id, ebay_category_name,
    ebay_condition_id, weight_lbs, weight_oz, package_length, package_width,
    package_height, item_type, return_to,
  } = req.body;

  await db('inventory')
    .where({ sku })
    .update({
      item_name: item_name?.trim() || null,
      category: category || null,
      source: source || null,
      condition: condition || null,
      ebay_condition_id: ebay_condition_id || null,
      purchase_cost: purchase_cost === '' ? null : Number(purchase_cost),
      list_price: list_price === '' ? null : Number(list_price),
      bin_location: bin_location?.trim() || null,
      status,
      death_pile_reason: death_pile_reason || null,
      death_pile_action_plan: death_pile_action_plan || null,
      date_acquired: date_acquired || null,
      notes: notes?.trim() || null,
      description: description?.trim() || null,
      brand: brand?.trim() || null,
      item_size: item_size?.trim() || null,
      color: color?.trim() || null,
      year_manufactured: year_manufactured?.trim() || null,
      country_of_origin: country_of_origin?.trim() || null,
      ebay_category_id: ebay_category_id?.trim() || null,
      ebay_category_name: ebay_category_name?.trim() || null,
      weight_lbs: weight_lbs === '' ? null : Number(weight_lbs),
      weight_oz: weight_oz === '' ? null : Number(weight_oz),
      package_length: package_length === '' ? null : Number(package_length),
      package_width: package_width === '' ? null : Number(package_width),
      package_height: package_height === '' ? null : Number(package_height),
      item_type: item_type?.trim() || null,
      updated_at: db.fn.now(),
    });

  const redirectMap = {
    queue: '/intake/queue',
    'death-pile': '/inventory/death-pile',
    sold: '/inventory/sold',
  };
  res.redirect(redirectMap[return_to] || '/inventory');
});

router.post('/inventory/:sku/generate-ai', async (req, res) => {
  const { sku } = req.params;
  const { return_to, clarification } = req.body;

  const item = await db('inventory').where({ sku }).first();
  if (!item) {
    return res.status(404).send('SKU not found');
  }

  const returnMap = { queue: 'queue', 'death-pile': 'death-pile', sold: 'sold' };
  const returnTo = returnMap[return_to] || 'inventory';
  const photos = await db('intake_photos').where({ sku }).orderBy('id', 'asc');
  const hasPhoto = photos.length > 0;
  const photoUrl = item.ebay_primary_photo_url || (photos[0] ? photos[0].file_path : null);

  try {
    const draft = await generateListingDraft(sku, clarification?.trim() || null);
    const notes = item.notes && draft.notes
      ? `${draft.notes}\n\n---\n\n${item.notes}`
      : draft.notes || item.notes;
    const draftEbayCategoryId = draft.ebay_category_id ?? item.ebay_category_id;
    res.render('inventory/inventory-edit', {
      item: {
        ...item,
        item_name: draft.title,
        description: draft.description,
        brand: draft.brand ?? item.brand,
        item_size: draft.item_size ?? item.item_size,
        color: draft.color ?? item.color,
        year_manufactured: draft.year_manufactured ?? item.year_manufactured,
        country_of_origin: draft.country_of_origin ?? item.country_of_origin,
        list_price: draft.list_price ?? item.list_price,
        category: draft.category,
        condition: draft.condition,
        ebay_category_id: draftEbayCategoryId,
        ebay_category_name: draft.ebay_category_name ?? item.ebay_category_name,
        notes,
      },
      constants,
      returnTo,
      hasPhoto,
      photoUrl,
      photos,
      conditionPolicy: await loadConditionPolicy(draftEbayCategoryId),
      aiDraft: true,
      error: null,
    });
  } catch (err) {
    res.render('inventory/inventory-edit', {
      item,
      constants,
      returnTo,
      hasPhoto,
      photoUrl,
      photos,
      conditionPolicy: await loadConditionPolicy(item.ebay_category_id),
      aiDraft: false,
      error: err.message,
    });
  }
});

router.post('/inventory/:sku/photos', upload.array('photos', 10), async (req, res) => {
  const { sku } = req.params;
  const { return_to } = req.body;

  const item = await db('inventory').where({ sku }).first();
  if (!item) {
    return res.status(404).send('SKU not found');
  }

  if (req.files && req.files.length > 0) {
    // Filenames are positional (1.jpg, 2.jpg, ...) -- start counting from
    // how many photos this SKU already has, not from 1, or a second upload
    // would silently overwrite the first batch's files.
    const existingCount = Number(
      (await db('intake_photos').where({ sku }).count('* as c').first()).c
    );
    const photoRows = [];
    for (const [index, file] of req.files.entries()) {
      const ext = path.extname(file.originalname) || '.jpg';
      const filename = `${existingCount + index + 1}${ext}`;
      await storage.putObject(`${sku}/${filename}`, file.buffer);
      photoRows.push({ sku, file_path: `/uploads/${sku}/${filename}` });
    }
    await db('intake_photos').insert(photoRows);
  }

  res.redirect(`/inventory/${sku}/edit${return_to ? `?from=${return_to}` : ''}`);
});

router.post('/inventory/:sku/photos/:photoId/delete', async (req, res) => {
  const { sku, photoId } = req.params;
  const { return_to } = req.body;

  const photo = await db('intake_photos').where({ id: photoId, sku }).first();
  if (photo) {
    await db('intake_photos').where({ id: photoId }).del();
    const storageKey = photo.file_path.replace(/^\/uploads\//, '');
    await storage.deleteObject(storageKey);
  }

  res.redirect(`/inventory/${sku}/edit${return_to ? `?from=${return_to}` : ''}`);
});

router.post('/inventory/:sku/delete', async (req, res) => {
  const { sku } = req.params;
  const { return_to } = req.body;

  await db.transaction(async (trx) => {
    await trx('intake_photos').where({ sku }).del();
    await trx('inventory').where({ sku }).del();
  });

  await storage.deleteByPrefix(sku);

  const redirectMap = {
    queue: '/intake/queue',
    'death-pile': '/inventory/death-pile',
    sold: '/inventory/sold',
  };
  res.redirect(redirectMap[return_to] || '/inventory');
});

module.exports = router;
