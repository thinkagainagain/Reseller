exports.up = function (knex) {
  return knex.schema.createTable('listing_history', (table) => {
    table.increments('id').primary();
    table.string('sku').notNullable().references('sku').inTable('inventory').onDelete('CASCADE');
    table.string('ebay_item_id').notNullable();
    table.date('start_date').notNullable();
    table.date('end_date');
    table.string('end_reason');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('listing_history');
};
