export async function up(knex) {
  await knex.schema.createTable("pass_booking", (table) => {
    table.increments("pass_booking_id").primary();
    table.integer("pass_id");
    table.string("pass_name");
    table.string("reservation_id");
    table.string("customer_id");
    table.string("c_email");
    table.string("c_name");
    table.string("c_country_code");
    table.string("c_phone_number");
    table.string("currency");
    table.string("payment_mode");
    table.string("payment_mode_id");
    table.string("booking_type_name");
    table.enu("is_guest", ["Y", "N"]).defaultTo("Y");
    table.datetime("booking_date_time").defaultTo(knex.fn.now());
    table.datetime("created_by").defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTable("pass_booking");
}
