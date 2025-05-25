import 'knex';

async function up(knex) {
  await knex.schema.createTable("ms_payment_mode", (table) => {
    table.increments("pm_id").primary();
    table.string("payment_mode_name");
    table.enu("payment_mode_is_active", ["Y", "N"]).defaultTo("Y");
  });

  await knex.schema.createTable("ms_payment_credential", (table) => {
    table.increments("pm_c_id").primary();
    table.integer("pm_id");
    table.integer("cinema_id");
    table.text("credential");
  });

  await knex.schema.createTable("ms_payment_booking_detail", (table) => {
    table.increments("pbd_id").primary();
    table.string("reservation_id");
    table.string("success_frontend_url");
    table.string("failed_frontend_url");
    table.string("email");
    table.string("phone_number");
    table.string("country_code");
    table.text("payment_capture");
    table.enu("is_guest", ["Y", "N"]).defaultTo("N");
    table.enu("is_booked", ["Y", "N"]).defaultTo("N");
    table.enu("is_refund", ["Y", "N"]).defaultTo("N");
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable("ms_reservation", (table) => {
    table.integer("seat_release_time").defaultTo(10);
  });

  await knex("ms_payment_mode").insert({
    pm_id: "1",
    payment_mode_name: "Tap pay",
  });

  await knex("ms_payment_credential").insert({
    pm_id: "1",
    cinema_id: null,
    credential: JSON.stringify({
      MERCHANT_ID: "",
      SOURCE_ID: "src_all",
      URL: "https://api.tap.company/v2/charges",
      PAYTAP_SECRET_KEY: "",
    }),
  });
}

async function down(knex) {
  await knex.schema.dropTable("ms_payment_mode");
  await knex.schema.dropTable("ms_payment_credential");
  await knex.schema.dropTable("ms_payment_booking_detail");
  await knex.schema.alterTable("ms_reservation", (table) => {
    table.dropColumn("seat_release_time");
  });
}

export { down, up };
