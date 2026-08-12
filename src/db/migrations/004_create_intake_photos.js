exports.up = function (knex) {
  return knex.schema.createTable('intake_photos', (table) => {
    table.increments('id').primary();
    table.string('sku').notNullable().references('sku').inTable('inventory').onDelete('CASCADE');
    table.string('file_path').notNullable();
    table.datetime('taken_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('intake_photos');
};
