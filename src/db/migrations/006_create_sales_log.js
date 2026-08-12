exports.up = function (knex) {
  return knex.schema.createTable('sales_log', (table) => {
    table.increments('id').primary();
    table.string('sku').notNullable().references('sku').inTable('inventory').onDelete('CASCADE');
    table.string('platform').notNullable().references('platform').inTable('platform_fees');
    table.date('sale_date').notNullable();
    table.decimal('sale_price', 10, 2).notNullable();
    table.decimal('shipping_charged', 10, 2).notNullable().defaultTo(0);
    table.decimal('shipping_cost', 10, 2);
    table.decimal('other_fees', 10, 2).notNullable().defaultTo(0);
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('sales_log');
};
