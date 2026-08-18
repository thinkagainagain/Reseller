exports.up = function (knex) {
  return knex.schema.alterTable('inventory', (table) => {
    table.date('date_submitted');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('inventory', (table) => {
    table.dropColumn('date_submitted');
  });
};
