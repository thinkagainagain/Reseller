exports.up = function (knex) {
  return knex.schema.createTable('platform_fees', (table) => {
    table.string('platform').primary();
    table.decimal('fee_percent', 6, 4).notNullable();
    table.decimal('flat_fee', 8, 2).notNullable().defaultTo(0);
    table.string('notes');
    table.date('last_verified');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('platform_fees');
};
