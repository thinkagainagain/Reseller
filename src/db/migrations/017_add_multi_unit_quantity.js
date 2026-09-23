// Multi-unit items: one SKU can now stand for several identical units (e.g.
// 3 of the same mug in Red, listed as one variation of an eBay multi-
// variation listing). `quantity` is units still unsold -- eBay's own count
// is the source of truth once listed, sync copies it down. `multi_unit`
// marks rows whose status should only flip to Sold once that count hits 0,
// rather than on the first sale like a normal one-of-a-kind item.
exports.up = async function (knex) {
  await knex.schema.alterTable('inventory', (table) => {
    table.integer('quantity').notNullable().defaultTo(1);
    table.string('variant_label');
    table.boolean('multi_unit').notNullable().defaultTo(false);
  });
  await knex.schema.alterTable('sales_log', (table) => {
    table.integer('quantity').notNullable().defaultTo(1);
    table.string('ebay_line_item_id');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('sales_log', (table) => {
    table.dropColumn('quantity');
    table.dropColumn('ebay_line_item_id');
  });
  await knex.schema.alterTable('inventory', (table) => {
    table.dropColumn('quantity');
    table.dropColumn('variant_label');
    table.dropColumn('multi_unit');
  });
};
