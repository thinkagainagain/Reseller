exports.up = function (knex) {
  return knex.schema.alterTable('inventory', (table) => {
    table.string('brand');
    table.string('item_size');
    table.string('color');
    table.string('year_manufactured');
    table.string('country_of_origin');
    table.string('ebay_category_id');
    table.string('ebay_category_name');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('inventory', (table) => {
    table.dropColumn('brand');
    table.dropColumn('item_size');
    table.dropColumn('color');
    table.dropColumn('year_manufactured');
    table.dropColumn('country_of_origin');
    table.dropColumn('ebay_category_id');
    table.dropColumn('ebay_category_name');
  });
};
