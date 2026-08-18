exports.up = function (knex) {
  return knex.schema.alterTable('inventory', (table) => {
    table.decimal('weight_lbs', 6, 2);
    table.decimal('weight_oz', 6, 2);
    table.decimal('package_length', 6, 2);
    table.decimal('package_width', 6, 2);
    table.decimal('package_height', 6, 2);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('inventory', (table) => {
    table.dropColumn('weight_lbs');
    table.dropColumn('weight_oz');
    table.dropColumn('package_length');
    table.dropColumn('package_width');
    table.dropColumn('package_height');
  });
};
