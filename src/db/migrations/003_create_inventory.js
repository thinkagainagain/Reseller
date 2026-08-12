exports.up = function (knex) {
  return knex.schema.createTable('inventory', (table) => {
    table.string('sku').primary();
    table.string('bin_location');
    table.string('item_name');
    table.string('category');
    table.string('source');
    table.date('date_acquired').notNullable();
    table.decimal('purchase_cost', 10, 2);
    table.string('condition');
    table.decimal('list_price', 10, 2);
    table.string('ebay_item_id');
    table.date('first_listed_date');
    table.date('date_listed');
    table.string('status').notNullable().defaultTo('Intake');
    table.string('death_pile_reason');
    table.string('death_pile_action_plan');
    table.text('notes');
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('inventory');
};
