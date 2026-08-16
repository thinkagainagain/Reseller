exports.up = function (knex) {
  return knex.schema.alterTable('inventory', (table) => {
    table.text('description');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('inventory', (table) => {
    table.dropColumn('description');
  });
};
