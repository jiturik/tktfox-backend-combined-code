import 'knex';

async function up(knex) {
  await knex.schema.createTable("ms_reserve_vouchers", (table) => {
    table.increments("rv_id").primary();
    table.string("reservation_id");
    table.integer("event_id");
    table.integer("voucher_id");
    table.string("voucher_code");
    table.string("voucher_discount_percent");
    table.enu("rv_is_active", ["Y", "N"]).defaultTo("Y");
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });
}

async function down(knex) {
  await knex.schema.dropTable("ms_reserve_vouchers");
}

export { down, up };
