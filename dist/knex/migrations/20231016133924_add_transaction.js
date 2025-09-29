async function up(knex) {
  await knex.schema.createTable("ms_booking", (table) => {
    table.increments("booking_id").primary();
    table.integer("event_id");
    table.integer("schedule_id");
    table.string("booking_code");
    table.string("reservation_id");
    table.string("c_email");
    table.string("c_name");
    table.string("c_country_code");
    table.string("c_phone_number");
    table.string("event_name");
    table.string("cinema_name");
    table.string("cinema_email");
    table.string("city_name");
    table.string("country");
    table.string("timezone");
    table.string("currency");
    table.string("payment_mode");
    table.string("payment_mode_id");
    table.string("booking_type_name");
    table.enu("is_guest", ["Y", "N"]).defaultTo("Y");
    table.date("event_date");
    table.time("event_time");
    table.datetime("booking_date_time").defaultTo(knex.fn.now());
    table.datetime("created_by").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("ms_booking_transaction", (table) => {
    table.increments("t_id").primary();
    table.integer("booking_id");
    table.string("seat_name");
    table.string("seat_type");
    table.string("seat_group_id");
    table.decimal("seat_price", 11, 4);
  });
}

async function down(knex) {
  await knex.schema.dropTable("ms_booking");
  await knex.schema.dropTable("ms_booking_transaction");
}

export { down, up };
