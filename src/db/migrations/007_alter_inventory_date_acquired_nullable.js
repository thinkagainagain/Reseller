exports.up = function (knex) {
  return knex.schema.alterTable('inventory', (table) => {
    table.date('date_acquired').nullable().alter();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('inventory', (table) => {
    table.date('date_acquired').notNullable().alter();
  });
};
