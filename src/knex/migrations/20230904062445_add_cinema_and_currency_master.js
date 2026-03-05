export async function up(knex) {
  await knex.schema.createTable("ms_currencies", (table) => {
    table.increments("curr_id").primary();
    table.string("curr_code");
    table.string("curr_name");
    table.enu("curr_is_active", ["Y", "N"]).defaultTo("Y");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("ms_cinemas", (table) => {
    table.increments("cinema_id").primary();
    table.integer("org_id");
    table.integer("country_id");
    table.integer("city_id");
    table.integer("timezone_id");
    table.integer("currency_id");
    table.string("cinema_name");
    table.string("cinema_address");
    table.string("cinema_pincode");
    table.string("cinema_lat");
    table.string("cinema_long");
    table.string("cinema_email");
    table.string("cinema_cont_per_name");
    table.string("cinema_cont_per_number");
    table.string("cinema_description");
    table.integer("cinema_seat_release_time");
    table.enu("cinema_is_active", ["Y", "N"]).defaultTo("Y");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTable("ms_currencies");
  await knex.schema.dropTable("ms_cinemas");
}
