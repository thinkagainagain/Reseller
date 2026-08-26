exports.up = function (knex) {
  return knex.schema.alterTable('inventory', (table) => {
    table.string('ebay_primary_photo_url');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('inventory', (table) => {
    table.dropColumn('ebay_primary_photo_url');
  });
};
