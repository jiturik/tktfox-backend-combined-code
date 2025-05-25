import 'knex';

async function up(knex) {
  await knex.schema.createTable("ms_vouchers", (table) => {
    table.increments("voucher_id").primary();
    table.integer("event_id");
    table.string("voucher_code");
    table.integer("min_seats_required").defaultTo(1);
    table.integer("max_seats_required").defaultTo(1);
    table.integer("max_transaction_per_user").defaultTo(1);
    table.integer("total_available_voucher").defaultTo(0);
    table.float("voucher_discount_value").defaultTo(0);
    table.enu("discount_type", ["percent"]).defaultTo("percent");
    table.enu("voucher_is_active", ["Y", "N"]).defaultTo("Y");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });
}

async function down(knex) {
  await knex.schema.dropTable("ms_vouchers");
}

export { down, up };
