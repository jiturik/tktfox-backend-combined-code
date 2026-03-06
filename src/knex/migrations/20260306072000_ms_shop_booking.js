export async function up(knex) {
  await knex.schema.createTable("ms_shop_booking", (table) => {
    table.increments("booking_id").primary();

    table.string("booking_code");
    table.string("reservation_id");

    table.string("c_email").nullable();
    table.string("c_name").nullable();
    table.string("c_country_code").nullable();
    table.string("c_phone_number").nullable();
    table.integer("customer_id").defaultTo(0);

    table.string("payment_transaction_id").nullable();
    table.string("payment_mode").nullable();
    table.string("payment_mode_id").nullable();
    table.string("booking_type_name").nullable();

    table.enu("is_guest", ["Y", "N"]).defaultTo("Y");

    table.text("total_price").nullable();
    table.string("voucher_code").nullable();
    table.string("discount_percent").nullable();
    table.string("discount_value").nullable();
    table.string("total_before_discount").nullable();

    table.integer("pay_currency_id").nullable();
    table.string("exchange_rate").nullable();

    table.enu("ticket_sent", ["Y", "N"]).defaultTo("N");
    table.enu("booking_is_active", ["Y", "N"]).defaultTo("Y");

    table.datetime("booking_date_time").defaultTo(knex.fn.now());
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTable("ms_shop_booking");
}

