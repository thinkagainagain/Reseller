exports.up = function (knex) {
  return knex.schema.alterTable('sales_log', (table) => {
    table.string('order_id');
    table.string('tracking_number');
    table.string('shipping_carrier');
    table.date('shipped_date');
    table.decimal('ebay_actual_fee', 10, 2);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('sales_log', (table) => {
    table.dropColumn('order_id');
    table.dropColumn('tracking_number');
    table.dropColumn('shipping_carrier');
    table.dropColumn('shipped_date');
    table.dropColumn('ebay_actual_fee');
  });
};
