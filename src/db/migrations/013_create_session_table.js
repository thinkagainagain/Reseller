// Standard connect-pg-simple schema (https://github.com/voxpelli/node-connect-pg-simple#table-schema).
// Created via migration rather than connect-pg-simple's own createTableIfMissing
// so two instances booting at once can't race on table-creation DDL.
exports.up = function (knex) {
  return knex.schema.createTable('session', (table) => {
    table.string('sid').notNullable().primary();
    table.json('sess').notNullable();
    table.specificType('expire', 'timestamp(6)').notNullable();
    table.index('expire', 'idx_session_expire');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('session');
};
