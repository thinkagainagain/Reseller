exports.up = function (knex) {
  return knex.schema.alterTable('inventory', (table) => {
    table.string('item_type');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('inventory', (table) => {
    table.dropColumn('item_type');
  });
};
